/**
 * Purchases (brief: docs/office/purchases-brief.md) with the fake Humble Ledger: the
 * shared rules table against the server's copy, PB numbering, duplicates, stock in (and
 * "already counted"), posting (inventory + input GST against the supplier, payouts),
 * payments later, cancelling, "books not connected", and the rules.
 * Real rules and Cloud Functions in throw-away emulators. Made-up suppliers only.
 *
 *   npm run test:emulator
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { adminDb, as, closeClients, denied, PROJECT, rejectsWith, seedStaff } from "./helpers.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const CASES = JSON.parse(readFileSync(path.resolve(here, "../../core/src/purchase.cases.json"), "utf8"));
const fnRequire = createRequire(path.join(path.resolve(here, "../../../firebase/functions"), "package.json"));
const model = fnRequire("./lib/purchases/purchaseModel.js");
const { syncPurchase } = fnRequire("./lib/purchases/sync.js");
const { reconcileLedgerOnce } = fnRequire("./lib/money/sync.js");
const { FakeHlClient } = fnRequire("./lib/ledger/fakeHlClient.js");
const { NotConnectedHlClient } = fnRequire("./lib/ledger/hlClient.js");
const fnAdminApp = fnRequire("firebase-admin/app").initializeApp({ projectId: PROJECT }, `fn-purchases-${process.pid}`);
const libDb = fnRequire("firebase-admin/firestore").getFirestore(fnAdminApp);

let admin, accounts, stock;
let n = 0;
const rid = () => `test-pur-${process.pid}-${Date.now()}-${n++}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() - 86_400_000));
const fy = model.purchaseFinancialYear(yesterday);
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
const txn = async (sourceId) => (await adminDb.doc(`_fakeHl/books/txns/technofluid-office~${sourceId}`).get()).data();
async function accountIdByName(name) {
  const s = await adminDb.collection("_fakeHl/books/accounts").where("nameLower", "==", name.toLowerCase()).get();
  return s.docs[0]?.id ?? null;
}
const net = (legs) => legs.reduce((s, l) => s + (l.type === "DEBIT" ? l.amountPaise : -l.amountPaise), 0);

// Made-up stock items: a raw material, a consumable, a bought-in product pool, a premix, one with no unit.
const ITEMS = {
  oil: { kind: "raw_material", name: "TEST PUR Base Oil", baseUnit: "L" },
  can: { kind: "consumable", name: "TEST PUR 26 L Can", baseUnit: "piece" },
  pool: { kind: "product_pool", name: "TEST PUR Bought Grease", baseUnit: "kg" },
  premix: { kind: "premix", name: "TEST PUR Premix", baseUnit: "L" },
  nounit: { kind: "raw_material", name: "TEST PUR Additive", baseUnit: null },
};
const itemId = (k) => `test-pur-${k}`;

const partyInput = (name, over = {}) => ({
  name,
  kinds: ["supplier"],
  phones: [],
  email: null,
  gstin: null,
  address: { line1: "", line2: "", city: "Karnal", district: "", pincode: "", stateCode: "06" },
  priceTier: null,
  creditLimitPaise: null,
  notes: null,
  ...over,
});

/** A bill of 500 L base oil at ₹90/L, 18 % — ₹53,100.00 from a Haryana supplier. */
const oilBill = (supplierEntityId, over = {}) => ({
  requestId: rid(),
  supplierEntityId,
  billNo: "TP-001",
  billDate: yesterday,
  lines: [{ itemId: itemId("oil"), qtyMilli: 500_000, taxablePaise: 4_500_000, gstRateBp: 1800 }],
  freightPaise: 0,
  roundOffPaise: 0,
  supplierBillTotalPaise: 5_310_000,
  payments: [],
  stockAlreadyCounted: false,
  note: null,
  ...over,
});
const buy = (who, data) => who.call("createPurchase", data);

async function wipe() {
  for (const c of ["purchases", "purchaseRequests", "purchaseSync", "purchaseSeries", "moneyEntries", "moneyRequests", "registers", "_fakeHl/books/customers", "_fakeHl/books/accounts", "_fakeHl/books/txns", "_fakeHl/books/invoices", "_fakeHl/books/log"]) {
    const s = await adminDb.collection(c).get();
    await Promise.all(s.docs.map((d) => d.ref.delete()));
  }
  await adminDb.doc("_fakeHl/control").delete();
  const ids = Object.keys(ITEMS).map(itemId);
  const moves = await adminDb.collection("stockMovements").where("itemId", "in", ids).get();
  await Promise.all(moves.docs.map((d) => d.ref.delete()));
  for (const id of ids) await adminDb.doc(`stockItems/${id}`).delete();
  const ents = await adminDb.collection("entities").where("nameLower", ">=", "test pur").where("nameLower", "<", "test pus").get();
  for (const d of ents.docs) {
    const h = await d.ref.collection("history").get();
    await Promise.all(h.docs.map((x) => x.ref.delete()));
    await d.ref.delete();
  }
}

