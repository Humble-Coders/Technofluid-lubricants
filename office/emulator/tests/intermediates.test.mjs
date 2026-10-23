/**
 * Premixes and blends (Sharnya, 23 Oct 2026): stock items with recipes of their own,
 * mixed on the spot (default) or kept in stock (Admin only), made in the factory like
 * products, and recipe changes through the same Admin approval. Real rules and Cloud
 * Functions, in throw-away emulators.
 *
 *   npm run test:emulator
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { doc, getDoc } from "firebase/firestore";
import { adminDb, as, closeClients, rejectsWith, seedStaff } from "./helpers.mjs";

const RAW = { a: "test-int-raw-a", b: "test-int-raw-b" };
let admin, stock, accounts, blendId;
let n = 0;
const rid = () => `test-int-${process.pid}-${Date.now()}-${n++}`;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const item = async (id) => (await adminDb.doc(`stockItems/${id}`).get()).data();

async function cleanUp() {
  const items = await adminDb.collection("stockItems").where("nameLower", ">=", "test int").where("nameLower", "<", "test inu").get();
  for (const d of items.docs) {
    const m = await adminDb.collection("stockMovements").where("itemId", "==", d.id).get();
    await Promise.all(m.docs.map((x) => x.ref.delete()));
    const r = await adminDb.collection("recipeChangeRequests").where("itemId", "==", d.id).get();
    await Promise.all(r.docs.map((x) => x.ref.delete()));
    const p = await adminDb.collection("productionRequests").where("itemIds", "array-contains", d.id).get();
    await Promise.all(p.docs.map((x) => x.ref.delete()));
    await d.ref.delete();
  }
}

before(async () => {
  await seedStaff();
  await cleanUp();
  const base = { kind: "raw_material", baseUnit: "L", densityKgPerL: null, aliases: [], productKey: null, onHandMilli: 100_000, lastMovementAt: null, deleted: false };
  await adminDb.doc(`stockItems/${RAW.a}`).set({ ...base, name: "TEST INT RAW A", nameLower: "test int raw a", code: "tia" });
  await adminDb.doc(`stockItems/${RAW.b}`).set({ ...base, name: "TEST INT RAW B", nameLower: "test int raw b", code: "tib" });
  [admin, stock, accounts] = await Promise.all([as("admin"), as("stock"), as("accounts")]);
});

after(async () => {
  await cleanUp();
  await closeClients();
});

describe("premixes and blends", () => {
  test("a blend is added like any stock item, mixed on the spot by default, with an empty recipe", async () => {
    ({ itemId: blendId } = await stock.call("saveStockItem", { kind: "blend", name: "TEST INT BLEND", code: "tibl", baseUnit: "L" }));
    const b = await item(blendId);
    assert.equal(b.kind, "blend");
    assert.equal(b.stockMode, "breakDown");
    assert.deepEqual(b.recipe, []);
  });

  test("only an Admin switches it to kept in stock (and back)", async () => {
    await rejectsWith(stock.call("saveStockItem", { itemId: blendId, name: "TEST INT BLEND", code: "tibl", baseUnit: "L", stockMode: "stocked" }), "invalid-argument", /Only an Admin/);
    await admin.call("saveStockItem", { itemId: blendId, name: "TEST INT BLEND", code: "tibl", baseUnit: "L", stockMode: "stocked" });
    assert.equal((await item(blendId)).stockMode, "stocked");
    // An edit that doesn't mention it keeps it.
    await stock.call("saveStockItem", { itemId: blendId, name: "TEST INT BLEND", code: "tibl", baseUnit: "L", aliases: ["tibl x"] });
    assert.equal((await item(blendId)).stockMode, "stocked");
    await rejectsWith(admin.call("saveStockItem", { itemId: blendId, name: "TEST INT BLEND", code: "tibl", baseUnit: "L", stockMode: "sometimes" }), "invalid-argument", /breakDown or stocked/);
  });

  test("its recipe changes through the same approval: Stock & Production waits, Admin decides", async () => {
    const r = await stock.call("requestRecipeChange", { itemId: blendId, recipe: [{ code: "tia", percent: 60 }, { code: "tib", percent: 40 }], reason: "From Sheet3" });
    assert.equal(r.status, "pending");
    assert.deepEqual((await item(blendId)).recipe, []);
    await rejectsWith(stock.call("requestRecipeChange", { itemId: blendId, recipe: [{ code: "tia", percent: 100 }], reason: "x" }), "failed-precondition", /already waiting/);
    await admin.call("decideRecipeChange", { requestId: r.requestId, decision: "approve" });
    const b = await item(blendId);
    assert.deepEqual(b.recipe, ["tia/60", "tib/40"]);
    assert.ok(b.appEdited.includes("recipe"));
  });

  test("only premixes and blends have recipes of their own; a target is required", async () => {
    await rejectsWith(admin.call("requestRecipeChange", { itemId: RAW.a, recipe: [{ code: "x", percent: 100 }] }), "invalid-argument", /Only premixes and blends/);
    await rejectsWith(admin.call("requestRecipeChange", { recipe: [{ code: "x", percent: 100 }] }), "invalid-argument", /required/);
  });

  test("a blend is made in the factory: + the blend, − the raw materials it used", async () => {
    const r = await stock.call("recordStockMovements", {
      requestId: rid(),
      journalDate: today,
      lines: [
        { itemId: blendId, kind: "MADE", qtyMilli: 10_000 },
        { itemId: RAW.a, kind: "USED", qtyMilli: 6_000, forLine: 0 },
        { itemId: RAW.b, kind: "USED", qtyMilli: 4_000, forLine: 0 },
      ],
    });
    assert.equal(r.recorded, 3);
    assert.equal((await item(blendId)).onHandMilli, 10_000);
    assert.equal((await item(RAW.a)).onHandMilli, 94_000);
    await rejectsWith(
      stock.call("recordStockMovements", { requestId: rid(), journalDate: today, lines: [{ itemId: RAW.a, kind: "MADE", qtyMilli: 1_000 }] }),
      "invalid-argument",
      /only products, premixes and blends are made/,
    );
  });

  test("making a blend with an edited recipe waits for the Admin, then saves both", async () => {
    const r = await stock.call("requestProduction", {
      requestId: rid(),
      journalDate: today,
      lines: [
        { itemId: blendId, kind: "MADE", qtyMilli: 5_000 },
        { itemId: RAW.a, kind: "USED", qtyMilli: 2_500, forLine: 0 },
        { itemId: RAW.b, kind: "USED", qtyMilli: 2_500, forLine: 0 },
      ],
      recipeChanges: [{ itemId: blendId, recipe: [{ code: "tia", percent: 50 }, { code: "tib", percent: 50 }] }],
      reason: "Half and half this season",
    });
    assert.equal(r.status, "pending");
    assert.equal((await item(blendId)).onHandMilli, 10_000);
    await admin.call("decideProductionRequest", { requestId: r.requestId, decision: "approve" });
    const b = await item(blendId);
    assert.equal(b.onHandMilli, 15_000);
    assert.deepEqual(b.recipe, ["tia/50", "tib/50"]);
  });

  test("Accounts can't change premix/blend recipes or stock modes", async () => {
    await rejectsWith(accounts.call("requestRecipeChange", { itemId: blendId, recipe: [{ code: "tia", percent: 100 }], reason: "x" }), "permission-denied");
    await rejectsWith(accounts.call("saveStockItem", { kind: "premix", name: "TEST INT PREMIX", baseUnit: "L" }), "permission-denied");
    assert.ok((await getDoc(doc(accounts.db, "stockItems", blendId))).exists()); // but can read stock
  });
});
