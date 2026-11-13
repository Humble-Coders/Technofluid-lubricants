import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole, type Caller} from "../auth/requireRole";
import {ENTITIES, WALK_IN_ENTITY_ID} from "../entities/entityModel";
import {walkInDoc} from "../entities/ensureSystemEntities";
import {realBooksFromEmulator} from "../ledger/getHlClient";
import {REGISTERS} from "../money/moneyModel";
import {PRICES_COLLECTION, currentPrices} from "../products/prices";
import {ITEMS, MOVEMENTS, poolId, requestId as parseRequestId} from "../stock/stockModel";
import {companyRef} from "./company";

/** Invoice prefix in a real-books test run (emulators:real-books). */
const REAL_BOOKS_TEST_PREFIX = "TST";
import {
  COMPANY_ERROR_TEXT,
  INVOICE_SERIES,
  SALES,
  SALE_ERROR_TEXT,
  SALE_LINE_ERROR_TEXT,
  SALE_PAYMENT_ERROR_TEXT,
  DISPATCH_ERROR_TEXT,
  SALE_REQUESTS,
  WALK_IN_BUYER_ERROR_TEXT,
  bad,
  cleanDispatch,
  cleanShipTo,
  cleanWalkInBuyer,
  dispatchError,
  companyError,
  financialYear,
  invoiceNumber,
  priceSale,
  saleError,
  salePaymentError,
  walkInBuyerError,
  type BaseUnit,
  type CompanyProfile,
  type PriceTier,
  type SaleLineInput,
  type SalePaymentInput,
  type SaleProduct,
} from "./saleModel";

/**
 * Bill a customer (Admin or Accounts). In ONE transaction:
 *  - the next number of the financial year's series ("TF/2026-27/0001"; never reused —
 *    a cancelled invoice keeps its number), refusing a date earlier than the series'
 *    last invoice so numbers stay in date order;
 *  - the sale, priced HERE from the products and the customer's price list (the app's
 *    figures are only a preview), with GST by place of supply and the round-off;
 *  - stock out: one "Sold" line per stock pool, in base units (may go below zero —
 *    reported back, as in the stock journal).
 * Only an Admin may type a pack price for a product with no price (that sale only).
 * A walk-in sale may carry the buyer's name / phone / address (required from ₹50,000).
 * Dispatch details (transport, vehicle, station, e-way bill) and a ship-to address, all
 * optional, are printed on the invoice; they don't change the GST.
 * The sale is written PENDING; onSaleWritten posts it (and any payment taken now) to the
 * books. Retry-safe on requestId (saleRequests).
 */

const today = () => new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Kolkata"}).format(new Date());
const int = (v: unknown) => (typeof v === "number" ? v : NaN);

function parseLines(raw: unknown): SaleLineInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((l) => {
    const x = (l ?? {}) as Record<string, unknown>;
    const manual = x.manualPackPricePaise === undefined || x.manualPackPricePaise === null ? null : int(x.manualPackPricePaise);
    return {sku: typeof x.sku === "string" ? x.sku.trim() : "", packs: int(x.packs), discountBp: x.discountBp === undefined ? 0 : int(x.discountBp), manualPackPricePaise: manual};
  });
}

function parsePayments(raw: unknown): SalePaymentInput[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) bad("Payments must be a list.");
  return raw.map((p) => {
    const x = (p ?? {}) as Record<string, unknown>;
    return {registerId: typeof x.registerId === "string" ? x.registerId.trim() : "", amountPaise: int(x.amountPaise)};
  });
}