let haryana, delhi, unregistered;

before(async () => {
  await seedStaff();
  await wipe();
  [admin, accounts, stock] = await Promise.all([as("admin"), as("accounts"), as("stock")]);
  for (const [k, it] of Object.entries(ITEMS)) {
    await adminDb.doc(`stockItems/${itemId(k)}`).set({ ...it, nameLower: it.name.toLowerCase(), code: null, aliases: [], onHandMilli: k === "oil" ? 100_000 : 0, lastMovementAt: null, deleted: false });
  }
  haryana = (await accounts.call("saveEntity", { requestId: rid(), input: partyInput("TEST PUR Haryana Oils", { gstin: "06AACCF5678G1ZH" }) })).entityId;
  delhi = (await accounts.call("saveEntity", { requestId: rid(), input: partyInput("TEST PUR Delhi Cans", { gstin: "07AABCD1234E1ZA", address: { stateCode: "07" } }) })).entityId;
  unregistered = (await accounts.call("saveEntity", { requestId: rid(), input: partyInput("TEST PUR Local Grease") })).entityId;
  await admin.call("ensureDefaultRegisters", {});
  for (const [col, id] of [["entities", haryana], ["entities", delhi], ["entities", unregistered], ["registers", "default-cash"], ["registers", "default-bank"]]) await status(col, id, "SYNCED");
});

after(async () => {
  await wipe();
  await closeClients();
  await libDb.terminate();
  await fnRequire("firebase-admin/app").deleteApp(fnAdminApp);
});

describe("the shared rules table (purchase.cases.json) against the server's copy", () => {
  test("pricing, header and totals checks, references, bill-number keys, round-off, FY", () => {
    for (const c of CASES.price) {
      const r = model.pricePurchase({ items: CASES.items, lines: c.input.lines, freightPaise: c.input.freightPaise, supplierStateCode: c.input.supplierState, sellerStateCode: CASES.seller, roundOffPaise: c.input.roundOffPaise });
      const got = !r.ok
        ? { errors: r.errors }
        : (() => {
            const { byRate, ...totals } = r.totals;
            return {
              lines: r.lines.map(({ itemName, itemKind, baseUnit, ...l }) => l),
              freight: r.freight,
              totals,
              ...("byRate" in c.expect ? { byRate } : {}),
            };
          })();
      assert.deepEqual(got, c.expect, c.case);
    }
    for (const c of CASES.header) assert.equal(model.purchaseError({ ...CASES.headerBase, ...c.input }, CASES.today), c.expect, c.case);
    for (const c of CASES.totals) assert.equal(model.purchaseTotalsError(c.totals, c.supplierTotal, c.payments), c.expect, c.case);
    for (const c of CASES.refs) assert.equal(model.purchaseRef(c.fy, c.seq), c.expect);
    for (const c of CASES.billNoKeys) assert.equal(model.billNoKey(c.in), c.expect);
    for (const c of CASES.roundOff) assert.equal(model.suggestRoundOff(c.exact), c.expect);
    for (const c of CASES.fy) assert.equal(model.purchaseFinancialYear(c.date), c.expect);
  });
});

