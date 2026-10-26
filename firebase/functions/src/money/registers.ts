import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {getHlClient, HL_SECRETS} from "../ledger/getHlClient";
import {plainHlMessage} from "../ledger/hlClient";
import {hlAmountToPaise, formatRupees} from "../entities/entityModel";
import {requestId as parseRequestId} from "../stock/stockModel";
import {indiaToday, onceInTx, realDay, text} from "./common";
import {DEFAULT_REGISTERS, REGISTERS, RESERVED_REGISTER_NAMES, bad} from "./moneyModel";

/**
 * Registers — Technofluid's own cash boxes and bank accounts (Admin only). Each is pinned
 * ONCE to its own HL ASSET account by onRegisterWritten (hlAccountId; a rename changes
 * only the label). The kind (CASH / BANK) is locked after creation — changing it would
 * re-route every past entry. The two defaults (default-cash, default-bank) are created by
 * ensureDefaultRegisters, can be renamed, but never archived.
 */

const DEFAULT_IDS: readonly string[] = DEFAULT_REGISTERS.map((r) => r.id);

async function checkName(tx: admin.firestore.Transaction, db: admin.firestore.Firestore, name: string, selfId: string | null) {
  const lower = name.toLowerCase();
  const own = DEFAULT_REGISTERS.find((r) => r.id === selfId);
  if (RESERVED_REGISTER_NAMES.includes(lower) && !(own && own.name.toLowerCase() === lower)) {
    bad(`"${name}" is a reserved name — choose something more specific (e.g. "HDFC Current").`);
  }
  const same = await tx.get(db.collection(REGISTERS).where("nameLower", "==", lower));
  if (same.docs.some((d) => d.id !== selfId && d.data().deleted !== true)) bad(`There's already a register called ${name}.`);
}

function newRegisterDoc(name: string, kind: "CASH" | "BANK", displayOrder: number, by: {uid: string; name: string}) {
  const now = FieldValue.serverTimestamp();
  return {
    name,
    nameLower: name.toLowerCase(),
    kind,
    isActive: true,
    displayOrder,
    opening: null,
    hlAccountId: null,
    syncStatus: "PENDING",
    hlSyncError: null,
    syncAttempts: 0,
    deleted: false,
    createdBy: by,
    updatedBy: by,
    createdAt: now,
    updatedAt: now,
  };
}

/** Create, rename or reorder a register. */
export const saveRegister = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin"]);
  const data = request.data ?? {};
  const reqId = parseRequestId(data.requestId);
  const registerId = typeof data.registerId === "string" && data.registerId.trim() ? data.registerId.trim() : null;
  const name = text(data.name, "Name", 60);
  const order = data.displayOrder === undefined ? null : Number(data.displayOrder);
  if (order !== null && (!Number.isInteger(order) || order < 0 || order > 999)) bad("Order must be a whole number from 0 to 999.");
  const db = admin.firestore();
  const by = {uid: caller.uid, name: caller.name};

  return onceInTx(db, reqId, "saveRegister", async (tx) => {
    if (!registerId) {
      if (data.kind !== "CASH" && data.kind !== "BANK") bad("Kind must be CASH or BANK.");
      await checkName(tx, db, name, null);
      const ref = db.collection(REGISTERS).doc();
      tx.create(ref, newRegisterDoc(name, data.kind, order ?? 10, by));
      return {registerId: ref.id};
    }
    const ref = db.collection(REGISTERS).doc(registerId);
    const d = (await tx.get(ref)).data();
    if (!d || d.deleted === true) throw new HttpsError("not-found", "That register doesn't exist.");
    if (data.kind !== undefined && data.kind !== d.kind) bad("A register's kind (cash or bank) can't be changed.");
    await checkName(tx, db, name, registerId);
    tx.update(ref, {name, nameLower: name.toLowerCase(), ...(order !== null ? {displayOrder: order} : {}), updatedBy: by, updatedAt: FieldValue.serverTimestamp()});
    return {registerId};
  });
});

/** The register's opening balance — set ONCE (may be 0; never negative for cash). */
export const setRegisterOpening = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin"]);
  const data = request.data ?? {};
  const reqId = parseRequestId(data.requestId);
  const registerId = text(data.registerId, "registerId", 80);
  const amount = data.amountPaise;
  if (typeof amount !== "number" || !Number.isInteger(amount) || Math.abs(amount) > 1e13) bad("The opening balance must be a whole amount in paise.");
  const asOf = realDay(data.asOf, "The as-of date");
  if (asOf > indiaToday()) bad("The as-of date can't be in the future.");
  const db = admin.firestore();
  const ref = db.collection(REGISTERS).doc(registerId);

  return onceInTx(db, reqId, "setRegisterOpening", async (tx) => {
    const d = (await tx.get(ref)).data();
    if (!d || d.deleted === true) throw new HttpsError("not-found", "That register doesn't exist.");
    if (d.opening) throw new HttpsError("failed-precondition", "This register's opening balance is already set — it can't be changed.");
    if (d.kind === "CASH" && amount < 0) bad("Cash can't start below ₹0.");
    tx.update(ref, {
      opening: {amountPaise: amount, asOf, posted: false, hlTxnId: null},
      syncStatus: "PENDING",
      syncAttempts: 0,
      hlSyncError: null,
      updatedBy: {uid: caller.uid, name: caller.name},
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {registerId};
  });
});

/** Archive / restore a register (not the defaults; archiving needs a ₹0 balance in the books). */
export const setRegisterActive = onCall({region: "us-central1", secrets: HL_SECRETS}, async (request) => {
  const caller = await requireRole(request, ["admin"]);
  const data = request.data ?? {};
  const reqId = parseRequestId(data.requestId);
  const registerId = text(data.registerId, "registerId", 80);
  if (typeof data.active !== "boolean") bad("active must be true or false.");
  const active: boolean = data.active;
  const reason = text(data.reason, "Reason", 300);
  if (DEFAULT_IDS.includes(registerId)) bad("The default cash and bank registers can't be archived (you can rename them).");
  const db = admin.firestore();
  const ref = db.collection(REGISTERS).doc(registerId);
  const d = (await ref.get()).data();
  if (!d || d.deleted === true) throw new HttpsError("not-found", "That register doesn't exist.");
  if (!active && d.hlAccountId) {
    let balance: number;
    try {
      const sheet = await getHlClient().getBalanceSheet(indiaToday());
      balance = hlAmountToPaise(String(sheet[String(d.hlAccountId)] ?? "0"));
    } catch (e) {
      throw new HttpsError("unavailable", plainHlMessage(e));
    }
    if (balance !== 0) throw new HttpsError("failed-precondition", `Move or settle ${formatRupees(balance)} first — only a register at ₹0 can be archived.`);
  }
  return onceInTx(db, reqId, "setRegisterActive", async (tx) => {
    tx.update(ref, {isActive: active, archiveReason: active ? null : reason, updatedBy: {uid: caller.uid, name: caller.name}, updatedAt: FieldValue.serverTimestamp()});
    return {registerId, active};
  });
});

/** Creates "Cash in hand" and "Bank" if they're missing (Admin; also run by the seed). */
export const ensureDefaultRegisters = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin"]);
  const db = admin.firestore();
  const by = {uid: caller.uid, name: caller.name};
  const created: string[] = [];
  for (const r of DEFAULT_REGISTERS) {
    const ref = db.collection(REGISTERS).doc(r.id);
    const made = await db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return false;
      tx.create(ref, newRegisterDoc(r.name, r.kind, r.displayOrder, by));
      return true;
    });
    if (made) created.push(r.id);
  }
  return {created};
});