/** Products and their prices, for the SKUs on the sale. Deleted products are left out. */
async function loadProducts(db: admin.firestore.Firestore, skus: string[]): Promise<Record<string, SaleProduct>> {
  const out: Record<string, SaleProduct> = {};
  const ids = [...new Set(skus.filter(Boolean))];
  if (ids.length === 0) return out;
  const [docs, prices] = await Promise.all([
    db.getAll(...ids.map((id) => db.collection("products").doc(id))),
    db.getAll(...ids.map((id) => db.collection(PRICES_COLLECTION).doc(id))),
  ]);
  docs.forEach((snap, i) => {
    const d = snap.data();
    if (!snap.exists || !d || d.deleted === true) return;
    const p = currentPrices(prices[i].data(), d);
    const unit = String(d.baseUnit ?? "L");
    out[snap.id] = {
      sku: snap.id,
      name: String(d.product ?? ""),
      grade: String(d.grade ?? ""),
      packLabel: String(d.orderableUnit ?? ""),
      productKey: String(d.productKey ?? ""),
      packQty: typeof d.packQty === "number" ? d.packQty : 0,
      baseUnit: (unit === "kg" || unit === "piece" ? unit : "L") as BaseUnit,
      pricePer: p.pricePer,
      dealerPricePaise: p.dealerPrice,
      distributorPricePaise: p.distributorPrice,
      gstPct: typeof d.gstPct === "number" ? d.gstPct : 18,
      hsnCode: typeof d.hsnCode === "string" ? d.hsnCode : null,
      active: d.active !== false,
    };
  });
  return out;
}

