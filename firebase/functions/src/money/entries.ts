import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {ENTITIES, hlAmountToPaise} from "../entities/entityModel";
import {getHlClient, HL_SECRETS} from "../ledger/getHlClient";
import {plainHlMessage} from "../ledger/hlClient";
import {requestId as parseRequestId} from "../stock/stockModel";
import {indiaToday, onceInTx, text} from "./common";
import {
  EXPENSE_CATEGORIES,
  MONEY_ENTRIES,
  MONEY_ERROR_TEXT,
  REGISTERS,
  bad,
  canReverse,
  correctionFor,
  moneyEntryError,
  type ExpenseGst,
  type MoneyAccountRef,
  type MoneyEntryInput,
} from "./moneyModel";

/**
 * Money in & out (Admin + Accounts; corrections Admin only). Every entry is written
 * PENDING; onMoneyEntryWritten posts it to Humble Ledger. Nothing here stores a balance,
 * and nothing is ever edited or deleted — reverseMoneyEntry writes the mirror.
 * The same rules as the app's form (moneyEntryError, mirrored from @technofluid/core).
 */

type Caller = {uid: string; name: string; role: string};

/** Reads a side as sent, then checks it against our records and takes the name from them. */
async function resolveRef(db: admin.firestore.Firestore, raw: unknown, label: string): Promise<MoneyAccountRef> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = (k: string) => (typeof r[k] === "string" && (r[k] as string).trim() ? (r[k] as string).trim() : bad(`${label}: which one?`));
  switch (r.kind) {
  case "ADJUSTMENT":
    return {kind: "ADJUSTMENT"};
  case "PARTY": {
    const entityId = id("entityId");
    const d = (await db.collection(ENTITIES).doc(entityId).get()).data();
    if (!d || d.deleted === true) throw new HttpsError("not-found", `${label}: that customer / supplier doesn't exist.`);
    if (d.isActive === false) bad(`${label}: ${d.name} is archived.`);
    return {kind: "PARTY", entityId, name: String(d.name)};
  }
  case "CASH":
  case "BANK": {
    const registerId = id("registerId");
    const d = (await db.collection(REGISTERS).doc(registerId).get()).data();
    if (!d || d.deleted === true) throw new HttpsError("not-found", `${label}: that cash / bank account doesn't exist.`);
    if (d.isActive === false) bad(`${label}: ${d.name} is archived.`);
    if (d.kind !== r.kind) bad(`${label}: ${d.name} is a ${String(d.kind).toLowerCase()} account.`);
    return {kind: d.kind, registerId, name: String(d.name)};
  }
  case "EXPENSE": {
    const categoryId = id("categoryId");
    const d = (await db.collection(EXPENSE_CATEGORIES).doc(categoryId).get()).data();
    if (!d || d.deleted === true) throw new HttpsError("not-found", `${label}: that expense category doesn't exist.`);
    if (d.isActive === false) bad(`${label}: ${d.name} is archived.`);
    return {kind: "EXPENSE", categoryId, name: String(d.name)};
  }
  default:
    return bad(`${label}: unknown kind.`);
  }
}

export const sideId = (r: MoneyAccountRef) =>
  r.kind === "PARTY" ? r.entityId : r.kind === "EXPENSE" ? r.categoryId : r.kind === "ADJUSTMENT" ? "ADJUSTMENT" : r.registerId;

function check(input: MoneyEntryInput) {
  const code = moneyEntryError(input, indiaToday());
  if (code) bad(MONEY_ERROR_TEXT[code], code);
}

function entryDoc(input: MoneyEntryInput, caller: Caller, extra: Record<string, unknown> = {}) {
  const now = FieldValue.serverTimestamp();
  return {
    from: input.from,
    to: input.to,
    sideIds: [sideId(input.from), sideId(input.to)],
    amountPaise: input.amountPaise,
    businessDay: input.businessDay,
    note: input.note?.trim() || null,
    isCorrection: input.isCorrection,
    gst: input.gst ?? null,
    reversesEntryId: null,
    reversedByEntryId: null,
    syncStatus: "PENDING",
    hlTxnId: null,
    hlLegs: null,
    hlSyncError: null,
    syncAttempts: 0,
    deleted: false,
    createdBy: {uid: caller.uid, name: caller.name},
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

const noteOf = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Money received, money paid, a transfer, a balance move — or (Admin) a correction. */
export const recordMoneyEntry = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin", "accounts"]);
  const data = request.data ?? {};
  const reqId = parseRequestId(data.requestId);
  const isCorrection = data.isCorrection === true;
  if (isCorrection && caller.role !== "admin") throw new HttpsError("permission-denied", "Only an Admin can record a correction.");
  const db = admin.firestore();
  const [from, to] = await Promise.all([resolveRef(db, data.from, "From"), resolveRef(db, data.to, "To")]);
  if (from.kind === "EXPENSE" || to.kind === "EXPENSE") bad("Record expenses with the expense form.");
  const input: MoneyEntryInput = {from, to, amountPaise: data.amountPaise, businessDay: String(data.businessDay ?? ""), note: noteOf(data.note), isCorrection};
  check(input);
  return onceInTx(db, reqId, "recordMoneyEntry", async (tx) => {
    const ref = db.collection(MONEY_ENTRIES).doc();
    tx.create(ref, entryDoc(input, caller));
    return {entryId: ref.id};
  });
});

