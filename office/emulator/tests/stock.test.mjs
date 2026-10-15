/**
 * Stock engine (step 3): stock items, the append-only movement diary, counts,
 * undo/edit, below-zero warnings, retries and who may do what. Real rules and
 * Cloud Functions, in throw-away emulators.
 *
 *   npm run test:emulator
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { adminDb, as, closeClients, denied, rejectsWith, seedStaff, signedOut } from "./helpers.mjs";

const KEY = "test-stock-oil-68";
const POOL = `pool_${KEY}`;
const PRODUCTS = [
  { sku: "TEST-STK-26L", orderableUnit: "26 L can", packQty: 26 },
  { sku: "TEST-STK-210L", orderableUnit: "210 L barrel", packQty: 210 },
].map((p) => ({
  ...p,
  product: "TEST STOCK OIL",
  grade: "68",
  productKey: KEY,
  category: "bulk_oil",
  baseUnit: "L",
  densityKgPerL: 0.88,
  gstPct: 18,
  segment: "Industrial",
  active: true,
  deleted: false,
}));

let admin, accounts, stock, distributor, anon;
let n = 0;
const rid = () => `test-${process.pid}-${Date.now()}-${n++}`;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const item = async (id) => (await adminDb.doc(`stockItems/${id}`).get()).data();
const movements = async (itemId) =>
  (await adminDb.collection("stockMovements").where("itemId", "==", itemId).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const record = (who, lines, extra = {}) =>
  who.call("recordStockMovements", { requestId: rid(), journalDate: today, lines, ...extra });

async function cleanUp() {
  for (const p of PRODUCTS) await adminDb.doc(`products/${p.sku}`).delete();
  const items = await adminDb.collection("stockItems").where("nameLower", ">=", "test ").where("nameLower", "<", "test!").get();
  const pool = await adminDb.doc(`stockItems/${POOL}`).get();
  const ids = [...items.docs.map((d) => d.id), ...(pool.exists ? [POOL] : [])];
  for (const id of ids) {
    const m = await adminDb.collection("stockMovements").where("itemId", "==", id).get();
    await Promise.all(m.docs.map((d) => d.ref.delete()));
    await adminDb.doc(`stockItems/${id}`).delete();
  }
}

before(async () => {
  await seedStaff();
  await cleanUp();
  for (const p of PRODUCTS) await adminDb.doc(`products/${p.sku}`).set(p);
  [admin, accounts, stock, distributor] = await Promise.all([as("admin"), as("accounts"), as("stock"), as("distributor")]);
  anon = signedOut();
});

after(async () => {
  await cleanUp();
  await closeClients();
});

describe("product stock pools", () => {
  test("ensureProductPools makes one pool per product + grade (not per pack), and is repeatable", async () => {
    const first = await stock.call("ensureProductPools", {});
    assert.ok(first.pools >= 1);
    const pool = await item(POOL);
    assert.equal(pool.kind, "product_pool");
    assert.equal(pool.name, "TEST STOCK OIL 68");
    assert.equal(pool.baseUnit, "L");
    assert.equal(pool.densityKgPerL, 0.88);
    assert.equal(pool.onHandMilli, 0);
    const again = await stock.call("ensureProductPools", {});
    assert.equal(again.created, 0);
  });

  test("only Admin and Stock & Production can run it", async () => {
    await rejectsWith(accounts.call("ensureProductPools", {}), "permission-denied");
    await rejectsWith(distributor.call("ensureProductPools", {}), "permission-denied");
  });
});

describe("who can see and write stock", () => {
  test("Admin, Accounts and Stock & Production can read; distributors and visitors can't", async () => {
    for (const who of [admin, accounts, stock]) assert.ok((await getDoc(doc(who.db, "stockItems", POOL))).exists());
    await denied(getDoc(doc(distributor.db, "stockItems", POOL)));
    await denied(getDoc(doc(anon.db, "stockItems", POOL)));
    await denied(getDocs(collection(distributor.db, "stockMovements")));
  });

  test("nobody writes stock directly — not even Admin", async () => {
    await denied(updateDoc(doc(admin.db, "stockItems", POOL), { onHandMilli: 999 }));
    await denied(setDoc(doc(stock.db, "stockMovements", "fake"), { itemId: POOL, qtyMilli: 1 }));
    await denied(getDoc(doc(admin.db, "stockRequests", "x")));
  });

  test("Accounts can't record stock", async () => {
    await rejectsWith(record(accounts, [{ itemId: POOL, kind: "IN", qtyMilli: 1000, note: "x" }]), "permission-denied");
  });
});

describe("raw materials and consumables", () => {
  let rawId;

  test("Stock & Production adds a raw material with its recipe code", async () => {
    ({ itemId: rawId } = await stock.call("saveStockItem", {
      kind: "raw_material",
      name: "Test Base Oil W150",
      code: "TEST-W150",
      baseUnit: "L",
      densityKgPerL: 0.87,
      aliases: ["W 150", "150N"],
    }));
    const raw = await item(rawId);
    assert.equal(raw.code, "test-w150", "codes are lower-case, like in recipes");
    assert.equal(raw.onHandMilli, 0);
    assert.deepEqual(raw.aliases, ["W 150", "150N"]);
  });

  test("duplicate names and codes are refused", async () => {
    await rejectsWith(
      stock.call("saveStockItem", { kind: "raw_material", name: "test base oil w150", baseUnit: "L" }),
      "invalid-argument",
      /already a raw material/,
    );
    await rejectsWith(
      stock.call("saveStockItem", { kind: "raw_material", name: "Test Other", code: "test-w150", baseUnit: "L" }),
      "invalid-argument",
      /already used/,
    );
  });

  test("a consumable counted in pieces", async () => {
    const { itemId } = await admin.call("saveStockItem", { kind: "consumable", name: "Test 26 L empty can", baseUnit: "piece" });
    await record(stock, [{ itemId, kind: "OPENING", qtyMilli: 120_000 }]);
    assert.equal((await item(itemId)).onHandMilli, 120_000);
  });

  test("unit can't change after stock history; delete only at zero", async () => {
    await record(stock, [{ itemId: rawId, kind: "OPENING", qtyMilli: 500_000 }]);
    await rejectsWith(
      stock.call("saveStockItem", { itemId: rawId, name: "Test Base Oil W150", baseUnit: "kg" }),
      "invalid-argument",
      /unit can't change/,
    );
    await rejectsWith(stock.call("saveStockItem", { itemId: rawId, deleted: true }), "invalid-argument", /still has stock/);
    await record(stock, [{ itemId: rawId, kind: "COUNT", countedMilli: 0, note: "Used up" }]);
    await stock.call("saveStockItem", { itemId: rawId, deleted: true });
    assert.equal((await item(rawId)).deleted, true);
    await rejectsWith(record(stock, [{ itemId: rawId, kind: "IN", qtyMilli: 1, note: "x" }]), "not-found");
  });

  test("product pools can't be edited as raw materials", async () => {
    await rejectsWith(stock.call("saveStockItem", { itemId: POOL, name: "X", baseUnit: "L" }), "invalid-argument", /edit the product/);
  });
});

describe("the stock diary", () => {
  test("opening stock, then in and out; each line keeps the balance after it", async () => {
    await record(stock, [{ itemId: POOL, kind: "OPENING", qtyMilli: 1_000_000 }]);
    const r = await record(stock, [
      { itemId: POOL, kind: "IN", qtyMilli: 260_000, note: "Filled from tank" },
      { itemId: POOL, kind: "OUT", qtyMilli: 52_000, note: "Sample to Karnal lab" },
    ]);
    assert.equal(r.recorded, 2);
    assert.equal((await item(POOL)).onHandMilli, 1_208_000);
    const lines = await movements(POOL);
    const out = lines.find((m) => m.type === "OUT");
    assert.equal(out.qtyMilli, -52_000);
    assert.equal(out.onHandAfterMilli, 1_208_000);
    assert.equal(out.byName, "Ramesh Kumar");
    assert.equal(out.journalDate, today);
    assert.equal(out.note, "Sample to Karnal lab");
  });

  test("a second opening stock is refused — use a count instead", async () => {
    await rejectsWith(record(stock, [{ itemId: POOL, kind: "OPENING", qtyMilli: 5 }]), "invalid-argument", /already has stock history/);
  });

  test("a count records only the difference, and nothing when it already matches", async () => {
    const r = await record(stock, [{ itemId: POOL, kind: "COUNT", countedMilli: 1_200_000, note: "Monthly count" }]);
    assert.equal(r.recorded, 1);
    const adj = (await movements(POOL)).find((m) => m.type === "COUNT_ADJUSTMENT");
    assert.equal(adj.qtyMilli, -8_000);
    assert.equal(adj.countedMilli, 1_200_000);
    const same = await record(stock, [{ itemId: POOL, kind: "COUNT", countedMilli: 1_200_000, note: "Recount" }]);
    assert.equal(same.recorded, 0);
    assert.equal(same.skipped.length, 1);
  });

  test("going below zero is allowed but reported", async () => {
    const r = await record(stock, [{ itemId: POOL, kind: "OUT", qtyMilli: 1_250_000, note: "Big dispatch" }]);
    assert.deepEqual(r.belowZero, [{ itemId: POOL, name: "TEST STOCK OIL 68", onHandMilli: -50_000 }]);
    assert.equal((await item(POOL)).onHandMilli, -50_000);
    await record(stock, [{ itemId: POOL, kind: "COUNT", countedMilli: 0, note: "Back to zero" }]);
  });

  test("sending the same request twice records it once", async () => {
    const requestId = rid();
    const lines = [{ itemId: POOL, kind: "IN", qtyMilli: 26_000, note: "Retry test" }];
    await stock.call("recordStockMovements", { requestId, journalDate: today, lines });
    const again = await stock.call("recordStockMovements", { requestId, journalDate: today, lines });
    assert.equal(again.alreadyRecorded, true);
    assert.equal((await item(POOL)).onHandMilli, 26_000);
  });

  test("bad lines are refused with a clear reason", async () => {
    const tomorrow = new Date(Date.now() + 36 * 3600 * 1000);
    const future = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(tomorrow);
    await rejectsWith(record(stock, [{ itemId: POOL, kind: "IN", qtyMilli: 1000, note: "x" }], { journalDate: future }), "invalid-argument", /future/);
    await rejectsWith(record(stock, [{ itemId: POOL, kind: "IN", qtyMilli: 1000 }]), "invalid-argument", /say why/);
    await rejectsWith(record(stock, [{ itemId: POOL, kind: "OUT", qtyMilli: 2.5, note: "x" }]), "invalid-argument", /whole number/);
    await rejectsWith(record(stock, [{ itemId: POOL, kind: "OUT", qtyMilli: -5, note: "x" }]), "invalid-argument", /above 0/);
    await rejectsWith(record(stock, [{ itemId: POOL, kind: "STEAL", qtyMilli: 5, note: "x" }]), "invalid-argument", /unknown kind/);
    await rejectsWith(record(stock, [{ itemId: "nope", kind: "IN", qtyMilli: 5, note: "x" }]), "not-found");
  });
});

describe("undo and edit", () => {
  test("undo adds an opposite line, links both, and can't be done twice", async () => {
    await record(stock, [{ itemId: POOL, kind: "OUT", qtyMilli: 6_000, note: "Wrong entry" }]);
    const out = (await movements(POOL)).find((m) => m.note === "Wrong entry");
    const before = (await item(POOL)).onHandMilli;

    const r = await stock.call("reverseStockMovement", { movementId: out.id, note: "Typed by mistake" });
    assert.equal(r.onHandMilli, before + 6_000);
    const rev = (await movements(POOL)).find((m) => m.reversesId === out.id);
    assert.equal(rev.type, "REVERSAL");
    assert.equal(rev.qtyMilli, 6_000);
    assert.equal((await adminDb.doc(`stockMovements/${out.id}`).get()).data().reversedById, rev.id);

    assert.deepEqual((await stock.call("reverseStockMovement", { movementId: out.id, note: "again" })).alreadyDone, true);
    assert.equal((await item(POOL)).onHandMilli, before + 6_000, "a repeated undo changes nothing");
    await rejectsWith(stock.call("reverseStockMovement", { movementId: rev.id, note: "undo the undo" }), "failed-precondition");
  });

  test("edit = undo + corrected line, in one step", async () => {
    await record(stock, [{ itemId: POOL, kind: "IN", qtyMilli: 50_000, note: "Should be 52" }]);
    const line = (await movements(POOL)).find((m) => m.note === "Should be 52");
    const before = (await item(POOL)).onHandMilli;
    await stock.call("reverseStockMovement", { movementId: line.id, note: "Wrong quantity", replacementQtyMilli: 52_000 });
    assert.equal((await item(POOL)).onHandMilli, before + 2_000);
    const replacement = (await movements(POOL)).find((m) => m.replacesId === line.id);
    assert.equal(replacement.type, "IN");
    assert.equal(replacement.qtyMilli, 52_000);
  });

  test("counts can't be edited, and Accounts can't undo", async () => {
    await record(stock, [{ itemId: POOL, kind: "COUNT", countedMilli: 1_000, note: "Count to edit" }]);
    const count = (await movements(POOL)).find((m) => m.note === "Count to edit");
    await rejectsWith(
      stock.call("reverseStockMovement", { movementId: count.id, note: "x", replacementQtyMilli: 5 }),
      "failed-precondition",
      /count again/,
    );
    await rejectsWith(accounts.call("reverseStockMovement", { movementId: count.id, note: "x" }), "permission-denied");
  });

  test("the item's on-hand always equals the sum of its diary", async () => {
    const lines = await movements(POOL);
    const total = lines.reduce((sum, m) => sum + m.qtyMilli, 0);
    assert.equal(total, (await item(POOL)).onHandMilli);
  });
});
