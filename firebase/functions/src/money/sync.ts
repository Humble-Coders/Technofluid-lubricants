import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";

import {ENTITIES, hlAmountToPaise} from "../entities/entityModel";
import {backoffMinutes, reconcileOnce as reconcileEntities, TRIGGER_RETRIES, type SyncOutcome} from "../entities/sync";
import {platformRedelivers} from "../ledger/getHlClient";
import {HlError, isNotConnected, plainHlMessage, type HlClient, type HlLeg, type HlPostingType} from "../ledger/hlClient";
import {SALES} from "../sales/saleModel";
import {cancelSaleInBooks, syncSale} from "../sales/sync";
import {PURCHASES} from "../purchases/purchaseModel";
import {cancelPurchaseInBooks, syncPurchase} from "../purchases/sync";
import {accountCache, categoryAccountName, companyAccountName, companySideId, registerAccountName} from "./hlAccounts";
import {MAIN_LINE, companyForDate} from "../companies/companyModel";
import {booksFor, companyAccount, companyCustomer, isMainCompany, loadCompanies, stampMainLine} from "../companies/companyStore";
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
    // A register belongs to a line of companies (missing = the main business). Its own
    // pinned account is the main company's; its opening goes to the company of its line
    // that owns the opening date (companies, Ansh 28 Nov 2026).
    const line: string = d.line ?? MAIN_LINE;
    const account = accountCache(hl);
    const accountId: string | null = d.hlAccountId ?? (line === MAIN_LINE ? (await account(registerAccountName(d.kind, d.name, id), "ASSET")).id : null);
    let opening = d.opening ?? null;
    if (opening && opening.posted !== true) {
      const owner = companyForDate(await loadCompanies(db), line, opening.asOf);
      const ownerId = owner && !isMainCompany(owner.id) ? owner.id : null;
      if (line !== MAIN_LINE && !owner) throw new Permanent(`No company of these books covers ${opening.asOf}.`);
      const books = ownerId ? await booksFor(db, hl, ownerId) : hl;
      const bookAccount = ownerId ? accountCache(books) : account;
      const openingAccountId = ownerId ?
        (await companyAccount(db, books, ownerId, id, "ASSET", registerAccountName(d.kind, d.name, id))) as string :
        (accountId as string);
      if (opening.amountPaise === 0) {
        opening = {...opening, posted: true, hlTxnId: null};
      } else {
        const equity = (await bookAccount(SYSTEM_ACCOUNTS.openingEquity.name, "EQUITY")).id;
        const up = opening.amountPaise > 0;
        const amount = Math.abs(opening.amountPaise);
        const r = await books.postTransaction({
          postingType: "JOURNAL",
          description: `Opening balance · ${d.name}`,
          date: opening.asOf,
          sourceId: moneySourceIds.registerOpening(id),
          actorRef: String(d.updatedBy?.uid ?? "system"),
          legs: [
            {accountId: openingAccountId, type: up ? "DEBIT" : "CREDIT", amountPaise: amount},
            {accountId: equity, type: up ? "CREDIT" : "DEBIT", amountPaise: amount},
          ],
        });
        opening = {...opening, posted: true, hlTxnId: r.txnId, companyId: ownerId};
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

/**
 * One side of an entry, in the books of the entry's company: the main company uses the
 * pinned ids; any other company finds (or makes) the same party / account in ITS books.
 */
async function resolveSide(db: admin.firestore.Firestore, ref: MoneyAccountRef, company: {id: string | null; books: HlClient}): Promise<Side> {
  if (ref.kind === "ADJUSTMENT") return {ref, accountId: null, customerId: null};
  const other = company.id && !isMainCompany(company.id) ? company.id : null;
  if (ref.kind === "PARTY") {
    const e = (await db.collection(ENTITIES).doc(ref.entityId).get()).data();
    if (!e || e.deleted === true) throw new Permanent(`${ref.name} no longer exists.`);
    if (other) {
      const c = await companyCustomer(db, company.books, other, ref.entityId, e);
      return {ref, accountId: c.accountId, customerId: c.customerId};
    }
    if (e.syncStatus !== "SYNCED" || !e.hlCustomerId || !e.hlAccountId) throw new Waiting(`${ref.name} isn't in the books yet`);
    return {ref, accountId: String(e.hlAccountId), customerId: String(e.hlCustomerId)};
  }
  if (ref.kind === "EXPENSE") {
    const c = (await db.collection(EXPENSE_CATEGORIES).doc(ref.categoryId).get()).data();
    if (!c || c.deleted === true) throw new Permanent(`The category ${ref.name} no longer exists.`);
    if (c.isActive === false) throw new Permanent(`The category ${ref.name} is archived.`);
    if (other) return {ref, accountId: await companyAccount(db, company.books, other, ref.categoryId, "EXPENSE", categoryAccountName(String(c.name), ref.categoryId)), customerId: null};
    if (!c.hlAccountId) throw new Waiting(`${ref.name} isn't in the books yet`);
    return {ref, accountId: String(c.hlAccountId), customerId: null};
  }
  if (ref.kind === "COMPANY") {
    // "Account with <other company>" in THIS company's books — found by the other company's
    // line (so it continues across that company's years), made on first use.
    const here = company.id ?? "main";
    const accountId = await companyAccount(db, company.books, here, companySideId(ref.line), "ASSET", companyAccountName(ref.name, ref.line));
    return {ref, accountId, customerId: null};
  }
  const r = (await db.collection(REGISTERS).doc(ref.registerId).get()).data();
  if (!r || r.deleted === true) throw new Permanent(`${ref.name} no longer exists.`);
  if (r.isActive === false) throw new Permanent(`${r.name} is archived.`);
  if (r.kind !== ref.kind) throw new Permanent(`${r.name} isn't a ${ref.kind.toLowerCase()} account.`);
  if (other) return {ref, accountId: await companyAccount(db, company.books, other, ref.registerId, "ASSET", registerAccountName(r.kind, String(r.name), ref.registerId)), customerId: null};
  if (!r.hlAccountId) throw new Waiting(`${r.name} isn't in the books yet`);
  return {ref, accountId: String(r.hlAccountId), customerId: null};
}

const name = (r: MoneyAccountRef) => (r.kind === "ADJUSTMENT" ? "Adjustment" : r.name);
const isReg = (r: MoneyAccountRef) => r.kind === "CASH" || r.kind === "BANK";

export async function syncMoneyEntry(db: admin.firestore.Firestore, home: HlClient, id: string, opts: {fromTrigger?: boolean} = {}): Promise<SyncOutcome> {
  if (home.mode === "off") return "skipped";
  const ref = db.collection(MONEY_ENTRIES).doc(id);
  const e = (await ref.get()).data();
  if (!e || e.deleted === true || e.syncStatus === "SYNCED") return "skipped";
  const prior = Number(e.syncAttempts ?? 0);
  // The entry's own company's books (missing companyId = the main company, as before).
  let hl: HlClient;
  try {
    hl = await booksFor(db, home, e.companyId);
  } catch (err) {
    return fail(ref, id, new Permanent(err instanceof Error ? err.message : String(err)), prior, opts.fromTrigger === true);
  }
  const company = {id: typeof e.companyId === "string" ? e.companyId : null, books: hl};
  const sourceId = moneySourceIds.entry(id);
  const actorRef = String(e.createdBy?.uid ?? "system");
  const note: string = e.note ?? "";

  try {
    let legs: HlLeg[];
    let txnId: string;
    let carriedMatch: {invoiceId: string; amountPaise: number} | {error: string} | null = null;

    const journal = async (postingType: HlPostingType, description: string, l: HlLeg[]) => {
      legs = l;
      txnId = (await hl.postTransaction({postingType, description, date: e.businessDay, sourceId, actorRef, legs: l})).txnId;
    };

    if (e.reversesEntryId) {
      // 0. Reversal: the original's recorded legs, flipped — exact for every route (GST too).
      // No sides are resolved: an archived category or register (or a renamed / re-pinned
      // one) must never make a reversal unpostable or change what it posts.
      const o = (await db.collection(MONEY_ENTRIES).doc(String(e.reversesEntryId)).get()).data();
      if (!o?.hlLegs || !Array.isArray(o.hlLegs)) throw new Permanent("The original entry isn't in the books.");
      const flipped = (o.hlLegs as HlLeg[]).map((l) => ({...l, type: l.type === "DEBIT" ? ("CREDIT" as const) : ("DEBIT" as const)}));
      await journal("REVERSAL", note || "Reversal", flipped);
    } else {
      // Resolve every side before posting anything.
      const [from, to] = await Promise.all([resolveSide(db, e.from, company), resolveSide(db, e.to, company)]);
      const account = accountCache(hl);

      if (e.isCorrection) {
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
        // 3. Money received — against an invoice when it's linked to one (and the
        // invoice is in the books and not cancelled; otherwise on account).
        let invoiceId: string | null = null;
        if (e.saleId) {
          const sale = (await db.collection(SALES).doc(String(e.saleId)).get()).data();
          // Only against an invoice in THIS company's books: one from an earlier year (carried
          // forward under a new id) gets the money on account — matched to it later.
          const sameBooks = (sale?.companyId ?? "main") === (e.companyId ?? "main");
          if (sale && sale.deleted !== true && sale.status !== "CANCELLED" && sameBooks) {
            if (sale.syncStatus !== "SYNCED" || !sale.hlInvoiceId) throw new Waiting(`${sale.invoiceNo} isn't in the books yet`);
            invoiceId = String(sale.hlInvoiceId);
          }
        }
        const r = await hl.postPayment({
          invoiceId,
          customerId: from.customerId!,
          amountPaise: e.amountPaise,
          method: to.ref.kind as "CASH" | "BANK",
          paymentAccountId: to.accountId!,
          date: e.businessDay,
          sourceId,
          actorRef,
          description: `Payment received${e.invoiceNo ? ` for ${e.invoiceNo}` : ""}${note ? `: ${note}` : ""}`,
        });
        legs = [
          {accountId: to.accountId!, type: "DEBIT", amountPaise: e.amountPaise},
          {accountId: from.accountId!, type: "CREDIT", amountPaise: e.amountPaise},
        ];
        txnId = r.txnId;
        if (e.saleId && !invoiceId && e.invoiceNo) {
          // An invoice from an earlier year's company: carried forward here under its own number.
          // Match this payment to that carried bill (best effort — the money is in the books either way).
          carriedMatch = await matchToCarriedBill(hl, {customerId: from.customerId!, txnId: r.txnId, invoiceNo: String(e.invoiceNo), amountPaise: e.amountPaise, date: e.businessDay, sourceId: `${sourceId}:match`, actorRef});
        }
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
          description: `Payment made${e.purchaseRef ? ` for ${e.purchaseRef}` : ""}${note ? `: ${note}` : ""}`,
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
      } else if ((isReg(from.ref) && to.ref.kind === "COMPANY") || (from.ref.kind === "COMPANY" && isReg(to.ref))) {
        // 7. Money between companies: this company's half (the other half is its pair entry).
        const out = to.ref.kind === "COMPANY";
        await journal("JOURNAL", `${out ? `Money to ${name(to.ref)}` : `Money from ${name(from.ref)}`}${note ? `: ${note}` : ""}`, [
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
    }

    await ref.set(
      {
        syncStatus: "SYNCED", hlTxnId: txnId!, hlLegs: legs!, hlSyncError: null, syncAttempts: 0, hlSyncedAt: FieldValue.serverTimestamp(), lastSyncAttemptAt: FieldValue.serverTimestamp(),
        ...(carriedMatch ? {carriedBillMatch: carriedMatch} : {}),
      },
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
  f: {status: string; attempts: string; last: string} = {status: "syncStatus", attempts: "syncAttempts", last: "lastSyncAttemptAt"},
) {
  const snap = await db.collection(collection).where(f.status, "in", ["PENDING", "FAILED"]).limit(400).get();
  const due = snap.docs
    .filter((doc) => {
      const d = doc.data();
      if (d.deleted === true) return false;
      if (now - ms(d.updatedAt ?? d.createdAt) < STALE_MS) return false;
      const attempts = Number(d[f.attempts] ?? 0);
      if (attempts >= MAX_AUTO_ATTEMPTS) return false;
      return attempts === 0 || now - ms(d[f.last]) >= backoffMinutes(attempts) * 60_000;
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

/** One pass, in dependency order: entities → registers → categories → sales → purchases (each with its cancellations) → money entries. */
export async function reconcileLedgerOnce(db: admin.firestore.Firestore, hl: HlClient, now = Date.now()) {
  if (hl.mode === "off") return {notConnected: true};
  // Once, after companies arrive: older records are marked as the main business's.
  await stampMainLine(db).catch((e) => logger.error("Stamping the main line failed", {error: String(e)}));
  const entities = await reconcileEntities(db, hl, now);
  const registers = await sweep(db, REGISTERS, (id) => syncRegister(db, hl, id), now);
  const categories = await sweep(db, EXPENSE_CATEGORIES, (id) => syncCategory(db, hl, id), now);
  const sales = await sweep(db, SALES, (id) => syncSale(db, hl, id), now);
  const saleCancels = await sweep(db, SALES, (id) => cancelSaleInBooks(db, hl, id), now, {status: "cancelSyncStatus", attempts: "cancelSyncAttempts", last: "lastCancelAttemptAt"});
  const purchases = await sweep(db, PURCHASES, (id) => syncPurchase(db, hl, id), now);
  const purchaseCancels = await sweep(db, PURCHASES, (id) => cancelPurchaseInBooks(db, hl, id), now, {status: "cancelSyncStatus", attempts: "cancelSyncAttempts", last: "lastCancelAttemptAt"});
  const entries = await sweep(db, MONEY_ENTRIES, (id) => syncMoneyEntry(db, hl, id), now);
  return {notConnected: false, entities, registers, categories, sales, saleCancels, purchases, purchaseCancels, entries};
}

/**
 * Once a party / register / category is in the books, post the entries that were
 * waiting on it straight away rather than at the next reconcile (an improvement on the
 * brief — the reconcile still covers anything missed).
 */
export async function postWaitingFor(db: admin.firestore.Firestore, hl: HlClient, sideId: string) {
  if (hl.mode === "off") return;
  // Sales first: a money entry may be waiting on a sale's invoice.
  const sales = await db.collection(SALES).where("waitIds", "array-contains", sideId).where("syncStatus", "==", "PENDING").limit(50).get();
  for (const d of sales.docs) {
    if ((await syncSale(db, hl, d.id)) === "synced") await postWaitingFor(db, hl, d.id);
  }
  const purchases = await db.collection(PURCHASES).where("waitIds", "array-contains", sideId).where("syncStatus", "==", "PENDING").limit(50).get();
  for (const d of purchases.docs) await syncPurchase(db, hl, d.id);
  const waiting = await db.collection(MONEY_ENTRIES).where("sideIds", "array-contains", sideId).where("syncStatus", "==", "PENDING").limit(50).get();
  for (const d of waiting.docs) await syncMoneyEntry(db, hl, d.id);
}

/**
 * A payment for an invoice that was carried into this company from an earlier year: the
 * carried bill keeps its number, so find it among the customer's open bills and match the
 * payment (already on account) to it — up to what it still owes. Never throws: the payment
 * is in the books; a miss is recorded on the entry.
 */
export async function matchToCarriedBill(
  hl: HlClient,
  p: {customerId: string; txnId: string; invoiceNo: string; amountPaise: number; date: string; sourceId: string; actorRef: string},
): Promise<{invoiceId: string; amountPaise: number} | {error: string}> {
  try {
    const credits = await hl.getCustomerCredits(p.customerId);
    const bill = credits.openInvoices.find((i) => i.invoiceNumber === p.invoiceNo);
    if (!bill) return {error: `${p.invoiceNo} isn't an open bill in these books — the payment stays on account.`};
    const amount = Math.min(p.amountPaise, hlAmountToPaise(bill.outstanding));
    if (amount <= 0) return {error: `${p.invoiceNo} is already settled here — the payment stays on account.`};
    await hl.allocateCustomerCredit({customerId: p.customerId, sourceTransactionId: p.txnId, allocations: [{invoiceId: bill.id, amountPaise: amount}], date: p.date, sourceId: p.sourceId, actorRef: p.actorRef, note: `Payment for ${p.invoiceNo}`});
    return {invoiceId: bill.id, amountPaise: amount};
  } catch (e) {
    logger.warn("Matching a payment to a carried bill failed", {invoiceNo: p.invoiceNo, error: e instanceof Error ? e.message : String(e)});
    return {error: plainHlMessage(e)};
  }
}
