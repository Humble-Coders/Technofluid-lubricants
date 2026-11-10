/**
 * Sales & invoices (brief: docs/office/sales-brief.md) with the fake Humble Ledger: the
 * shared rules table against the server's copy, company details, invoice numbers, stock
 * out, posting (revenue + output GST + payments against the invoice), cancelling,
 * money received against an invoice, "books not connected", and the rules.
 * Real rules and Cloud Functions in throw-away emulators.
 *
 *   npm run test:emulator
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { adminDb, as, closeClients, denied, PROJECT, rejectsWith, seedStaff } from "./helpers.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const CASES = JSON.parse(readFileSync(path.resolve(here, "../../core/src/sale.cases.json"), "utf8"));
const fnRequire = createRequire(path.join(path.resolve(here, "../../../firebase/functions"), "package.json"));
const model = fnRequire("./lib/sales/saleModel.js");
const { syncSale } = fnRequire("./lib/sales/sync.js");
const { reconcileLedgerOnce } = fnRequire("./lib/money/sync.js");
const { FakeHlClient } = fnRequire("./lib/ledger/fakeHlClient.js");
const { NotConnectedHlClient } = fnRequire("./lib/ledger/hlClient.js");
const fnAdminApp = fnRequire("firebase-admin/app").initializeApp({ projectId: PROJECT }, `fn-sales-${process.pid}`);
const libDb = fnRequire("firebase-admin/firestore").getFirestore(fnAdminApp);

let admin, accounts, stock, distributor;
let n = 0;
const rid = () => `test-sal-${process.pid}-${Date.now()}-${n++}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() - 86_400_000));
const fy = model.financialYear(today);
const get = async (col, id) => (await adminDb.doc(`${col}/${id}`).get()).data();
const control = (data) => adminDb.doc("_fakeHl/control").set(data);

async function waitFor(fn, what, ms = 20_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(200);
  }
}
const status = (col, id, want, field = "syncStatus") => waitFor(async () => ((await get(col, id))?.[field] === want ? get(col, id) : null), `${col}/${id} ${field}=${want}`);

async function accountIdByName(name) {
  const s = await adminDb.collection("_fakeHl/books/accounts").where("nameLower", "==", name.toLowerCase()).get();
  return s.docs[0]?.id ?? null;
}
const saleTxn = async (saleId) => (await adminDb.doc(`_fakeHl/books/txns/technofluid-office~sale_${saleId}:sale`).get()).data();
const invoiceOf = async (sale) => (await adminDb.doc(`_fakeHl/books/invoices/${sale.hlInvoiceId}`).get()).data();

// Test products: a per-litre can, a per-piece case, a per-bucket grease, one with no price.
const PRODUCTS = [
  { sku: "TEST-SAL-HYD68-26L", product: "TEST SAL Hydraulic", grade: "68", orderableUnit: "26 Ltr Can", productKey: "test-sal-hyd68", packQty: 26, baseUnit: "L", gstPct: 18, hsnCode: null, prices: { pricePer: "per litre", dealerPrice: 14550, distributorPrice: 13800 } },
  { sku: "TEST-SAL-4T-CASE", product: "TEST SAL 4T", grade: "20W-40", orderableUnit: "20x1 liter case", productKey: "test-sal-4t", packQty: 20, baseUnit: "L", gstPct: 18, hsnCode: "27101980", prices: { pricePer: "per piece", dealerPrice: 32000, distributorPrice: 30000 } },
  { sku: "TEST-SAL-NOPRICE", product: "TEST SAL Gear", grade: "90", orderableUnit: "26 Ltr Can", productKey: "test-sal-gear90", packQty: 26, baseUnit: "L", gstPct: 18, hsnCode: null, prices: { pricePer: "per litre", dealerPrice: null, distributorPrice: null } },
];
const POOLS = ["pool_test-sal-hyd68", "pool_test-sal-4t", "pool_test-sal-gear90"];

const COMPANY = {
  legalName: "Lube Chem Industries",
  tradeName: "Technofluid Lubricants",
  gstin: "06AAACL1234M1ZO",
  address: { line1: "Adjoining Central Warehouse, Near Gaushala Road", line2: "Matak Majri", city: "Karnal", pincode: "132001" },
  phone: "+91 88148 85245",
  email: null,
  invoicePrefix: "TF",
};

const partyInput = (name, over = {}) => ({
  name,
  kinds: ["customer"],
  phones: [],
  email: null,
  gstin: null,
  address: { line1: "", line2: "", city: "Karnal", district: "", pincode: "", stateCode: "06" },
  priceTier: "Dealer",
  creditLimitPaise: null,
  notes: null,
  ...over,
});

const sell = (who, customerEntityId, lines, extra = {}) =>
  who.call("createSale", { requestId: rid(), customerEntityId, invoiceDate: today, lines, freightPaise: 0, payments: [], note: null, ...extra });

async function wipe() {
  for (const c of ["sales", "saleRequests", "saleSync", "invoiceSeries", "officeSettings", "moneyEntries", "moneyRequests", "registers", "_fakeHl/books/customers", "_fakeHl/books/accounts", "_fakeHl/books/txns", "_fakeHl/books/invoices", "_fakeHl/books/log"]) {
    const s = await adminDb.collection(c).get();
    await Promise.all(s.docs.map((d) => d.ref.delete()));
  }
  await adminDb.doc("_fakeHl/control").delete();
  const moves = await adminDb.collection("stockMovements").where("itemId", "in", POOLS).get();
  await Promise.all(moves.docs.map((d) => d.ref.delete()));
  for (const p of PRODUCTS) {
    await adminDb.doc(`products/${p.sku}`).delete();
    await adminDb.doc(`product_prices/${p.sku}`).delete();
  }
  for (const id of POOLS) await adminDb.doc(`stockItems/${id}`).delete();
  for (const id of ["walk-in-customer"]) await adminDb.doc(`entities/${id}`).delete();
  const ents = await adminDb.collection("entities").where("nameLower", ">=", "test sal").where("nameLower", "<", "test sam").get();
  for (const d of ents.docs) {
    const h = await d.ref.collection("history").get();
    await Promise.all(h.docs.map((x) => x.ref.delete()));
    await d.ref.delete();
  }
}

let haryana, punjab, noTier;

before(async () => {
  await seedStaff();
  await wipe();
  [admin, accounts, stock, distributor] = await Promise.all([as("admin"), as("accounts"), as("stock"), as("distributor")]);
  for (const { prices, ...p } of PRODUCTS) {
    await adminDb.doc(`products/${p.sku}`).set({ ...p, active: true, deleted: false });
    await adminDb.doc(`product_prices/${p.sku}`).set(prices);
  }
  // 100 L of hydraulic in stock; the 4T pool is made by the first sale.
  await adminDb.doc("stockItems/pool_test-sal-hyd68").set({ kind: "product_pool", productKey: "test-sal-hyd68", name: "TEST SAL Hydraulic 68", nameLower: "test sal hydraulic 68", baseUnit: "L", onHandMilli: 100_000, lastMovementAt: null, deleted: false });
  haryana = (await accounts.call("saveEntity", { requestId: rid(), input: partyInput("TEST SAL Karnal Motors", { gstin: "06AAACL1234M1ZO" }) })).entityId;
  punjab = (await accounts.call("saveEntity", { requestId: rid(), input: partyInput("TEST SAL Ludhiana Traders", { priceTier: "Distributor", gstin: "03AABCP5678Q1ZT", address: { stateCode: "03" } }) })).entityId;
  noTier = (await accounts.call("saveEntity", { requestId: rid(), input: partyInput("TEST SAL No List Yet", { priceTier: null }) })).entityId;
  await admin.call("ensureDefaultRegisters", {});
  for (const [col, id] of [["entities", haryana], ["entities", punjab], ["entities", noTier], ["registers", "default-cash"], ["registers", "default-bank"]]) await status(col, id, "SYNCED");
});

after(async () => {
  await wipe();
  await closeClients();
  await libDb.terminate();
  await fnRequire("firebase-admin/app").deleteApp(fnAdminApp);
});

describe("the shared rules table (sale.cases.json) against the server's copy", () => {
  test("pricing, header and payment checks, invoice numbers, paid state, GST rate, company, words", () => {
    const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
    const project = (r) =>
      !r.ok
        ? { errors: r.errors }
        : {
            lines: r.lines.map((l) => pick(l, ["sku", "qtyMilli", "packPricePaise", "manualPrice", "grossPaise", "discountPaise", "taxablePaise", "gstRateBp", "cgstPaise", "sgstPaise", "igstPaise", "totalPaise"])),
            freight: r.freight,
            totals: pick(r.totals, ["supplyType", "grossPaise", "discountPaise", "taxablePaise", "cgstPaise", "sgstPaise", "igstPaise", "taxPaise", "roundOffPaise", "grandTotalPaise"]),
            missingHsn: r.missingHsn,
          };
    for (const c of CASES.price) {
      const r = model.priceSale({ products: CASES.products, lines: c.input.lines, tier: c.input.tier, sellerStateCode: "06", placeOfSupplyStateCode: c.input.placeOfSupply, freightPaise: c.input.freightPaise });
      assert.deepEqual(project(r), c.expect, c.case);
    }
    for (const c of CASES.header) assert.equal(model.saleError({ ...CASES.headerBase, ...c.input }, CASES.today), c.expect, c.case);
    for (const c of CASES.payment) assert.equal(model.salePaymentError(c.customer, c.grand, c.payments), c.expect, c.case);
    for (const c of CASES.dispatch) {
      const d = model.cleanDispatch(c.dispatch);
      const t = model.cleanShipTo(c.shipTo);
      assert.equal(model.dispatchError(d, t, c.isWalkIn === true), c.expect, c.case);
      if (c.cleaned) assert.deepEqual({ dispatch: d, shipTo: t }, c.cleaned, c.case);
    }
    for (const c of CASES.walkInBuyer) assert.equal(model.walkInBuyerError(c.walkIn, model.cleanWalkInBuyer(c.buyer), c.taxable), c.expect, c.case);
    for (const c of CASES.financialYear) assert.equal(model.financialYear(c.date), c.expect, c.date);
    for (const c of CASES.invoiceNumber) {
      if (c.expect === "THROWS") assert.throws(() => model.invoiceNumber(c.prefix, c.fy, c.seq));
      else assert.equal(model.invoiceNumber(c.prefix, c.fy, c.seq), c.expect);
    }
    for (const c of CASES.paid) assert.equal(model.paidState(c.grand, c.paid), c.expect);
    for (const c of CASES.gstRate) assert.equal(model.gstRateBp(c.pct), c.expect, String(c.pct));
    for (const c of CASES.company) assert.equal(model.companyError({ ...CASES.companyBase, ...c.input }), c.expect, c.case);
    for (const c of CASES.words) assert.equal(model.amountInWords(c.paise), c.expect, String(c.paise));
  });
});

describe("company details", () => {
  test("no billing until the seller is set up; Admin only; the GSTIN is checked and gives the state", async () => {
    await rejectsWith(sell(accounts, haryana, [{ sku: PRODUCTS[0].sku, packs: 1, discountBp: 0 }]), "failed-precondition", /company details/);
    await rejectsWith(accounts.call("saveCompanyProfile", COMPANY), "permission-denied");
    await rejectsWith(admin.call("saveCompanyProfile", { ...COMPANY, gstin: "06AAACL1234M1ZA" }), "invalid-argument", /GSTIN/);
    assert.equal((await admin.call("saveCompanyProfile", COMPANY)).stateCode, "06");
    assert.equal((await getDoc(doc(accounts.db, "officeSettings", "company"))).data().legalName, "Lube Chem Industries");
  });
});

describe("billing", () => {
  const ids = {};

  test("a Haryana sale: next number, priced on the server, CGST + SGST, stock out per pool, posted with its payment", async () => {
    const r = await sell(accounts, haryana, [{ sku: PRODUCTS[0].sku, packs: 2, discountBp: 0 }, { sku: PRODUCTS[1].sku, packs: 1, discountBp: 500 }], {
      freightPaise: 50_000,
      payments: [{ registerId: "default-cash", amountPaise: 500_000 }],
    });
    assert.equal(r.invoiceNo, `TF/${fy}/0001`);
    assert.equal(r.grandTotalPaise, 1_669_200); // the first price case in sale.cases.json
    assert.deepEqual(r.missingHsn, [PRODUCTS[0].sku]);
    ids.first = r.saleId;

    const s = await status("sales", r.saleId, "SYNCED");
    assert.equal(s.totals.cgstPaise, 127_314);
    assert.equal(s.totals.sgstPaise, 127_314);
    assert.equal(s.totals.roundOffPaise, -28);
    assert.equal(s.seller.gstin, COMPANY.gstin);
    assert.equal(s.customer.priceTier, "Dealer");

    // Stock: one "Sold" line per pool, in base units; the 4T pool was made on the way.
    const hyd = await get("stockItems", "pool_test-sal-hyd68");
    assert.equal(hyd.onHandMilli, 100_000 - 52_000);
    assert.equal((await get("stockItems", "pool_test-sal-4t")).onHandMilli, -20_000);
    assert.deepEqual(r.belowZero.map((b) => b.itemId), ["pool_test-sal-4t"]);
    const m = await get("stockMovements", s.stockMovementIds[0]);
    assert.equal(m.type, "SALE");
    assert.equal(m.qtyMilli, -52_000);
    assert.equal(m.note, `Sold · TF/${fy}/0001`);

    // Books: DR the customer 16,692.00; CR revenue 14,145.72 (taxable − 0.28) + Output CGST/SGST.
    const t = await saleTxn(r.saleId);
    const named = {
      [(await get("entities", haryana)).hlAccountId]: "customer",
      [await accountIdByName("Sales Revenue")]: "revenue",
      [await accountIdByName("Output CGST")]: "cgst",
      [await accountIdByName("Output SGST")]: "sgst",
    };
    assert.deepEqual(t.legs.map((l) => [named[l.accountId], l.type, l.amountPaise]), [
      ["customer", "DEBIT", 1_669_200],
      ["revenue", "CREDIT", 1_414_572],
      ["cgst", "CREDIT", 127_314],
      ["sgst", "CREDIT", 127_314],
    ]);
    const inv = await invoiceOf(s);
    assert.equal(inv.invoiceNumber, `TF/${fy}/0001`);
    assert.equal(inv.totalPaise, 1_669_200);
    assert.equal(inv.amountPaidPaise, 500_000);
    assert.equal(inv.status, "PARTIAL");
    assert.ok(s.payments[0].hlTxnId);
    const { balances } = await accounts.call("getEntityBalances", {});
    assert.equal(balances[haryana].balancePaise, 1_169_200);
  });

  test("the next sale takes the next number; a retried request doesn't use one; numbers can't go back in date", async () => {
    const requestId = rid();
    const lines = [{ sku: PRODUCTS[0].sku, packs: 1, discountBp: 0 }];
    const a = await accounts.call("createSale", { requestId, customerEntityId: punjab, invoiceDate: today, lines });
    const again = await accounts.call("createSale", { requestId, customerEntityId: punjab, invoiceDate: today, lines });
    assert.equal(a.invoiceNo, `TF/${fy}/0002`);
    assert.equal(again.saleId, a.saleId);
    assert.equal(again.alreadyDone, true);
    ids.punjab = a.saleId;
    const s = await status("sales", a.saleId, "SYNCED");
    assert.equal(s.totals.supplyType, "INTER_STATE");
    assert.equal(s.lines[0].listPricePaise, 13_800); // the Distributor price list
    assert.equal(s.totals.igstPaise, 64_584);
    if (model.financialYear(yesterday) === fy) {
      await rejectsWith(sell(accounts, haryana, lines, { invoiceDate: yesterday }), "invalid-argument", /can't go backwards/);
    }
    const next = await sell(accounts, haryana, lines);
    assert.equal(next.invoiceNo, `TF/${fy}/0003`);
    ids.third = next.saleId;
  });

  test("refusals: no price list, an unpriced product, more paid than due, the future, Stock & Production", async () => {
    await rejectsWith(sell(accounts, noTier, [{ sku: PRODUCTS[0].sku, packs: 1, discountBp: 0 }]), "invalid-argument", /price list/);
    await assert.rejects(sell(accounts, haryana, [{ sku: PRODUCTS[2].sku, packs: 1, discountBp: 0 }]), (e) => e.details?.code === "NO_PRICE" && /Line 1/.test(e.message));
    await assert.rejects(sell(accounts, haryana, [{ sku: PRODUCTS[0].sku, packs: 1, discountBp: 0 }], { payments: [{ registerId: "default-cash", amountPaise: 99_999_999 }] }), (e) => e.details?.code === "PAYMENT_TOO_MUCH");
    await assert.rejects(sell(accounts, haryana, [{ sku: PRODUCTS[0].sku, packs: 1, discountBp: 0 }], { invoiceDate: "2999-01-01" }), (e) => e.details?.code === "FUTURE_DATE");
    await rejectsWith(sell(stock, haryana, [{ sku: PRODUCTS[0].sku, packs: 1, discountBp: 0 }]), "permission-denied");
  });

  test("a walk-in pays in full now; the walk-in record is made on first use; place of supply is ours", async () => {
    const lines = [{ sku: PRODUCTS[1].sku, packs: 1, discountBp: 0 }];
    await assert.rejects(sell(accounts, "walk-in-customer", lines), (e) => e.details?.code === "WALK_IN_MUST_PAY_FULL");
    // 6,400 + 18% = 7,552.00
    const r = await sell(accounts, "walk-in-customer", lines, { payments: [{ registerId: "default-cash", amountPaise: 400_000 }, { registerId: "default-bank", amountPaise: 355_200 }] });
    assert.equal(r.grandTotalPaise, 755_200);
    assert.ok(await get("entities", "walk-in-customer"));
    await status("entities", "walk-in-customer", "SYNCED");
    const s = await status("sales", r.saleId, "SYNCED");
    assert.equal(s.placeOfSupply, "06");
    assert.equal((await invoiceOf(s)).status, "PAID");
  });

  test("money received against an invoice: applied to it in the books; never more than is due; the right customer only", async () => {
    // Invoice 0001: 16,692 total, 5,000 paid at billing → 11,692 due.
    await assert.rejects(
      accounts.call("recordMoneyEntry", { requestId: rid(), from: { kind: "PARTY", entityId: haryana, name: "x" }, to: { kind: "BANK", registerId: "default-bank", name: "x" }, amountPaise: 1_169_201, businessDay: today, note: null, saleId: ids.first }),
      (e) => e.details?.code === "MORE_THAN_DUE",
    );
    await rejectsWith(
      accounts.call("recordMoneyEntry", { requestId: rid(), from: { kind: "PARTY", entityId: punjab, name: "x" }, to: { kind: "BANK", registerId: "default-bank", name: "x" }, amountPaise: 100, businessDay: today, note: null, saleId: ids.first }),
      "invalid-argument",
      /not TEST SAL Ludhiana Traders/,
    );
    const { entryId } = await accounts.call("recordMoneyEntry", { requestId: rid(), from: { kind: "PARTY", entityId: haryana, name: "x" }, to: { kind: "BANK", registerId: "default-bank", name: "x" }, amountPaise: 1_169_200, businessDay: today, note: "Cheque 4411", saleId: ids.first });
    const e = await status("moneyEntries", entryId, "SYNCED");
    assert.equal(e.invoiceNo, `TF/${fy}/0001`);
    const s = await get("sales", ids.first);
    const inv = await invoiceOf(s);
    assert.equal(inv.status, "PAID");
    assert.equal(inv.amountPaidPaise, 1_669_200);
    const t = (await adminDb.doc(`_fakeHl/books/txns/technofluid-office~money_${entryId}`).get()).data();
    assert.match(t.description, /Payment received for TF\//);
  });
});

describe("cancelling", () => {
  test("stock comes back, the invoice is cancelled in the books, the number stays used; once only; not from the stock screen", async () => {
    const r = await sell(accounts, haryana, [{ sku: PRODUCTS[0].sku, packs: 1, discountBp: 0 }]);
    const s = await status("sales", r.saleId, "SYNCED");
    const before = (await get("stockItems", "pool_test-sal-hyd68")).onHandMilli;
    await rejectsWith(stock.call("reverseStockMovement", { movementId: s.stockMovementIds[0], note: "Try undo" }), "failed-precondition", /cancel the invoice/);
    await rejectsWith(accounts.call("cancelSale", { requestId: rid(), saleId: r.saleId, reason: "" }), "invalid-argument", /reason/);
    await accounts.call("cancelSale", { requestId: rid(), saleId: r.saleId, reason: "Wrong customer" });
    const c = await status("sales", r.saleId, "SYNCED", "cancelSyncStatus");
    assert.equal(c.status, "CANCELLED");
    assert.equal(c.cancel.reason, "Wrong customer");
    assert.equal((await get("stockItems", "pool_test-sal-hyd68")).onHandMilli, before + 26_000);
    assert.equal((await invoiceOf(c)).status, "CANCELLED");
    const mirror = (await adminDb.doc(`_fakeHl/books/txns/technofluid-office~reversal_${c.hlSaleTxnId}`).get()).data();
    assert.equal(mirror.postingType, "REVERSAL");
    await rejectsWith(accounts.call("cancelSale", { requestId: rid(), saleId: r.saleId, reason: "again" }), "failed-precondition", /already cancelled/);
    const next = await sell(accounts, haryana, [{ sku: PRODUCTS[0].sku, packs: 1, discountBp: 0 }]);
    assert.equal(Number(next.invoiceNo.slice(-4)), Number(r.invoiceNo.slice(-4)) + 1);
  });

  test("cancelled before it reached the books: it is posted (with the cash taken) and then cancelled", async () => {
    await control({ down: true });
    const r = await sell(accounts, "walk-in-customer", [{ sku: PRODUCTS[1].sku, packs: 1, discountBp: 0 }], { payments: [{ registerId: "default-cash", amountPaise: 755_200 }] });
    await status("sales", r.saleId, "FAILED");
    await accounts.call("cancelSale", { requestId: rid(), saleId: r.saleId, reason: "Customer changed mind" });
    assert.equal((await get("sales", r.saleId)).cancelSyncStatus, null);
    await control({});
    await accounts.call("retrySaleSync", { saleId: r.saleId });
    const s = await status("sales", r.saleId, "SYNCED", "cancelSyncStatus");
    assert.equal(s.syncStatus, "SYNCED");
    assert.equal((await invoiceOf(s)).status, "CANCELLED");
    // The cash taken stays in the books — as the walk-in's credit, to be paid back.
    const pay = (await adminDb.doc(`_fakeHl/books/txns/technofluid-office~sale_${r.saleId}:payment_0`).get()).data();
    assert.equal(pay.legs[0].amountPaise, 755_200);
  });
});

describe("books not connected, reconcile, rules", () => {
  test("off: a sale is left PENDING with nothing posted; the reconcile posts it once the books are back", async () => {
    const { saleId } = await (async () => {
      await control({ down: true });
      const r = await sell(accounts, haryana, [{ sku: PRODUCTS[0].sku, packs: 1, discountBp: 0 }]);
      await status("sales", r.saleId, "FAILED");
      return r;
    })();
    await control({});
    assert.equal(await syncSale(libDb, new NotConnectedHlClient(), saleId), "skipped");
    assert.equal((await get("sales", saleId)).syncStatus, "FAILED");
    // Reconcile skips docs touched in the last 3 minutes — pretend it's later.
    await reconcileLedgerOnce(libDb, new FakeHlClient(libDb), Date.now() + 10 * 60_000);
    assert.equal((await get("sales", saleId)).syncStatus, "SYNCED");
  });

  test("Admin and Accounts read sales; Stock & Production and distributors don't; nobody writes; series are server-only", async () => {
    const one = (await adminDb.collection("sales").limit(1).get()).docs[0].id;
    assert.ok((await getDoc(doc(accounts.db, "sales", one))).exists());
    assert.ok((await getDoc(doc(admin.db, "sales", one))).exists());
    await denied(getDoc(doc(stock.db, "sales", one)));
    await denied(getDoc(doc(distributor.db, "sales", one)));
    await denied(getDoc(doc(stock.db, "officeSettings", "company")));
    await denied(setDoc(doc(admin.db, "sales", "x"), { status: "ACTIVE" }));
    await denied(setDoc(doc(admin.db, "officeSettings", "company"), COMPANY));
    await denied(getDoc(doc(admin.db, "invoiceSeries", fy)));
    await denied(getDoc(doc(admin.db, "saleSync", one)));
  });
});

describe("an Admin's one-off price; the walk-in buyer", () => {
  test("only an Admin may price a product with no price, for that sale only; a priced product can't be re-priced", async () => {
    const line = { sku: PRODUCTS[2].sku, packs: 2, discountBp: 1000, manualPackPricePaise: 400_000 };
    await rejectsWith(sell(accounts, haryana, [line]), "permission-denied", /Only an Admin/);
    await assert.rejects(sell(admin, haryana, [{ sku: PRODUCTS[0].sku, packs: 1, discountBp: 0, manualPackPricePaise: 100 }]), (e) => e.details?.code === "MANUAL_PRICE_NOT_ALLOWED");
    // The same figures as the one-off price case in sale.cases.json.
    const r = await sell(admin, haryana, [line]);
    assert.equal(r.grandTotalPaise, 849_600);
    const s = await get("sales", r.saleId);
    assert.equal(s.lines[0].manualPrice, true);
    assert.equal(s.lines[0].packPricePaise, 400_000);
    // The product itself still has no price.
    assert.equal((await get("product_prices", PRODUCTS[2].sku)).dealerPrice, null);
  });

  test("a walk-in bill of ₹50,000 or more needs the buyer's name and address; they're printed on the sale", async () => {
    // 8 cases × 6,400 = 51,200 taxable + 18% = 60,416.00
    const lines = [{ sku: PRODUCTS[1].sku, packs: 8, discountBp: 0 }];
    const payments = [{ registerId: "default-cash", amountPaise: 6_041_600 }];
    await assert.rejects(sell(accounts, "walk-in-customer", lines, { payments }), (e) => e.details?.code === "BUYER_NEEDED");
    await assert.rejects(sell(accounts, "walk-in-customer", lines, { payments, walkInBuyer: { name: "Ravi Kumar", phone: "", address: "" } }), (e) => e.details?.code === "BUYER_NEEDED");
    const r = await sell(accounts, "walk-in-customer", lines, { payments, walkInBuyer: { name: "  Ravi   Kumar ", phone: "98765 43210", address: "Sector 12, Panipat" } });
    const s = await get("sales", r.saleId);
    assert.deepEqual(s.customer.buyer, { name: "Ravi Kumar", phone: "98765 43210", address: "Sector 12, Panipat" });
    assert.equal(s.customer.name, "Walk-in / cash customer");
    // Buyer details belong to a walk-in only.
    await assert.rejects(sell(accounts, haryana, [{ sku: PRODUCTS[0].sku, packs: 1, discountBp: 0 }], { walkInBuyer: { name: "Ravi" } }), (e) => e.details?.code === "BUYER_NOT_WALK_IN");
  });
});

describe("dispatch details and ship-to", () => {
  test("stored on the sale as typed (tidied); bad ones refused; GST unchanged", async () => {
    const lines = [{ sku: PRODUCTS[0].sku, packs: 1, discountBp: 0 }];
    await assert.rejects(sell(accounts, haryana, lines, { dispatch: { ewayBillNo: "123" } }), (e) => e.details?.code === "BAD_EWAY_BILL");
    await assert.rejects(sell(accounts, haryana, lines, { shipTo: { address: "Godown road" } }), (e) => e.details?.code === "SHIP_TO_NO_NAME");
    const r = await sell(accounts, haryana, lines, {
      dispatch: { transport: " Sample Transport ", vehicleNo: "hr 99 x 0001", station: "Jagadhri", ewayBillNo: "3000 0000 0001" },
      shipTo: { name: "TEST SAL Godown", address: "Plot 7", city: "Ludhiana", pincode: "141001", stateCode: "03" },
    });
    const s = await get("sales", r.saleId);
    assert.deepEqual(s.dispatch, { transport: "Sample Transport", vehicleNo: "HR99X0001", station: "Jagadhri", ewayBillNo: "300000000001" });
    assert.deepEqual(s.shipTo, { name: "TEST SAL Godown", address: "Plot 7", city: "Ludhiana", pincode: "141001", stateCode: "03", gstin: null });
    // Shipped to Punjab, billed to Haryana: still CGST + SGST (the billed-to state).
    assert.equal(s.placeOfSupply, "06");
    assert.equal(s.totals.supplyType, "INTRA_STATE");
    const plain = await get("sales", (await sell(accounts, haryana, lines)).saleId);
    assert.equal(plain.dispatch, null);
    assert.equal(plain.shipTo, null);
  });

  test("a walk-in can't ship elsewhere; a ship-to GSTIN must match the ship-to state", async () => {
    const lines = [{ sku: PRODUCTS[0].sku, packs: 1, discountBp: 0 }];
    await assert.rejects(
      sell(accounts, "walk-in-customer", lines, { shipTo: { name: "Godown", stateCode: "03" }, payments: [{ registerId: "default-cash", amountPaise: 1 }] }),
      (e) => e.details?.code === "SHIP_TO_WALK_IN",
    );
    await assert.rejects(sell(accounts, haryana, lines, { shipTo: { name: "Godown", stateCode: "03", gstin: "22AAACL1234M1ZU" } }), (e) => e.details?.code === "SHIP_TO_GSTIN_STATE");
  });
});

describe("bank details and terms are frozen on the sale", () => {
  test("a later Settings change doesn't change an earlier invoice", async () => {
    const lines = [{ sku: PRODUCTS[0].sku, packs: 1, discountBp: 0 }];
    const bank = { name: "Sample Bank", branch: "Karnal", accountType: "CA", accountNo: "000000001234", ifsc: "SBIN0001234" };
    await admin.call("saveCompanyProfile", { ...COMPANY, bank: { ...bank, ifsc: " sbin0001234 " }, invoiceTerms: ["E.& O.E.", "1. Sample term."] });
    const firstId = (await sell(accounts, haryana, lines)).saleId;
    const first = await get("sales", firstId);
    assert.deepEqual(first.seller.bank, bank);
    assert.deepEqual(first.seller.invoiceTerms, ["E.& O.E.", "1. Sample term."]);
    await rejectsWith(admin.call("saveCompanyProfile", { ...COMPANY, bank: { ...bank, ifsc: "SBIN00012345" } }), "invalid-argument", /IFSC/);
    await admin.call("saveCompanyProfile", COMPANY);
    assert.deepEqual((await get("sales", firstId)).seller.bank, bank);
    const later = await get("sales", (await sell(accounts, haryana, lines)).saleId);
    assert.equal(later.seller.bank, null);
    assert.deepEqual(later.seller.invoiceTerms, []);
  });
});
