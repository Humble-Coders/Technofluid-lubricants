import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole, type Caller} from "../auth/requireRole";
import {ENTITIES, WALK_IN_ENTITY_ID, formatRupees} from "../entities/entityModel";
import {REGISTERS} from "../money/moneyModel";
import {ITEMS, MOVEMENTS, indiaToday, requestId as parseRequestId} from "../stock/stockModel";
import {
  PURCHASES,
  PURCHASE_ERROR_TEXT,
  PURCHASE_LINE_ERROR_TEXT,
  PURCHASE_REQUESTS,
  PURCHASE_SERIES,
  SELLER_STATE_CODE,
  bad,
  billNoKey,
  pricePurchase,
  purchaseError,
  purchaseFinancialYear,
  purchaseRef,
  purchaseTotalsError,
  supplierGstState,
  type BaseUnit,
  type PurchaseItem,
  type PurchaseLineInput,
  type PurchasePaymentInput,
} from "./purchaseModel";

/**
 * Record a supplier's bill (Admin or Accounts). The bill is re-priced HERE from the
 * lines (the app's figures are only a preview) and must match the supplier's printed
 * total to the paisa, with a round-off of at most ±₹1. In ONE transaction:
 *  - refuses the same supplier's bill number twice (spaces / capitals ignored) while
 *    the first is still active — a cancelled bill may be entered again;
 *  - the next PB/<FY>/0001 reference (our own, for finding the bill);
 *  - the purchase, PENDING for the books;
 *  - stock in: one "Bought" line per bill line, in base units — unless the goods were
 *    already counted in stock (then the bill touches the books only);
 *  - the request record that makes a retry harmless.
 * onPurchaseWritten then posts it (and any payment made with it) to the books.
 *
 * The stock lines carry no money: Stock & Production reads them. Each bill line's unit
 * cost is kept on the purchase (which they can't read), for costing later.
 */

const int = (v: unknown) => (typeof v === "number" ? v : NaN);

function parseLines(raw: unknown): PurchaseLineInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((l) => {
    const x = (l ?? {}) as Record<string, unknown>;
    return {itemId: typeof x.itemId === "string" ? x.itemId.trim() : "", qtyMilli: int(x.qtyMilli), taxablePaise: int(x.taxablePaise), gstRateBp: int(x.gstRateBp)};
  });
}

function parsePayments(raw: unknown): PurchasePaymentInput[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) bad("Payments must be a list.");
  return raw.map((p) => {
    const x = (p ?? {}) as Record<string, unknown>;
    return {registerId: typeof x.registerId === "string" ? x.registerId.trim() : "", amountPaise: int(x.amountPaise)};
  });
}

/** The stock items on the bill. Deleted ones are left out (→ UNKNOWN_ITEM). */
async function loadItems(db: admin.firestore.Firestore, ids: string[]): Promise<Record<string, PurchaseItem>> {
  const out: Record<string, PurchaseItem> = {};
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return out;
  const snaps = await db.getAll(...unique.map((id) => db.collection(ITEMS).doc(id)));
  for (const snap of snaps) {
    const d = snap.data();
    if (!snap.exists || !d || d.deleted === true) continue;
    const unit = d.baseUnit === "L" || d.baseUnit === "kg" || d.baseUnit === "piece" ? (d.baseUnit as BaseUnit) : null;
    out[snap.id] = {id: snap.id, name: String(d.name ?? snap.id), kind: String(d.kind ?? ""), baseUnit: unit};
  }
  return out;
}