/** An expense paid from cash or a bank, with its GST bill when there is one. */
export const recordExpense = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin", "accounts"]);
  const data = request.data ?? {};
  const reqId = parseRequestId(data.requestId);
  const db = admin.firestore();
  const from = await resolveRef(db, {kind: data.registerKind, registerId: data.registerId}, "Paid from");
  const to = await resolveRef(db, {kind: "EXPENSE", categoryId: data.categoryId}, "Category");

  let gst: ExpenseGst | null = null;
  if (data.gst) {
    const g = data.gst as Record<string, unknown>;
    const s = (g.supplier ?? {}) as Record<string, unknown>;
    let supplier = {entityId: null as string | null, name: text(s.name, "Supplier name", 120, false), gstin: String(s.gstin ?? "").trim().toUpperCase(), stateCode: String(s.stateCode ?? "")};
    if (typeof s.entityId === "string" && s.entityId.trim()) {
      // A known supplier: its GSTIN and state come from OUR record, never the form.
      const e = (await db.collection(ENTITIES).doc(s.entityId.trim()).get()).data();
      if (!e || e.deleted === true) throw new HttpsError("not-found", "That supplier doesn't exist.");
      if (!e.gstin) bad(`${e.name} has no GSTIN on record — add it there, or type the supplier's details.`);
      supplier = {entityId: s.entityId.trim(), name: String(e.name), gstin: String(e.gstin), stateCode: String(e.address?.stateCode ?? String(e.gstin).slice(0, 2))};
    }
    if (!supplier.name) bad("Give the supplier's name.");
    const int = (v: unknown) => (typeof v === "number" ? v : NaN);
    gst = {
      supplier,
      billNo: text(g.billNo, "Bill number", 40),
      billDate: text(g.billDate, "Bill date", 10),
      rateBp: int(g.rateBp),
      taxablePaise: int(g.taxablePaise),
      cgstPaise: int(g.cgstPaise),
      sgstPaise: int(g.sgstPaise),
      igstPaise: int(g.igstPaise),
    };
  }
  const input: MoneyEntryInput = {from, to, amountPaise: data.amountPaise, businessDay: String(data.businessDay ?? ""), note: noteOf(data.note), isCorrection: false, gst};
  check(input);
  return onceInTx(db, reqId, "recordExpense", async (tx) => {
    const ref = db.collection(MONEY_ENTRIES).doc();
    tx.create(ref, entryDoc(input, caller));
    return {entryId: ref.id};
  });
});

/**
 * Admin: "this balance should be ₹X". Reads the current balance FROM THE BOOKS here,
 * works out the correction (correctionFor) and records it — or says it's already right.
 * Refused while earlier entries for that account are still being saved to the books
 * (never correct against a stale balance — Aromex #173).
 */
