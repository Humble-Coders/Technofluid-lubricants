/**
 * Tests the editProduct and addProduct Cloud Functions, the productChanges rules and the
 * importer's "keep office edits" rule — real rules and functions, in throw-away emulators.
 *
 *   npm run test:emulator
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { collection, getDocs, query, where } from "firebase/firestore";
import { adminDb, as, closeClients, rejectsWith, seedStaff } from "./helpers.mjs";

const SKU = "TEST-EDIT-26L";
const COPY_SKU = "TEST-EDIT-210L";
const BASE = {
  sku: SKU,
  product: "TEST HYDRAULIC OIL",
  grade: "68",
  productKey: "test-hydraulic-oil-68",
  category: "bulk_oil",
  orderableUnit: "26 L can",
  packQty: 26,
  baseUnit: "L",
  pricePer: "per litre",
  dealerPrice: null,
  distributorPrice: null,
  gstPct: 18,
  segment: "Industrial",
  densityKgPerL: null,
  recipe: ["w150/100"],
  active: true,
  deleted: false,
};


async function changeLog(sku = SKU) {
  const snap = await adminDb.collection("productChanges").where("sku", "==", sku).get();
  return snap.docs.map((d) => d.data());
}

const prices = async (sku) => (await adminDb.doc(`product_prices/${sku}`).get()).data();
const product = async (sku) => (await adminDb.doc(`products/${sku}`).get()).data();

async function cleanUp() {
  for (const sku of [SKU, COPY_SKU]) {
    await adminDb.doc(`products/${sku}`).delete();
    await adminDb.doc(`product_prices/${sku}`).delete();
    const log = await adminDb.collection("productChanges").where("sku", "==", sku).get();
    await Promise.all(log.docs.map((d) => d.ref.delete()));
  }
  await adminDb.doc(`public_catalog/${BASE.productKey}`).delete();
}

let admin, accounts, stock;

before(async () => {
  await seedStaff();
  await cleanUp();
  // Starts as a not-yet-migrated product: (empty) prices still on the product doc.
  await adminDb.doc(`products/${SKU}`).set(BASE);
  [admin, accounts, stock] = await Promise.all([as("admin"), as("accounts"), as("stock")]);
});

after(async () => {
  await cleanUp();
  await closeClients();
});

test("only Admin can edit products", async () => {
  const edit = { sku: SKU, changes: { dealerPrice: 10000 } };
  await rejectsWith(accounts.call("editProduct", edit), "permission-denied");
  await rejectsWith(stock.call("editProduct", edit), "permission-denied");
});

test("locked and unknown fields are refused by name", async () => {
  await rejectsWith(admin.call("editProduct", { sku: SKU, changes: { packQty: 20 } }), "invalid-argument", /packQty.*new product/);
  await rejectsWith(admin.call("editProduct", { sku: SKU, changes: { grade: "46" } }), "invalid-argument", /grade/);
  await rejectsWith(admin.call("editProduct", { sku: SKU, changes: { colour: "red" } }), "invalid-argument", /colour/);
});

test("bad values are refused", async () => {
  const bad = [
    [{ gstPct: 12 }, /GST/],
    [{ dealerPrice: 99.5 }, /paise/],
    [{ dealerPrice: -1 }, /paise/],
    [{ hsnCode: "27AB" }, /HSN/],
    [{ pricePer: "per tonne" }, /Price per/],
    [{ segment: "Combined" }, /Sold to/],
    [{ densityKgPerL: 9 }, /Density/],
    [{ product: "   " }, /empty/],
  ];
  for (const [changes, pattern] of bad) {
    await rejectsWith(admin.call("editProduct", { sku: SKU, changes }), "invalid-argument", pattern);
  }
  await rejectsWith(admin.call("editProduct", { sku: "NO-SUCH-SKU", changes: { gstPct: 5 } }), "not-found");
  assert.equal((await changeLog()).length, 0, "refused edits must not be logged");
});

test("Admin edit saves, logs each field, and marks it as office-owned", async () => {
  const result = await admin.call("editProduct", {
    sku: SKU,
    changes: { dealerPrice: 18550, distributorPrice: 15000, hsnCode: "27101980", gstPct: 18, active: false },
    reason: "New price list",
  });
  // gstPct was already 18 — not a change.
  assert.deepEqual([...result.changed].sort(), ["active", "dealerPrice", "distributorPrice", "hsnCode"]);

  const p = await product(SKU);
  assert.equal(p.hsnCode, "27101980");
  assert.equal(p.active, false);
  assert.equal(p.updatedBy.name, "Gaurav Verma");
  assert.deepEqual([...p.appEdited].sort(), ["dealerPrice", "distributorPrice", "hsnCode"]);

  // Prices live in product_prices; the legacy fields left the product doc.
  const pr = await prices(SKU);
  assert.equal(pr.dealerPrice, 18550);
  assert.equal(pr.distributorPrice, 15000);
  assert.equal(pr.pricePer, "per litre", "untouched price fields move across too");
  for (const field of ["pricePer", "dealerPrice", "distributorPrice"]) {
    assert.ok(!(field in p), `${field} removed from products/${SKU}`);
  }

  const log = await changeLog();
  assert.equal(log.length, 4);
  const dealer = log.find((c) => c.field === "dealerPrice");
  assert.equal(dealer.old, null);
  assert.equal(dealer.new, 18550);
  assert.equal(dealer.byName, "Gaurav Verma");
  assert.equal(dealer.reason, "New price list");
});

test("sending the same edit again changes and logs nothing", async () => {
  const result = await admin.call("editProduct", { sku: SKU, changes: { dealerPrice: 18550, active: false } });
  assert.deepEqual(result.changed, []);
  assert.equal((await changeLog()).length, 4);
});

test("a price can be cleared back to 'no price'", async () => {
  const result = await admin.call("editProduct", { sku: SKU, changes: { distributorPrice: null } });
  assert.deepEqual(result.changed, ["distributorPrice"]);
  assert.equal((await prices(SKU)).distributorPrice, null);
});

test("change history is readable by Admin only", async () => {
  const q = (db) => getDocs(query(collection(db, "productChanges"), where("sku", "==", SKU)));
  assert.ok((await q(admin.db)).size >= 5);
  await assert.rejects(q(accounts.db), /permission/i);
  await assert.rejects(q(stock.db), /permission/i);
});

test("re-importing the sheet keeps office edits and reports them", async () => {
  const row = {
    rowNumber: 2,
    sku: SKU,
    product: "TEST HYDRAULIC OIL",
    productKey: BASE.productKey,
    category: "bulk_oil",
    orderableUnit: "26 L can",
    packQty: 26,
    baseUnit: "L",
    pricePer: "per litre",
    dealerPrice: 17000, // sheet disagrees with the office price (18550)
    distributorPrice: 14000, // office cleared it to null
    gstPct: 5, // never edited in the office — the sheet wins
    segment: "Industrial",
  };
  const summary = await admin.call("importProducts", { rows: [row] });
  assert.equal(summary.updated, 1);
  assert.deepEqual(summary.keptAppEdits, [{ sku: SKU, fields: ["dealerPrice", "distributorPrice"] }]);

  const pr = await prices(SKU);
  assert.equal(pr.dealerPrice, 18550, "office price kept");
  assert.equal(pr.distributorPrice, null, "office 'no price' kept");
  assert.equal((await product(SKU)).gstPct, 5, "sheet value applied to a field the office never edited");
  assert.ok(!("dealerPrice" in (await product(SKU))), "import doesn't put prices back on the product");
});

const NEW_PACK = {
  sku: COPY_SKU,
  product: "TEST HYDRAULIC OIL",
  grade: "68",
  category: "bulk_oil",
  orderableUnit: "210 L barrel",
  packQty: 210,
  baseUnit: "L",
  pricePer: "per litre",
  dealerPrice: 17500,
  distributorPrice: null,
  gstPct: 18,
  hsnCode: null,
  segment: "Industrial",
  densityKgPerL: 0.88,
};

test("only Admin can add products", async () => {
  await rejectsWith(accounts.call("addProduct", { product: NEW_PACK }), "permission-denied");
  await rejectsWith(stock.call("addProduct", { product: NEW_PACK }), "permission-denied");
});

test("a new pack must use the stock pool's unit", async () => {
  await rejectsWith(
    admin.call("addProduct", { product: { ...NEW_PACK, baseUnit: "kg" } }),
    "invalid-argument",
    /counted in L/,
  );
});

test("Copy adds a new pack to the same stock pool and can switch the original off", async () => {
  await adminDb.doc(`products/${SKU}`).update({ active: true });
  const result = await admin.call("addProduct", { product: NEW_PACK, copyOf: SKU, switchOffOriginal: true });
  assert.deepEqual(result, { sku: COPY_SKU, productKey: BASE.productKey });

  const copy = await product(COPY_SKU);
  assert.equal(copy.productKey, BASE.productKey, "same product + grade = same stock pool");
  assert.deepEqual(copy.recipe, BASE.recipe, "recipe carried over within the pool");
  assert.equal(copy.packQty, 210);
  assert.ok(!("dealerPrice" in copy), "no prices on the product doc");
  assert.equal((await prices(COPY_SKU)).dealerPrice, 17500);
  assert.equal((await prices(COPY_SKU)).distributorPrice, null);
  assert.equal(copy.active, true);
  assert.equal(copy.deleted, false);

  assert.equal((await product(SKU)).active, false, "original switched off");
  const created = (await changeLog(COPY_SKU)).find((c) => c.field === "created");
  assert.equal(created.new, SKU);
  const switchedOff = (await changeLog(SKU)).find((c) => c.field === "active" && c.new === false && /Replaced/.test(c.reason ?? ""));
  assert.ok(switchedOff, "switch-off logged on the original");
});

test("an SKU that already exists is refused", async () => {
  await rejectsWith(admin.call("addProduct", { product: NEW_PACK }), "already-exists", /already used/);
});