export const createPurchase = onCall({region: "us-central1"}, async (request) => {
  const caller: Caller = await requireRole(request, ["admin", "accounts"]);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const reqId = parseRequestId(data.requestId);
  const db = admin.firestore();
  const day = indiaToday();

  // The supplier (any customer / supplier record — kinds are labels).
  const supplierId = typeof data.supplierEntityId === "string" ? data.supplierEntityId.trim() : "";
  if (supplierId === WALK_IN_ENTITY_ID) bad("Choose the supplier — the walk-in customer can't be one.");
  const s = supplierId ? (await db.collection(ENTITIES).doc(supplierId).get()).data() : undefined;
  if (supplierId && (!s || s.deleted === true)) throw new HttpsError("not-found", "That supplier doesn't exist.");
  if (s && s.isActive === false) bad(`${s.name} is archived.`);
  // GST comes from OUR record of the supplier, never the form: no valid GSTIN → no GST.
  const gstState = supplierGstState(typeof s?.gstin === "string" ? s.gstin : null);
  const supplierGstin = gstState ? String(s?.gstin) : null;

  const lines = parseLines(data.lines);
  const payments = parsePayments(data.payments);
  const freightPaise = data.freightPaise === undefined || data.freightPaise === null ? 0 : int(data.freightPaise);
  const roundOffPaise = data.roundOffPaise === undefined || data.roundOffPaise === null ? 0 : int(data.roundOffPaise);
  const note = typeof data.note === "string" && data.note.trim() ? data.note.trim().replace(/\s+/g, " ") : null;
  const billNo = typeof data.billNo === "string" ? data.billNo.trim().replace(/\s+/g, " ") : "";
  const billDate = typeof data.billDate === "string" ? data.billDate : "";
  const stockAlreadyCounted = data.stockAlreadyCounted === true;

  const headerCode = purchaseError({
    supplierEntityId: supplierId,
    billNo,
    billDate,
    lineCount: lines.length,
    lineRatesBp: lines.map((l) => l.gstRateBp),
    supplierGstin,
    freightPaise,
    roundOffPaise,
    payments,
    note,
  }, day);
  if (headerCode) bad(PURCHASE_ERROR_TEXT[headerCode], headerCode);

  const items = await loadItems(db, lines.map((l) => l.itemId));
  const priced = pricePurchase({items, lines, freightPaise, supplierStateCode: gstState, sellerStateCode: SELLER_STATE_CODE, roundOffPaise});
  if (!priced.ok) {
    const first = priced.errors[0];
    const name = items[lines[first.line]?.itemId]?.name ?? lines[first.line]?.itemId ?? "?";
    throw new HttpsError("invalid-argument", `Line ${first.line + 1} (${name}): ${PURCHASE_LINE_ERROR_TEXT[first.code]}`, {code: first.code, errors: priced.errors});
  }
  const supplierTotal = int(data.supplierBillTotalPaise);
  const totalsCode = purchaseTotalsError(priced.totals, supplierTotal, payments);
  if (totalsCode === "TOTAL_MISMATCH") {
    bad(`Our total is ${formatRupees(priced.totals.billTotalPaise)} but the supplier's bill says ${Number.isInteger(supplierTotal) ? formatRupees(supplierTotal) : "nothing"} — check the lines, freight and round-off.`, totalsCode);
  }
  if (totalsCode) bad(PURCHASE_ERROR_TEXT[totalsCode], totalsCode);

  // Payment accounts.
  const regSnaps = payments.length ? await db.getAll(...payments.map((p) => db.collection(REGISTERS).doc(p.registerId))) : [];
  const paymentRows = payments.map((p, i) => {
    const r = regSnaps[i].data();
    if (!regSnaps[i].exists || !r || r.deleted === true) throw new HttpsError("not-found", "That cash / bank account doesn't exist.");
    if (r.isActive === false) bad(`${r.name} is archived.`);
    return {registerId: p.registerId, kind: r.kind === "BANK" ? "BANK" : "CASH", name: String(r.name), amountPaise: p.amountPaise, hlTxnId: null};
  });

  const key = billNoKey(billNo);
  const fy = purchaseFinancialYear(billDate);
  const seriesRef = db.collection(PURCHASE_SERIES).doc(fy);
  const reqRef = db.collection(PURCHASE_REQUESTS).doc(reqId);
  const purchaseRefDoc = db.collection(PURCHASES).doc();
  const id = purchaseRefDoc.id;
  const itemIds = stockAlreadyCounted ? [] : [...new Set(priced.lines.map((l) => l.itemId))];

  return db.runTransaction(async (tx) => {
    const prev = await tx.get(reqRef);
    if (prev.exists) return {...(prev.data()?.result as Record<string, unknown>), alreadyDone: true};
    const dupes = await tx.get(db.collection(PURCHASES).where("supplier.entityId", "==", supplierId).where("billNoKey", "==", key));
    const series = (await tx.get(seriesRef)).data();
    const itemSnaps = await Promise.all(itemIds.map((itemId) => tx.get(db.collection(ITEMS).doc(itemId))));

    // ── All reads done; now writes. ──
    const active = dupes.docs.map((d) => d.data()).find((d) => d.status !== "CANCELLED" && d.deleted !== true);
    if (active) {
      throw new HttpsError("already-exists", `Bill ${billNo} from ${s?.name} is already recorded as ${active.ref} (${active.billDate}).`, {code: "DUPLICATE_BILL", purchaseRef: active.ref});
    }
    const seq = Number(series?.lastSeq ?? 0) + 1;
    const ref = purchaseRef(fy, seq);
    const now = FieldValue.serverTimestamp();
    const by = {uid: caller.uid, name: caller.name};
    tx.set(seriesRef, {fy, lastSeq: seq, updatedAt: now}, {merge: true});

    // Stock in, one line per bill line.
    const onHand = new Map(itemSnaps.map((snap, i) => [itemIds[i], typeof snap.data()?.onHandMilli === "number" ? (snap.data()!.onHandMilli as number) : 0]));
    const movementIds: string[] = [];
    if (!stockAlreadyCounted) {
      priced.lines.forEach((l, i) => {
        const after = (onHand.get(l.itemId) ?? 0) + l.qtyMilli;
        onHand.set(l.itemId, after);
        const mId = `purchase_${id}-${i}`;
        movementIds.push(mId);
        tx.create(db.collection(MOVEMENTS).doc(mId), {
          itemId: l.itemId, itemName: l.itemName, itemKind: l.itemKind, baseUnit: l.baseUnit, type: "PURCHASE", qtyMilli: l.qtyMilli, onHandAfterMilli: after,
          note: `Bought · ${ref}`, journalDate: billDate, requestId: `purchase_${id}`, reversesId: null, reversedById: null,
          byUid: caller.uid, byName: caller.name, purchaseId: id, purchaseRef: ref, purchaseLine: i, createdAt: now,
        });
      });
      for (const itemId of itemIds) tx.update(db.collection(ITEMS).doc(itemId), {onHandMilli: onHand.get(itemId), lastMovementAt: now, updatedAt: now});
    }

    tx.create(purchaseRefDoc, {
      ref, fy, seq,
      billNo, billNoKey: key, billDate,
      supplier: {entityId: supplierId, name: String(s?.name ?? ""), gstin: supplierGstin, stateCode: gstState ?? (s?.address?.stateCode ?? null)},
      supplyType: priced.totals.supplyType,
      lines: priced.lines.map((l) => ({...l, lineCostPaise: l.taxablePaise})),
      freight: priced.freight,
      roundOffPaise,
      totals: priced.totals,
      billTotalPaise: priced.totals.billTotalPaise,
      payments: paymentRows,
      paidAtPurchasePaise: paymentRows.reduce((sum, p) => sum + p.amountPaise, 0),
      stockAlreadyCounted,
      stockMovementIds: movementIds,
      note,
      status: "ACTIVE",
      cancel: null,
      syncStatus: "PENDING", hlTxnId: null, hlLegs: null, paymentTxnIds: [], hlSyncError: null, syncAttempts: 0, lastSyncAttemptAt: null,
      cancelSyncStatus: null, cancelHlTxnId: null, cancelSyncError: null, cancelSyncAttempts: 0,
      waitIds: [supplierId, ...paymentRows.map((p) => p.registerId)],
      deleted: false,
      createdBy: by, createdAt: now, updatedAt: now,
    });
    const result = {purchaseId: id, ref, billTotalPaise: priced.totals.billTotalPaise};
    tx.create(reqRef, {fn: "createPurchase", result, at: now});
    return {...result, alreadyDone: false};
  });
});