export const correctBalance = onCall({region: "us-central1", secrets: HL_SECRETS}, async (request) => {
  const caller = await requireRole(request, ["admin"]);
  const data = request.data ?? {};
  const reqId = parseRequestId(data.requestId);
  const wanted = data.wantedPaise;
  if (typeof wanted !== "number" || !Number.isInteger(wanted) || Math.abs(wanted) > 1e13) bad("Give the balance it should be, in paise.");
  const reason = text(data.reason, "Reason", 500);
  const db = admin.firestore();
  const target = await resolveRef(db, data.target, "Account");
  if (target.kind !== "PARTY" && target.kind !== "CASH" && target.kind !== "BANK") bad("A correction is for a customer / supplier or a cash / bank account.");

  const waiting = await db.collection(MONEY_ENTRIES).where("sideIds", "array-contains", sideId(target)).where("syncStatus", "in", ["PENDING", "FAILED"]).limit(1).get();
  if (!waiting.empty) throw new HttpsError("failed-precondition", "Earlier entries for this account are still being saved to the books — try again once they show as saved.");

  let current: number;
  try {
    const hl = getHlClient();
    if (target.kind === "PARTY") {
      const e = (await db.collection(ENTITIES).doc(target.entityId).get()).data();
      if (!e?.hlCustomerId || e.syncStatus !== "SYNCED") throw new HttpsError("failed-precondition", `${target.name} isn't saved to the books yet.`);
      const c = await hl.getCustomer(String(e.hlCustomerId));
      current = hlAmountToPaise(String(c.balance ?? c.outstanding ?? "0"));
    } else {
      const r = (await db.collection(REGISTERS).doc(target.registerId).get()).data();
      if (!r?.hlAccountId) throw new HttpsError("failed-precondition", `${target.name} isn't saved to the books yet.`);
      const sheet = await hl.getBalanceSheet(indiaToday());
      current = hlAmountToPaise(String(sheet[String(r.hlAccountId)] ?? "0"));
    }
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    throw new HttpsError("unavailable", plainHlMessage(e));
  }

  const draft = correctionFor(target, current, wanted);
  if (!draft) return {noChange: true, currentPaise: current};
  const input: MoneyEntryInput = {...draft, businessDay: typeof data.businessDay === "string" ? data.businessDay : indiaToday(), note: reason};
  check(input);
  return onceInTx(db, reqId, "correctBalance", async (tx) => {
    const ref = db.collection(MONEY_ENTRIES).doc();
    tx.create(ref, entryDoc(input, caller, {correctedFromPaise: current, correctedToPaise: wanted}));
    return {entryId: ref.id, noChange: false, currentPaise: current};
  });
});

/**
 * Reverse an entry: ONE transaction re-reads the original, checks it can be reversed,
 * writes the mirror (sides swapped, same amount and GST legs, "Reversal: <reason>") and
 * marks the original. No HL call — the mirror is posted like any entry. Reversing a
 * correction is Admin only; a second reverse is refused.
 */
export const reverseMoneyEntry = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin", "accounts"]);
  const data = request.data ?? {};
  const reqId = parseRequestId(data.requestId);
  const entryId = text(data.entryId, "entryId", 80);
  const reason = text(data.reason, "Reason", 400);
  const db = admin.firestore();
  const origRef = db.collection(MONEY_ENTRIES).doc(entryId);

  return onceInTx(db, reqId, "reverseMoneyEntry", async (tx) => {
    const o = (await tx.get(origRef)).data();
    if (!o || o.deleted === true) throw new HttpsError("not-found", "That entry doesn't exist.");
    if (o.isCorrection && caller.role !== "admin") throw new HttpsError("permission-denied", "Only an Admin can reverse a correction.");
    if (!canReverse({syncStatus: o.syncStatus, reversesEntryId: o.reversesEntryId ?? null, reversedByEntryId: o.reversedByEntryId ?? null})) {
      const why = o.reversedByEntryId ? "It's already been reversed." : o.reversesEntryId ? "A reversal can't itself be reversed." : "It isn't saved to the books yet.";
      throw new HttpsError("failed-precondition", why);
    }
    const mirrorRef = db.collection(MONEY_ENTRIES).doc();
    const mirror: MoneyEntryInput = {from: o.to, to: o.from, amountPaise: o.amountPaise, businessDay: indiaToday(), note: `Reversal: ${reason}`, isCorrection: o.isCorrection === true, gst: o.gst ?? null};
    tx.create(mirrorRef, entryDoc(mirror, caller, {reversesEntryId: entryId}));
    tx.update(origRef, {reversedByEntryId: mirrorRef.id, updatedAt: FieldValue.serverTimestamp()});
    return {entryId: mirrorRef.id, reversesEntryId: entryId};
  });
});

/** "Retry" on an entry that couldn't be saved to the books: back to PENDING. */
export const retryMoneyEntrySync = onCall({region: "us-central1"}, async (request) => {
  await requireRole(request, ["admin", "accounts"]);
  const entryId = text(request.data?.entryId, "entryId", 80);
  const db = admin.firestore();
  const ref = db.collection(MONEY_ENTRIES).doc(entryId);
  return db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data();
    if (!d || d.deleted === true) throw new HttpsError("not-found", "That entry doesn't exist.");
    if (d.syncStatus === "SYNCED") return {entryId, syncStatus: "SYNCED"};
    tx.update(ref, {syncStatus: "PENDING", syncAttempts: 0, hlSyncError: null, updatedAt: FieldValue.serverTimestamp()});
    return {entryId, syncStatus: "PENDING"};
  });
});
