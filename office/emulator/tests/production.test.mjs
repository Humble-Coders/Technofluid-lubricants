/**
 * Production with a recipe change (Sharnya, 22 Oct 2026): Stock & Production's entry
 * waits for an Admin and changes nothing until approved; an Admin's applies at once.
 * Also alternate materials on recipes (Admin only). Real rules and Cloud Functions,
 * in throw-away emulators.
 *
 *   npm run test:emulator
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { adminDb, as, closeClients, denied, rejectsWith, seedStaff } from "./helpers.mjs";

const KEY = "test-prod-oil-32";
const POOL = `pool_${KEY}`;
const SKUS = ["TEST-PRD-26L", "TEST-PRD-210L"];
const CURRENT = ["tpa/60", "tpb/40"];
const MATERIALS = { A: "test-prd-mat-a", B: "test-prd-mat-b", C: "test-prd-mat-c" };

let admin, accounts, stock;
let n = 0;
const rid = () => `test-prd-${process.pid}-${Date.now()}-${n++}`;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const onHand = async (id) => (await adminDb.doc(`stockItems/${id}`).get()).data().onHandMilli;
const recipeOf = async (sku) => (await adminDb.doc(`products/${sku}`).get()).data();
const requestDoc = async (id) => (await adminDb.doc(`productionRequests/${id}`).get()).data();

/** Made 10 L, used 6 L of A and 4 L of C (the new recipe swaps B for C). */
const LINES = [
  { itemId: POOL, kind: "MADE", qtyMilli: 10_000 },
  { itemId: MATERIALS.A, kind: "USED", qtyMilli: 6_000, forLine: 0 },
  { itemId: MATERIALS.C, kind: "USED", qtyMilli: 4_000, forLine: 0 },
];
const NEW_RECIPE = [{ code: "tpa", percent: 60 }, { code: "tpc", percent: 40 }];
const send = (who, extra = {}) =>
  who.call("requestProduction", {
    requestId: rid(),
    journalDate: today,
    lines: LINES,
    recipeChanges: [{ productKey: KEY, recipe: NEW_RECIPE }],
    reason: "Out of B, C works the same",
    ...extra,
  });

async function setUp() {
  for (const [i, sku] of SKUS.entries()) {
    await adminDb.doc(`products/${sku}`).set({
      sku, product: "TEST PROD OIL", grade: "32", productKey: KEY, category: "bulk_oil",
      orderableUnit: i ? "210 L barrel" : "26 L can", packQty: i ? 210 : 26, baseUnit: "L",
      gstPct: 18, segment: "Industrial", recipe: CURRENT, active: true, deleted: false,
    });
  }
  const base = { baseUnit: "L", aliases: [], densityKgPerL: null, deleted: false, lastMovementAt: null };
  await adminDb.doc(`stockItems/${POOL}`).set({ ...base, name: "TEST PROD OIL 32", nameLower: "test prod oil 32", kind: "product_pool", productKey: KEY, code: null, onHandMilli: 100_000 });
  for (const [k, id] of Object.entries(MATERIALS)) {
    await adminDb.doc(`stockItems/${id}`).set({ ...base, name: `TEST MAT ${k}`, nameLower: `test mat ${k.toLowerCase()}`, kind: "raw_material", code: `tp${k.toLowerCase()}`, onHandMilli: 50_000 });
  }
}

async function cleanUp() {
  for (const sku of SKUS) {
    await adminDb.doc(`products/${sku}`).delete();
    const log = await adminDb.collection("productChanges").where("sku", "==", sku).get();
    await Promise.all(log.docs.map((d) => d.ref.delete()));
  }
  for (const id of [POOL, ...Object.values(MATERIALS)]) {
    const m = await adminDb.collection("stockMovements").where("itemId", "==", id).get();
    await Promise.all(m.docs.map((d) => d.ref.delete()));
    await adminDb.doc(`stockItems/${id}`).delete();
  }
  for (const c of ["productionRequests", "recipeChangeRequests"]) {
    const reqs = await adminDb.collection(c).where("productKeys", "array-contains", KEY).get();
    await Promise.all(reqs.docs.map((d) => d.ref.delete()));
    const byKey = await adminDb.collection(c).where("productKey", "==", KEY).get();
    await Promise.all(byKey.docs.map((d) => d.ref.delete()));
  }
}

