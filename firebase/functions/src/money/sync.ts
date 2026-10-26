import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";

import {ENTITIES} from "../entities/entityModel";
import {backoffMinutes, reconcileOnce as reconcileEntities, TRIGGER_RETRIES, type SyncOutcome} from "../entities/sync";
import {platformRedelivers} from "../ledger/getHlClient";
import {HlError, isNotConnected, plainHlMessage, type HlClient, type HlLeg, type HlPostingType} from "../ledger/hlClient";
import {accountCache, categoryAccountName, registerAccountName} from "./hlAccounts";
import {EXPENSE_CATEGORIES, MONEY_ENTRIES, REGISTERS, SYSTEM_ACCOUNTS, moneySourceIds, type MoneyAccountRef} from "./moneyModel";

/**
 * Posting money to Humble Ledger (brief §4). Same spine as entities: transient failure →
 * FAILED + redelivered (capped by the doc's own syncAttempts), permanent → FAILED, books
 * not connected → nothing written (stays PENDING).
 *
 * The routing order is LOAD-BEARING:
 *   0. a reversal → the original's own legs, flipped (postingType REVERSAL)
 *   1. a correction (one side ADJUSTMENT) → JOURNAL, DR `to`, CR `from`, the adjustment
 *      side being "Balance Adjustments" (party) or "Cash Over and Short" (register) —
 *      first, or ADJUSTMENT→PARTY would post as a payout of cash we never handed over
 *   2. an expense → EXPENSE: DR category (taxable), DR Input CGST/SGST or IGST, CR register
 *   3. party → register → /payments          4. register → party → /customer-payouts
 *   5. party → party → JOURNAL                6. register → register → JOURNAL
 * Every side is resolved BEFORE anything is posted: a party not in the books yet, or a
 * register/category without its HL account yet, leaves the entry PENDING untouched (no
 * rewrite → no hot loop; the reconcile picks it up). A missing, archived or wrong-kind
 * one is a permanent failure.
 */

class Permanent extends Error {}
class Waiting extends Error {}