describe("recording a bill", () => {
  const ids = {};

  test("Haryana supplier: PB number, re-priced, stock in with no money on the stock line, CGST + SGST input, paid part now", async () => {
    const r = await buy(accounts, oilBill(haryana, { payments: [{ registerId: "default-cash", amountPaise: 1_000_000 }] }));
    assert.equal(r.ref, `PB/${fy}/0001`);
    assert.equal(r.billTotalPaise, 5_310_000);
    ids.oil = r.purchaseId;

    const p = await status("purchases", r.purchaseId, "SYNCED");
    assert.equal(p.supplyType, "INTRA");
    assert.equal(p.billNoKey, "TP-001");
    assert.equal(p.lines[0].unitCostPaise, 9000); // ₹90.00 / L
    assert.equal(p.lines[0].lineCostPaise, 4_500_000);
    assert.equal(p.paidAtPurchasePaise, 1_000_000);

    // Stock: +500 L in base units; the diary line says where it came from but carries no money.
    assert.equal((await get("stockItems", itemId("oil"))).onHandMilli, 600_000);
    const m = await get("stockMovements", p.stockMovementIds[0]);
    assert.equal(m.type, "PURCHASE");
    assert.equal(m.qtyMilli, 500_000);
    assert.equal(m.note, `Bought · PB/${fy}/0001`);
    assert.equal(m.journalDate, yesterday);
    for (const k of Object.keys(m)) assert.doesNotMatch(k, /paise|cost|price|supplier/i, `no money on the stock line (${k})`);

    // Books: DR inventory 45,000 + DR input CGST/SGST 4,050 each = CR supplier 53,100.
    const t = await txn(`purchase_${r.purchaseId}:bill`);
    assert.equal(t.postingType, "PURCHASE");
    const named = {
      [(await get("entities", haryana)).hlAccountId]: "supplier",
      [await accountIdByName("Inventory · Purchased stock")]: "inventory",
      [await accountIdByName("Input CGST")]: "cgst",
      [await accountIdByName("Input SGST")]: "sgst",
    };
    assert.deepEqual(t.legs.map((l) => [named[l.accountId], l.type, l.amountPaise]), [
      ["inventory", "DEBIT", 4_500_000],
      ["cgst", "DEBIT", 405_000],
      ["sgst", "DEBIT", 405_000],
      ["supplier", "CREDIT", 5_310_000],
    ]);
    assert.deepEqual(p.hlLegs, t.legs);
    // The payment with the bill: a payout from cash to the supplier.
    const pay = await txn(`purchase_${r.purchaseId}:payout_0`);
    assert.equal(pay.postingType, "PAYOUT");
    assert.equal(pay.legs.find((l) => l.type === "DEBIT").accountId, (await get("entities", haryana)).hlAccountId);
    assert.deepEqual(p.paymentTxnIds, [p.payments[0].hlTxnId]);
  });

  test("the same supplier's bill number twice is refused (spaces and capitals ignored); retries are harmless", async () => {
    await rejectsWith(buy(accounts, oilBill(haryana, { billNo: " tp-001 " })), "already-exists", new RegExp(`PB/${fy}/0001`));
    const again = oilBill(delhi, { billNo: "TP-001", lines: [{ itemId: itemId("can"), qtyMilli: 10_000, taxablePaise: 100_000, gstRateBp: 1800 }], supplierBillTotalPaise: 118_000 });
    const a = await buy(accounts, again);
    const b = await buy(accounts, again); // same requestId → the same answer, nothing new
    assert.equal(b.alreadyDone, true);
    assert.equal(b.purchaseId, a.purchaseId);
    assert.equal(a.ref, `PB/${fy}/0002`);
    assert.equal((await get("stockItems", itemId("can"))).onHandMilli, 10_000);
  });

  test("Delhi supplier: IGST, freight at the highest rate, round-off; a total that doesn't match is refused with both figures", async () => {
    const bill = {
      billNo: "DC/77",
      lines: [{ itemId: itemId("can"), qtyMilli: 200_000, taxablePaise: 1_234_567, gstRateBp: 1800 }],
      freightPaise: 10_000,
      roundOffPaise: -9,
    };
    // exact 1,234,567 + 10,000 = 1,244,567 taxable; IGST 18 % = 224,022 → 1,468,589; −9 → 1,468,580.
    await rejectsWith(buy(accounts, oilBill(delhi, { ...bill, supplierBillTotalPaise: 1_468_600 })), "invalid-argument", /₹14,685\.80.*₹14,686 /);
    const r = await buy(accounts, oilBill(delhi, { ...bill, supplierBillTotalPaise: 1_468_580 }));
    const p = await status("purchases", r.purchaseId, "SYNCED");
    assert.equal(p.supplyType, "INTER");
    assert.equal(p.freight.igstPaise, 1_800);
    assert.equal(p.totals.subtotalPaise, 1_244_558);
    const t = await txn(`purchase_${r.purchaseId}:bill`);
    assert.equal(net(t.legs), 0);
    assert.deepEqual(t.legs.map((l) => [l.type, l.amountPaise]), [["DEBIT", 1_244_558], ["DEBIT", 224_022], ["CREDIT", 1_468_580]]);
  });

  test("goods already counted in stock: the books only, no stock line", async () => {
    const before = (await get("stockItems", itemId("oil"))).onHandMilli;
    const r = await buy(accounts, oilBill(haryana, { billNo: "TP-002", stockAlreadyCounted: true }));
    const p = await status("purchases", r.purchaseId, "SYNCED");
    assert.deepEqual(p.stockMovementIds, []);
    assert.equal((await get("stockItems", itemId("oil"))).onHandMilli, before);
    assert.ok(await txn(`purchase_${r.purchaseId}:bill`));
  });

  test("unregistered supplier: GST refused, 0 % accepted, no input-tax legs", async () => {
    const line = { itemId: itemId("pool"), qtyMilli: 50_000, taxablePaise: 800_000, gstRateBp: 1800 };
    await rejectsWith(buy(accounts, oilBill(unregistered, { billNo: "L-1", lines: [line], supplierBillTotalPaise: 944_000 })), "invalid-argument", /no GSTIN/);
    const r = await buy(accounts, oilBill(unregistered, { billNo: "L-1", lines: [{ ...line, gstRateBp: 0 }], supplierBillTotalPaise: 800_000 }));
    const p = await status("purchases", r.purchaseId, "SYNCED");
    assert.equal(p.supplyType, "NONE");
    assert.equal(p.supplier.gstin, null);
    const t = await txn(`purchase_${r.purchaseId}:bill`);
    assert.equal(t.legs.length, 2);
    assert.equal((await get("stockItems", itemId("pool"))).onHandMilli, 50_000);
  });

  test("refused: premix, an item with no unit, the walk-in, a future date; Stock & Production can't record", async () => {
    const one = (k) => [{ itemId: itemId(k), qtyMilli: 1_000, taxablePaise: 10_000, gstRateBp: 1800 }];
    await rejectsWith(buy(accounts, oilBill(haryana, { billNo: "X1", lines: one("premix"), supplierBillTotalPaise: 11_800 })), "invalid-argument", /made in the factory/);
    await rejectsWith(buy(accounts, oilBill(haryana, { billNo: "X2", lines: one("nounit"), supplierBillTotalPaise: 11_800 })), "invalid-argument", /no unit/);
    await rejectsWith(buy(accounts, oilBill("walk-in-customer", { billNo: "X3" })), "invalid-argument", /walk-in/);
    await rejectsWith(buy(accounts, oilBill(haryana, { billNo: "X4", billDate: "2999-01-01" })), "invalid-argument", /future/);
    await rejectsWith(buy(stock, oilBill(haryana, { billNo: "X5" })), "permission-denied");
  });

  test("paying later: never more than still due, only to the bill's supplier; then paid in full", async () => {
    const pay = (amountPaise, to = haryana) =>
      accounts.call("recordMoneyEntry", {
        requestId: rid(),
        from: { kind: "BANK", registerId: "default-bank" },
        to: { kind: "PARTY", entityId: to },
        amountPaise,
        businessDay: today,
        note: null,
        purchaseId: ids.oil,
      });
    // 53,100 − 10,000 paid with the bill = 43,100 due.
    await rejectsWith(pay(4_310_001), "invalid-argument", /still due/);
    await rejectsWith(pay(100, delhi), "invalid-argument", /Haryana Oils's bill/);
    const { entryId } = await pay(4_310_000);
    const e = await status("moneyEntries", entryId, "SYNCED");
    assert.equal(e.purchaseRef, `PB/${fy}/0001`);
    assert.ok(e.sideIds.includes(ids.oil));
    await rejectsWith(pay(1), "invalid-argument", /paid in full/);
  });
});

describe("cancelling", () => {
  test("stock goes back out, the books reverse exactly, a second cancel is refused, the stock line can't be undone on its own", async () => {
    const r = await buy(accounts, oilBill(haryana, { billNo: "TP-C1" }));
    const p = await status("purchases", r.purchaseId, "SYNCED");
    await rejectsWith(admin.call("reverseStockMovement", { movementId: p.stockMovementIds[0], note: "oops" }), "failed-precondition", /cancel the purchase/);
    const before = (await get("stockItems", itemId("oil"))).onHandMilli;

    await rejectsWith(accounts.call("cancelPurchase", { requestId: rid(), purchaseId: r.purchaseId, reason: " " }), "invalid-argument", /reason/);
    const c = await accounts.call("cancelPurchase", { requestId: rid(), purchaseId: r.purchaseId, reason: "Wrong rate typed" });
    assert.equal(c.ref, p.ref);
    assert.equal((await get("stockItems", itemId("oil"))).onHandMilli, before - 500_000);
    const back = await get("stockMovements", `purchasecancel_${r.purchaseId}-0`);
    assert.equal(back.type, "PURCHASE_CANCEL");
    assert.equal(back.qtyMilli, -500_000);
    assert.equal(back.journalDate, today);

    const done = await status("purchases", r.purchaseId, "SYNCED", "cancelSyncStatus");
    const bill = await txn(`purchase_${r.purchaseId}:bill`);
    const rev = await txn(`purchase_${r.purchaseId}:cancel`);
    assert.equal(rev.postingType, "REVERSAL");
    assert.equal(done.cancelHlTxnId, `technofluid-office~purchase_${r.purchaseId}:cancel`);
    assert.equal(net([...bill.legs, ...rev.legs]), 0);
    for (const l of bill.legs) assert.ok(rev.legs.some((x) => x.accountId === l.accountId && x.amountPaise === l.amountPaise && x.type !== l.type));

    await rejectsWith(accounts.call("cancelPurchase", { requestId: rid(), purchaseId: r.purchaseId, reason: "again" }), "failed-precondition", /already cancelled/);
    // A cancelled bill's number can be entered again.
    const again = await buy(accounts, oilBill(haryana, { billNo: "TP-C1" }));
    assert.ok(again.purchaseId);
  });

  test("cancelled before it reached the books: posted first, then reversed (via Retry)", async () => {
    await control({ down: true });
    const r = await buy(accounts, oilBill(haryana, { billNo: "TP-C2", payments: [{ registerId: "default-cash", amountPaise: 500_000 }] }));
    await status("purchases", r.purchaseId, "FAILED");
    await accounts.call("cancelPurchase", { requestId: rid(), purchaseId: r.purchaseId, reason: "Duplicate of a paper bill" });
    assert.equal((await get("purchases", r.purchaseId)).cancelSyncStatus, null);
    await control({});
    assert.equal((await accounts.call("retryPurchaseSync", { purchaseId: r.purchaseId })).retrying, "bill");
    const p = await status("purchases", r.purchaseId, "SYNCED", "cancelSyncStatus");
    assert.equal(p.syncStatus, "SYNCED");
    assert.ok(await txn(`purchase_${r.purchaseId}:payout_0`)); // the cash paid stays in the books
    assert.equal(net([...(await txn(`purchase_${r.purchaseId}:bill`)).legs, ...(await txn(`purchase_${r.purchaseId}:cancel`)).legs]), 0);

    // The supplier's statement labels all three from our own records (txnSources).
    const st = await accounts.call("getEntityStatement", { entityId: haryana, from: "2026-04-01", to: today });
    const whats = st.rows.map((x) => x.what);
    assert.ok(whats.includes(`Purchase ${p.ref} (bill TP-C2)`), whats.join(" | "));
    assert.ok(whats.includes(`Payment made for ${p.ref} (bill TP-C2)`), whats.join(" | "));
    assert.ok(whats.includes(`Purchase ${p.ref} cancelled`), whats.join(" | "));
  });
});

describe("books not connected, reconcile, rules", () => {
  test("off: left as it is with nothing posted; the reconcile posts it once the books are back", async () => {
    await control({ down: true });
    const r = await buy(accounts, oilBill(delhi, { billNo: "OFF-1", lines: [{ itemId: itemId("can"), qtyMilli: 1_000, taxablePaise: 10_000, gstRateBp: 1800 }], supplierBillTotalPaise: 11_800 }));
    await status("purchases", r.purchaseId, "FAILED");
    await control({});
    assert.equal(await syncPurchase(libDb, new NotConnectedHlClient(), r.purchaseId), "skipped");
    assert.equal((await get("purchases", r.purchaseId)).syncStatus, "FAILED");
    // Reconcile skips docs touched in the last 3 minutes — pretend it's later.
    const out = await reconcileLedgerOnce(libDb, new FakeHlClient(libDb), Date.now() + 10 * 60_000);
    assert.ok(out.purchases.synced >= 1);
    assert.equal((await get("purchases", r.purchaseId)).syncStatus, "SYNCED");
  });

  test("Stock & Production can't read purchases but can read the stock lines; nobody writes purchases from the app", async () => {
    const q = await adminDb.collection("purchases").limit(1).get();
    const id = q.docs[0].id;
    await denied(getDoc(doc(stock.db, "purchases", id)));
    await denied(getDocs(query(collection(stock.db, "purchases"))));
    assert.equal((await getDoc(doc(accounts.db, "purchases", id))).exists(), true);
    assert.equal((await getDoc(doc(admin.db, "purchases", id))).exists(), true);
    const lines = await getDocs(query(collection(stock.db, "stockMovements"), where("itemId", "==", itemId("oil"))));
    assert.ok(lines.docs.some((d) => d.data().type === "PURCHASE"));
    await denied(setDoc(doc(admin.db, "purchases", "x"), { status: "ACTIVE" }));
    for (const c of ["purchaseSeries", "purchaseRequests", "purchaseSync"]) await denied(getDoc(doc(admin.db, c, "x")));
  });
});