before(async () => {
  await seedStaff();
  await cleanUp();
  await setUp();
  [admin, accounts, stock] = await Promise.all([as("admin"), as("accounts"), as("stock")]);
});

after(async () => {
  await cleanUp();
  await closeClients();
});

describe("production with a recipe change", () => {
  let pendingId;

  test("Stock & Production's entry waits — nothing changes in stock or the recipe", async () => {
    const r = await send(stock);
    assert.equal(r.status, "pending");
    pendingId = r.requestId;
    assert.equal(await onHand(POOL), 100_000);
    assert.equal(await onHand(MATERIALS.A), 50_000);
    assert.deepEqual((await recipeOf(SKUS[0])).recipe, CURRENT);
    const req = await requestDoc(pendingId);
    assert.equal(req.status, "pending");
    assert.deepEqual(req.recipeChanges[0].proposedRecipe, ["tpa/60", "tpc/40"]);
    assert.equal(req.display[0].itemName, "TEST PROD OIL 32");
  });

  test("sending the same request again changes nothing", async () => {
    const id = rid();
    const args = { requestId: id, journalDate: today, lines: LINES, recipeChanges: [{ productKey: KEY, recipe: NEW_RECIPE }], reason: "x" };
    await stock.call("requestProduction", args);
    const again = await stock.call("requestProduction", args);
    assert.equal(again.alreadyRecorded, true);
    await admin.call("decideProductionRequest", { requestId: id, decision: "reject", note: "Duplicate" });
  });

  test("what's refused", async () => {
    await rejectsWith(send(stock, { reason: "" }), "invalid-argument", /why/);
    await rejectsWith(send(stock, { recipeChanges: [{ productKey: KEY, recipe: [{ code: "tpa", percent: 50 }] }] }), "invalid-argument", /100%/);
    await rejectsWith(send(stock, { recipeChanges: [{ productKey: KEY, recipe: [{ code: "tpa", percent: 60 }, { code: "tpb", percent: 40 }] }] }), "invalid-argument", /same as the current/);
    await rejectsWith(send(stock, { recipeChanges: [{ productKey: "some-other-oil", recipe: NEW_RECIPE }] }), "invalid-argument", /made in this entry/);
    await rejectsWith(send(accounts), "permission-denied");
  });

  test("only an Admin decides; rejecting needs a note and saves nothing", async () => {
    await rejectsWith(stock.call("decideProductionRequest", { requestId: pendingId, decision: "approve" }), "permission-denied");
    const r = await send(stock);
    await rejectsWith(admin.call("decideProductionRequest", { requestId: r.requestId, decision: "reject" }), "invalid-argument", /why/);
    await admin.call("decideProductionRequest", { requestId: r.requestId, decision: "reject", note: "Use B" });
    assert.equal((await requestDoc(r.requestId)).status, "rejected");
    assert.equal(await onHand(POOL), 100_000);
  });

  test("approving applies the recipe and saves the stock together, as the person who entered it", async () => {
    const r = await admin.call("decideProductionRequest", { requestId: pendingId, decision: "approve" });
    assert.equal(r.status, "approved");
    assert.equal(r.recorded, 3);
    assert.equal(await onHand(POOL), 110_000);
    assert.equal(await onHand(MATERIALS.A), 44_000);
    assert.equal(await onHand(MATERIALS.C), 46_000);
    assert.equal(await onHand(MATERIALS.B), 50_000);
    for (const sku of SKUS) assert.deepEqual((await recipeOf(sku)).recipe, ["tpa/60", "tpc/40"]);
    const made = (await adminDb.collection("stockMovements").where("itemId", "==", POOL).get()).docs.map((d) => d.data());
    assert.equal(made[0].byName, "Ramesh Kumar");
    assert.equal(made[0].approvedBy.name, "Gaurav Verma");
    await rejectsWith(admin.call("decideProductionRequest", { requestId: pendingId, decision: "approve" }), "failed-precondition", /already approved/);
  });

  test("an out-of-date entry (recipe changed since) can't be approved", async () => {
    const r = await stock.call("requestProduction", {
      requestId: rid(), journalDate: today, lines: LINES,
      recipeChanges: [{ productKey: KEY, recipe: [{ code: "tpa", percent: 70 }, { code: "tpc", percent: 30 }] }], reason: "More A",
    });
    await admin.call("requestRecipeChange", { productKey: KEY, recipe: [{ code: "tpa", percent: 50 }, { code: "tpc", percent: 50 }] });
    await rejectsWith(admin.call("decideProductionRequest", { requestId: r.requestId, decision: "approve" }), "failed-precondition", /has changed since/);
  });

  test("an Admin's own entry is applied at once", async () => {
    const before = await onHand(POOL);
    const r = await admin.call("requestProduction", {
      requestId: rid(), journalDate: today, lines: LINES,
      recipeChanges: [{ productKey: KEY, recipe: [{ code: "tpa", percent: 65 }, { code: "tpc", percent: 35 }] }],
    });
    assert.equal(r.status, "approved");
    assert.equal(await onHand(POOL), before + 10_000);
    assert.deepEqual((await recipeOf(SKUS[0])).recipe, ["tpa/65", "tpc/35"]);
  });

  test("Stock & Production can read the entries; Accounts can't; nobody writes them directly", async () => {
    assert.ok((await getDoc(doc(stock.db, "productionRequests", pendingId))).exists());
    await denied(getDoc(doc(accounts.db, "productionRequests", pendingId)));
    await denied(setDoc(doc(admin.db, "productionRequests", "x"), { status: "approved" }));
  });
});