export const createSale = onCall({region: "us-central1"}, async (request) => {
  const caller: Caller = await requireRole(request, ["admin", "accounts"]);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const reqId = parseRequestId(data.requestId);
  const db = admin.firestore();
  const day = today();

  // The seller.
  const company = (await companyRef(db).get()).data() as CompanyProfile | undefined;
  const companyCode = company ? companyError(company) : "NO_NAME";
  if (!company || companyCode) {
    throw new HttpsError("failed-precondition", `Set up the company details in Settings before billing${companyCode ? ` — ${COMPANY_ERROR_TEXT[companyCode]}` : "."}`);
  }

  // The customer (the walk-in record is made on first use).
  const customerId = typeof data.customerEntityId === "string" ? data.customerEntityId.trim() : "";
  if (!customerId) bad("Choose a customer.");
  const isWalkIn = customerId === WALK_IN_ENTITY_ID;
  const customerSnap = await db.collection(ENTITIES).doc(customerId).get();
  const c = customerSnap.data();
  if (!isWalkIn && (!c || c.deleted === true)) throw new HttpsError("not-found", "That customer doesn't exist.");
  if (c && c.isActive === false) bad(`${c.name} is archived.`);
  const customer = c ?? walkInDoc({uid: caller.uid, name: caller.name});
  const priceTier = (customer.priceTier ?? null) as PriceTier | null;
  const placeOfSupply = isWalkIn ? company.stateCode : String(customer.address?.stateCode ?? "");

  const lines = parseLines(data.lines);
  if (caller.role !== "admin" && lines.some((l) => l.manualPackPricePaise !== null)) {
    throw new HttpsError("permission-denied", "Only an Admin can set a price for one sale.");
  }
  const obj = (v: unknown) => (v && typeof v === "object" ? v as Record<string, unknown> : null);
  const dispatch = cleanDispatch(obj(data.dispatch));
  const shipTo = cleanShipTo(obj(data.shipTo));
  const dispatchCode = dispatchError(dispatch, shipTo, isWalkIn);
  if (dispatchCode) bad(DISPATCH_ERROR_TEXT[dispatchCode], dispatchCode);
  const buyer = cleanWalkInBuyer(data.walkInBuyer && typeof data.walkInBuyer === "object" ? data.walkInBuyer as Record<string, string> : null);
  const payments = parsePayments(data.payments);
  const freightPaise = data.freightPaise === undefined ? 0 : int(data.freightPaise);
  const note = typeof data.note === "string" && data.note.trim() ? data.note.trim() : null;
  const invoiceDate = typeof data.invoiceDate === "string" ? data.invoiceDate : day;

  const headerCode = saleError({customerEntityId: customerId, priceTier, placeOfSupplyStateCode: placeOfSupply || null, invoiceDate, lineCount: lines.length, freightPaise, payments, note}, day);
  if (headerCode) bad(SALE_ERROR_TEXT[headerCode], headerCode);

  const products = await loadProducts(db, lines.map((l) => l.sku));
  const priced = priceSale({products, lines, tier: priceTier as PriceTier, sellerStateCode: company.stateCode, placeOfSupplyStateCode: placeOfSupply, freightPaise});
  if (!priced.ok) {
    const first = priced.errors[0];
    const sku = lines[first.line]?.sku || "?";
    throw new HttpsError("invalid-argument", `Line ${first.line + 1} (${sku}): ${SALE_LINE_ERROR_TEXT[first.code]}`, {code: first.code, errors: priced.errors});
  }
  const buyerCode = walkInBuyerError(isWalkIn, buyer, priced.totals.taxablePaise);
  if (buyerCode) bad(WALK_IN_BUYER_ERROR_TEXT[buyerCode], buyerCode);
  const payCode = salePaymentError(customerId, priced.totals.grandTotalPaise, payments);
  if (payCode) bad(SALE_PAYMENT_ERROR_TEXT[payCode], payCode);

  // Payment accounts.
  const regSnaps = payments.length ? await db.getAll(...payments.map((p) => db.collection(REGISTERS).doc(p.registerId))) : [];
  const paymentRows = payments.map((p, i) => {
    const r = regSnaps[i].data();
    if (!regSnaps[i].exists || !r || r.deleted === true) throw new HttpsError("not-found", "That cash / bank account doesn't exist.");
    if (r.isActive === false) bad(`${r.name} is archived.`);
    return {registerId: p.registerId, kind: r.kind === "BANK" ? "BANK" : "CASH", name: String(r.name), amountPaise: p.amountPaise, hlTxnId: null};
  });

  // Stock out, per pool.
  const pools = new Map<string, {qtyMilli: number; name: string; baseUnit: string; productKey: string}>();
  for (const l of priced.lines) {
    if (!l.productKey) bad(`${l.productName} (${l.sku}) has no stock pool — an Admin must fix the product.`);
    const id = poolId(l.productKey);
    const prev = pools.get(id);
    pools.set(id, {qtyMilli: (prev?.qtyMilli ?? 0) + l.qtyMilli, name: prev?.name ?? l.productName, baseUnit: l.baseUnit, productKey: l.productKey});
  }

  const fy = financialYear(invoiceDate);
  const seriesRef = db.collection(INVOICE_SERIES).doc(fy);
  const reqRef = db.collection(SALE_REQUESTS).doc(reqId);
  const saleRef = db.collection(SALES).doc();

  return db.runTransaction(async (tx) => {
    const prev = await tx.get(reqRef);
    if (prev.exists) return {...(prev.data()?.result as Record<string, unknown>), alreadyDone: true};
    const series = (await tx.get(seriesRef)).data();
    const poolIds = [...pools.keys()];
    const poolSnaps = await Promise.all(poolIds.map((id) => tx.get(db.collection(ITEMS).doc(id))));
    const walkInMissing = isWalkIn && !(await tx.get(db.collection(ENTITIES).doc(WALK_IN_ENTITY_ID))).exists;

    // ── All reads done; now writes. ──
    if (series?.lastDate && invoiceDate < series.lastDate) {
      bad(`Invoice dates can't go backwards — the last invoice of ${fy} is dated ${series.lastDate}.`, "DATE_BEFORE_LAST_INVOICE");
    }
    const seq = Number(series?.lastSeq ?? 0) + 1;
    // A real-books test run numbers its invoices TST/… so the live series (TF/…) never
    // finds its numbers already taken in the real ledger (HL refuses a reused number).
    const prefix = realBooksFromEmulator() ? REAL_BOOKS_TEST_PREFIX : String(series?.prefix ?? company.invoicePrefix);
    let invoiceNo: string;
    try {
      invoiceNo = invoiceNumber(prefix, fy, seq);
    } catch (e) {
      throw new HttpsError("failed-precondition", `Can't number this invoice: ${(e as Error).message}. Use a shorter prefix from next year.`);
    }
    const now = FieldValue.serverTimestamp();
    const by = {uid: caller.uid, name: caller.name};
    tx.set(seriesRef, {fy, prefix, lastSeq: seq, lastDate: invoiceDate, updatedAt: now}, {merge: true});
    if (walkInMissing) {
      const ref = db.collection(ENTITIES).doc(WALK_IN_ENTITY_ID);
      tx.create(ref, walkInDoc(by));
      tx.create(ref.collection("history").doc(), {at: now, by, action: "create", changes: {}});
    }

    const movementIds: string[] = [];
    const belowZero: {itemId: string; name: string; onHandMilli: number}[] = [];
    poolIds.forEach((id, i) => {
      const pool = pools.get(id)!;
      const item = poolSnaps[i].data();
      const itemRef = db.collection(ITEMS).doc(id);
      const onHand = (typeof item?.onHandMilli === "number" ? item.onHandMilli : 0) - pool.qtyMilli;
      const name = String(item?.name ?? pool.name);
      const baseUnit = String(item?.baseUnit ?? pool.baseUnit);
      if (!poolSnaps[i].exists) {
        tx.set(itemRef, {
          kind: "product_pool", productKey: pool.productKey, name, nameLower: name.toLowerCase(), code: null, baseUnit,
          densityKgPerL: null, aliases: [], onHandMilli: onHand, lastMovementAt: now, deleted: false,
          createdAt: now, createdBy: by, updatedAt: now, updatedBy: by,
        });
      } else {
        tx.update(itemRef, {onHandMilli: onHand, lastMovementAt: now, updatedAt: now});
      }
      const mId = `sale_${saleRef.id}-${i}`;
      movementIds.push(mId);
      tx.create(db.collection(MOVEMENTS).doc(mId), {
        itemId: id, itemName: name, itemKind: "product_pool", baseUnit, type: "SALE", qtyMilli: -pool.qtyMilli, onHandAfterMilli: onHand,
        note: `Sold · ${invoiceNo}`, journalDate: invoiceDate, requestId: `sale_${saleRef.id}`, reversesId: null, reversedById: null,
        byUid: caller.uid, byName: caller.name, saleId: saleRef.id, invoiceNo, createdAt: now,
      });
      if (onHand < 0) belowZero.push({itemId: id, name, onHandMilli: onHand});
    });

    tx.create(saleRef, {
      invoiceNo, fy, seq, invoiceDate,
      customer: {
        entityId: customerId,
        name: String(customer.name),
        gstin: customer.gstin ?? null,
        address: customer.address ?? null,
        isWalkIn,
        priceTier,
        buyer,
      },
      placeOfSupply,
      dispatch,
      shipTo,
      seller: {
        legalName: company.legalName, tradeName: company.tradeName ?? null, gstin: company.gstin, stateCode: company.stateCode,
        address: company.address, phone: company.phone ?? null, email: company.email ?? null,
        // Frozen with the sale, so a reprint shows the bank details and terms of the day it was billed.
        bank: company.bank ?? null, invoiceTerms: company.invoiceTerms ?? [],
      },
      lines: priced.lines,
      freight: priced.freight,
      totals: priced.totals,
      missingHsn: priced.missingHsn,
      payments: paymentRows,
      paidAtBillingPaise: paymentRows.reduce((s, p) => s + p.amountPaise, 0),
      note,
      status: "ACTIVE",
      cancel: null,
      stockMovementIds: movementIds,
      waitIds: [customerId, ...paymentRows.map((p) => p.registerId)],
      syncStatus: "PENDING", hlInvoiceId: null, hlSaleTxnId: null, hlSyncError: null, syncAttempts: 0, lastSyncAttemptAt: null,
      cancelSyncStatus: null, cancelSyncError: null, cancelSyncAttempts: 0,
      deleted: false,
      createdBy: by, createdAt: now, updatedAt: now,
    });
    const result = {saleId: saleRef.id, invoiceNo, grandTotalPaise: priced.totals.grandTotalPaise, belowZero, missingHsn: priced.missingHsn};
    tx.create(reqRef, {fn: "createSale", result, at: now});
    return {...result, alreadyDone: false};
  });
});