async function fail(ref: admin.firestore.DocumentReference, id: string, e: unknown, priorAttempts: number, fromTrigger: boolean): Promise<SyncOutcome> {
  if (isNotConnected(e)) {
    logger.warn("Books not connected — left PENDING", {path: ref.path});
    return "skipped";
  }
  const permanent = e instanceof Permanent || (e instanceof HlError && !e.transient);
  logger.error("Posting to HL failed", {path: ref.path, permanent, error: e instanceof Error ? e.message : String(e)});
  await ref.set(
    {
      syncStatus: "FAILED",
      hlSyncError: e instanceof Permanent ? e.message : plainHlMessage(e),
      syncAttempts: FieldValue.increment(1),
      lastSyncAttemptAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
  if (!permanent && fromTrigger && priorAttempts < TRIGGER_RETRIES && platformRedelivers()) throw e;
  return "failed";
}

// ─── Registers & categories: pin the HL account once, post the opening once ─────

export async function syncRegister(db: admin.firestore.Firestore, hl: HlClient, id: string, opts: {fromTrigger?: boolean} = {}): Promise<SyncOutcome> {
  if (hl.mode === "off") return "skipped";
  const ref = db.collection(REGISTERS).doc(id);
  const d = (await ref.get()).data();
  if (!d || d.deleted === true || d.syncStatus === "SYNCED") return "skipped";
  const prior = Number(d.syncAttempts ?? 0);
  try {
    const account = accountCache(hl);
    const accountId: string = d.hlAccountId ?? (await account(registerAccountName(d.kind, d.name, id), "ASSET")).id;
    let opening = d.opening ?? null;
    if (opening && opening.posted !== true) {
      if (opening.amountPaise === 0) {
        opening = {...opening, posted: true, hlTxnId: null};
      } else {
        const equity = (await account(SYSTEM_ACCOUNTS.openingEquity.name, "EQUITY")).id;
        const up = opening.amountPaise > 0;
        const amount = Math.abs(opening.amountPaise);
        const r = await hl.postTransaction({
          postingType: "JOURNAL",
          description: `Opening balance · ${d.name}`,
          date: opening.asOf,
          sourceId: moneySourceIds.registerOpening(id),
          actorRef: String(d.updatedBy?.uid ?? "system"),
          legs: [
            {accountId, type: up ? "DEBIT" : "CREDIT", amountPaise: amount},
            {accountId: equity, type: up ? "CREDIT" : "DEBIT", amountPaise: amount},
          ],
        });
        opening = {...opening, posted: true, hlTxnId: r.txnId};
      }
    }
    await db.runTransaction(async (tx) => {
      const latest = (await tx.get(ref)).data();
      if (!latest) return;
      const openingAddedMeanwhile = Boolean(latest.opening && !d.opening);
      tx.set(
        ref,
        {
          // Stamped ONCE — never replaced.
          hlAccountId: latest.hlAccountId ?? accountId,
          ...(opening && !openingAddedMeanwhile ? {opening} : {}),
          syncStatus: openingAddedMeanwhile ? "PENDING" : "SYNCED",
          hlSyncError: null,
          syncAttempts: 0,
          lastSyncAttemptAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    });
    return "synced";
  } catch (e) {
    return fail(ref, id, e, prior, opts.fromTrigger === true);
  }
}

export async function syncCategory(db: admin.firestore.Firestore, hl: HlClient, id: string, opts: {fromTrigger?: boolean} = {}): Promise<SyncOutcome> {
  if (hl.mode === "off") return "skipped";
  const ref = db.collection(EXPENSE_CATEGORIES).doc(id);
  const d = (await ref.get()).data();
  if (!d || d.deleted === true || d.syncStatus === "SYNCED") return "skipped";
  const prior = Number(d.syncAttempts ?? 0);
  try {
    const accountId: string = d.hlAccountId ?? (await accountCache(hl)(categoryAccountName(d.name, id), "EXPENSE")).id;
    await db.runTransaction(async (tx) => {
      const latest = (await tx.get(ref)).data();
      if (!latest) return;
      tx.set(ref, {hlAccountId: latest.hlAccountId ?? accountId, syncStatus: "SYNCED", hlSyncError: null, syncAttempts: 0, lastSyncAttemptAt: FieldValue.serverTimestamp()}, {merge: true});
    });
    return "synced";
  } catch (e) {
    return fail(ref, id, e, prior, opts.fromTrigger === true);
  }
}

// ─── Money entries ────────────────────────────────────────────────────────────

interface Side {
  ref: MoneyAccountRef;
  /** The HL account this side posts to (null for ADJUSTMENT until routed). */
  accountId: string | null;
  /** HL customer id, for a party. */
  customerId: string | null;
}

async function resolveSide(db: admin.firestore.Firestore, ref: MoneyAccountRef): Promise<Side> {
  if (ref.kind === "ADJUSTMENT") return {ref, accountId: null, customerId: null};
  if (ref.kind === "PARTY") {
    const e = (await db.collection(ENTITIES).doc(ref.entityId).get()).data();
    if (!e || e.deleted === true) throw new Permanent(`${ref.name} no longer exists.`);
    if (e.syncStatus !== "SYNCED" || !e.hlCustomerId || !e.hlAccountId) throw new Waiting(`${ref.name} isn't in the books yet`);
    return {ref, accountId: String(e.hlAccountId), customerId: String(e.hlCustomerId)};
  }
  if (ref.kind === "EXPENSE") {
    const c = (await db.collection(EXPENSE_CATEGORIES).doc(ref.categoryId).get()).data();
    if (!c || c.deleted === true) throw new Permanent(`The category ${ref.name} no longer exists.`);
    if (c.isActive === false) throw new Permanent(`The category ${ref.name} is archived.`);
    if (!c.hlAccountId) throw new Waiting(`${ref.name} isn't in the books yet`);
    return {ref, accountId: String(c.hlAccountId), customerId: null};
  }
  const r = (await db.collection(REGISTERS).doc(ref.registerId).get()).data();
  if (!r || r.deleted === true) throw new Permanent(`${ref.name} no longer exists.`);
  if (r.isActive === false) throw new Permanent(`${r.name} is archived.`);
  if (r.kind !== ref.kind) throw new Permanent(`${r.name} isn't a ${ref.kind.toLowerCase()} account.`);
  if (!r.hlAccountId) throw new Waiting(`${r.name} isn't in the books yet`);
  return {ref, accountId: String(r.hlAccountId), customerId: null};
}

const name = (r: MoneyAccountRef) => (r.kind === "ADJUSTMENT" ? "Adjustment" : r.name);
const isReg = (r: MoneyAccountRef) => r.kind === "CASH" || r.kind === "BANK";

export async function syncMoneyEntry(db: admin.firestore.Firestore, hl: HlClient, id: string, opts: {fromTrigger?: boolean} = {}): Promise<SyncOutcome> {
  if (hl.mode === "off") return "skipped";
  const ref = db.collection(MONEY_ENTRIES).doc(id);
  const e = (await ref.get()).data();
  if (!e || e.deleted === true || e.syncStatus === "SYNCED") return "skipped";
  const prior = Number(e.syncAttempts ?? 0);
  const sourceId = moneySourceIds.entry(id);
  const actorRef = String(e.createdBy?.uid ?? "system");
  const note: string = e.note ?? "";

  try {
    // Resolve every side before posting anything.
    const [from, to] = await Promise.all([resolveSide(db, e.from), resolveSide(db, e.to)]);
    const account = accountCache(hl);
    let legs: HlLeg[];
    let txnId: string;

    const journal = async (postingType: HlPostingType, description: string, l: HlLeg[]) => {
      legs = l;
      txnId = (await hl.postTransaction({postingType, description, date: e.businessDay, sourceId, actorRef, legs: l})).txnId;
    };

    if (e.reversesEntryId) {
      // 0. Reversal: the original's recorded legs, flipped — exact for every route (GST too).
      const o = (await db.collection(MONEY_ENTRIES).doc(String(e.reversesEntryId)).get()).data();
      if (!o?.hlLegs || !Array.isArray(o.hlLegs)) throw new Permanent("The original entry isn't in the books.");
      const flipped = (o.hlLegs as HlLeg[]).map((l) => ({...l, type: l.type === "DEBIT" ? ("CREDIT" as const) : ("DEBIT" as const)}));
      await journal("REVERSAL", note || "Reversal", flipped);
    } else if (e.isCorrection) {
      // 1. Correction — FIRST.
      const partySide = from.ref.kind === "PARTY" || to.ref.kind === "PARTY";
      const adj = partySide ? SYSTEM_ACCOUNTS.balanceAdjustments : SYSTEM_ACCOUNTS.cashOverShort;
      const adjId = (await account(adj.name, adj.type)).id;
      const fromId = from.accountId ?? adjId;
      const toId = to.accountId ?? adjId;
      await journal("JOURNAL", `Correction: ${note}`, [
        {accountId: toId, type: "DEBIT", amountPaise: e.amountPaise},
        {accountId: fromId, type: "CREDIT", amountPaise: e.amountPaise},
      ]);
    } else if (to.ref.kind === "EXPENSE") {
      // 2. Expense, with GST input when there's a bill.
      if (!isReg(from.ref) || !from.accountId || !to.accountId) throw new Permanent("An expense must be paid from cash or a bank.");
      const g = e.gst;
      const l: HlLeg[] = [{accountId: to.accountId, type: "DEBIT", amountPaise: g ? g.taxablePaise : e.amountPaise}];
      if (g) {
        for (const [paise, acct] of [
          [g.cgstPaise, SYSTEM_ACCOUNTS.inputCgst],
          [g.sgstPaise, SYSTEM_ACCOUNTS.inputSgst],
          [g.igstPaise, SYSTEM_ACCOUNTS.inputIgst],
        ] as const) {
          if (paise > 0) l.push({accountId: (await account(acct.name, acct.type, true)).id, type: "DEBIT", amountPaise: paise});
        }
      }
      l.push({accountId: from.accountId, type: "CREDIT", amountPaise: e.amountPaise});
      await journal("EXPENSE", `${name(to.ref)}${note ? `: ${note}` : ""}${g ? ` (bill ${g.billNo}, ${g.supplier.name})` : ""}`, l);
    } else if (from.ref.kind === "PARTY" && isReg(to.ref)) {
      // 3. Money received.
      const r = await hl.postPayment({
        customerId: from.customerId!,
        amountPaise: e.amountPaise,
        method: to.ref.kind as "CASH" | "BANK",
        paymentAccountId: to.accountId!,
        date: e.businessDay,
        sourceId,
        actorRef,
        description: note ? `Payment received: ${note}` : "Payment received",
      });
      legs = [
        {accountId: to.accountId!, type: "DEBIT", amountPaise: e.amountPaise},
        {accountId: from.accountId!, type: "CREDIT", amountPaise: e.amountPaise},
      ];
      txnId = r.txnId;
    } else if (isReg(from.ref) && to.ref.kind === "PARTY") {
      // 4. Money paid.
      const r = await hl.postPayout({
        customerId: to.customerId!,
        amountPaise: e.amountPaise,
        method: from.ref.kind as "CASH" | "BANK",
        paymentAccountId: from.accountId!,
        date: e.businessDay,
        sourceId,
        actorRef,
        description: note ? `Payment made: ${note}` : "Payment made",
      });
      legs = [
        {accountId: to.accountId!, type: "DEBIT", amountPaise: e.amountPaise},
        {accountId: from.accountId!, type: "CREDIT", amountPaise: e.amountPaise},
      ];
      txnId = r.txnId;
    } else if (from.ref.kind === "PARTY" && to.ref.kind === "PARTY") {
      // 5. Balance moved: `to` owes more, `from` owes less.
      await journal("JOURNAL", `Balance moved from ${name(from.ref)} to ${name(to.ref)}${note ? `: ${note}` : ""}`, [
        {accountId: to.accountId!, type: "DEBIT", amountPaise: e.amountPaise},
        {accountId: from.accountId!, type: "CREDIT", amountPaise: e.amountPaise},
      ]);
    } else if (isReg(from.ref) && isReg(to.ref)) {
      // 6. Deposit / withdrawal / transfer.
      await journal("JOURNAL", `Transfer from ${name(from.ref)} to ${name(to.ref)}${note ? `: ${note}` : ""}`, [
        {accountId: to.accountId!, type: "DEBIT", amountPaise: e.amountPaise},
        {accountId: from.accountId!, type: "CREDIT", amountPaise: e.amountPaise},
      ]);
    } else {
      throw new Permanent("This kind of entry can't be posted.");
    }

    await ref.set(
      {syncStatus: "SYNCED", hlTxnId: txnId!, hlLegs: legs!, hlSyncError: null, syncAttempts: 0, hlSyncedAt: FieldValue.serverTimestamp(), lastSyncAttemptAt: FieldValue.serverTimestamp()},
      {merge: true},
    );
    return "synced";
  } catch (err) {
    if (err instanceof Waiting) {
      logger.info("Money entry waiting for a dependency", {entryId: id, why: err.message});
      return "skipped"; // left PENDING, untouched
    }
    return fail(ref, id, err, prior, opts.fromTrigger === true);
  }
}

// ─── Reconcile (every 10 minutes; also called directly by the emulator tests) ────

const STALE_MS = 3 * 60_000;
const MAX_AUTO_ATTEMPTS = 10;
const ms = (t: unknown) => (t instanceof admin.firestore.Timestamp ? t.toMillis() : 0);

async function sweep(
  db: admin.firestore.Firestore,
  collection: string,
  sync: (id: string) => Promise<SyncOutcome>,
  now: number,
) {
  const snap = await db.collection(collection).where("syncStatus", "in", ["PENDING", "FAILED"]).limit(400).get();
  const due = snap.docs
    .filter((doc) => {
      const d = doc.data();
      if (d.deleted === true) return false;
      if (now - ms(d.updatedAt ?? d.createdAt) < STALE_MS) return false;
      const attempts = Number(d.syncAttempts ?? 0);
      if (attempts >= MAX_AUTO_ATTEMPTS) return false;
      return attempts === 0 || now - ms(d.lastSyncAttemptAt) >= backoffMinutes(attempts) * 60_000;
    })
    .slice(0, 200);
  const r = {tried: 0, synced: 0, failed: 0};
  for (const doc of due) {
    r.tried += 1;
    const outcome = await sync(doc.id);
    if (outcome === "synced") r.synced += 1;
    else if (outcome === "failed") r.failed += 1;
  }
  return r;
}

/** One pass, in dependency order: entities → registers → categories → money entries. */
export async function reconcileLedgerOnce(db: admin.firestore.Firestore, hl: HlClient, now = Date.now()) {
  if (hl.mode === "off") return {notConnected: true};
  const entities = await reconcileEntities(db, hl, now);
  const registers = await sweep(db, REGISTERS, (id) => syncRegister(db, hl, id), now);
  const categories = await sweep(db, EXPENSE_CATEGORIES, (id) => syncCategory(db, hl, id), now);
  const entries = await sweep(db, MONEY_ENTRIES, (id) => syncMoneyEntry(db, hl, id), now);
  return {notConnected: false, entities, registers, categories, entries};
}

/**
 * Once a party / register / category is in the books, post the entries that were
 * waiting on it straight away rather than at the next reconcile (an improvement on the
 * brief — the reconcile still covers anything missed).
 */
export async function postWaitingFor(db: admin.firestore.Firestore, hl: HlClient, sideId: string) {
  if (hl.mode === "off") return;
  const waiting = await db.collection(MONEY_ENTRIES).where("sideIds", "array-contains", sideId).where("syncStatus", "==", "PENDING").limit(50).get();
  for (const d of waiting.docs) await syncMoneyEntry(db, hl, d.id);
}