describe("alternate materials", () => {
  const RECIPE = [{ code: "tpa", percent: 65 }, { code: "tpc", percent: 35 }];

  test("an Admin sets alternates with their own %, kept on every pack", async () => {
    await admin.call("requestRecipeChange", { productKey: KEY, recipe: RECIPE, alternates: [{ for: "tpc", code: "tpb", percent: 38 }] });
    for (const sku of SKUS) assert.deepEqual((await recipeOf(sku)).recipeAlternates, ["tpc>tpb/38"]);
  });

  test("bad alternates are refused", async () => {
    const bad = [
      [[{ for: "zzz", code: "tpb", percent: 10 }], /isn't in the recipe/],
      [[{ for: "tpc", code: "tpc", percent: 10 }], /different material/],
      [[{ for: "tpc", code: "tpb", percent: null }], /percent/],
      [[{ for: "tpc", code: "tpb", percent: 10 }, { for: "tpc", code: "tpb", percent: 12 }], /already an alternate/],
    ];
    for (const [alternates, pattern] of bad) {
      await rejectsWith(admin.call("requestRecipeChange", { productKey: KEY, recipe: RECIPE, alternates }), "invalid-argument", pattern);
    }
  });

  test("only an Admin can change alternates; others' recipe changes keep them", async () => {
    await rejectsWith(
      stock.call("requestRecipeChange", { productKey: KEY, recipe: [{ code: "tpa", percent: 60 }, { code: "tpc", percent: 40 }], alternates: [], reason: "x" }),
      "invalid-argument",
      /Only an Admin/,
    );
    const r = await stock.call("requestRecipeChange", { productKey: KEY, recipe: [{ code: "tpa", percent: 60 }, { code: "tpc", percent: 40 }], reason: "x" });
    await admin.call("decideRecipeChange", { requestId: r.requestId, decision: "approve" });
    assert.deepEqual((await recipeOf(SKUS[0])).recipeAlternates, ["tpc>tpb/38"]);
  });

  test("an alternate goes when its main material leaves the recipe", async () => {
    await admin.call("requestRecipeChange", { productKey: KEY, recipe: [{ code: "tpa", percent: 100 }] });
    assert.deepEqual((await recipeOf(SKUS[0])).recipeAlternates, []);
  });
});
