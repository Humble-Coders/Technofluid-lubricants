/**
 * Recipe changes with Admin approval: who may ask, who may decide, what changes when,
 * and what's refused. Real rules and Cloud Functions, in throw-away emulators.
 *
 *   npm run test:emulator
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { adminDb, as, closeClients, denied, rejectsWith, seedStaff, signedOut } from "./helpers.mjs";

const KEY = "test-recipe-oil-46";
const SKUS = ["TEST-RCP-26L", "TEST-RCP-210L"];
const CURRENT = ["n4/90", "ppd/10"];
const product = (sku, packQty) => ({
  sku,
  product: "TEST RECIPE OIL",
  grade: "46",
  productKey: KEY,
  category: "bulk_oil",
  orderableUnit: `${packQty} L`,
  packQty,
  baseUnit: "L",
  gstPct: 18,
  segment: "Industrial",
  recipe: CURRENT,
  active: true,
  deleted: false,
});

let admin, accounts, stock, distributor, anon;
const recipeOf = async (sku) => (await adminDb.doc(`products/${sku}`).get()).data().recipe;
const request = async (id) => (await adminDb.doc(`recipeChangeRequests/${id}`).get()).data();
const ask = (who, recipe, reason = "Better flow in winter") =>
  who.call("requestRecipeChange", { productKey: KEY, recipe, reason });

async function cleanUp() {
  for (const sku of SKUS) {
    await adminDb.doc(`products/${sku}`).delete();
    const log = await adminDb.collection("productChanges").where("sku", "==", sku).get();
    await Promise.all(log.docs.map((d) => d.ref.delete()));
  }
  const reqs = await adminDb.collection("recipeChangeRequests").where("productKey", "==", KEY).get();
  await Promise.all(reqs.docs.map((d) => d.ref.delete()));
}

before(async () => {
  await seedStaff();
  await cleanUp();
  await adminDb.doc(`products/${SKUS[0]}`).set(product(SKUS[0], 26));
  await adminDb.doc(`products/${SKUS[1]}`).set(product(SKUS[1], 210));
  [admin, accounts, stock, distributor] = await Promise.all([as("admin"), as("accounts"), as("stock"), as("distributor")]);
  anon = signedOut();
});

after(async () => {
  await cleanUp();
  await closeClients();
});

describe("asking for a change", () => {
  let pendingId;

  test("Stock & Production's request waits; the recipe doesn't change yet", async () => {
    const r = await ask(stock, [{ code: "N4", percent: 85 }, { code: "ppd", percent: 10 }, { code: "w70", percent: null }, { code: "Ep Additive", percent: 5 }]);
    assert.equal(r.status, "pending");
    pendingId = r.requestId;
    const req = await request(pendingId);
    assert.deepEqual(req.proposedRecipe, ["n4/85", "ppd/10", "w70/", "ep additive/5"], "stored in Gaurav's format");
    assert.deepEqual(req.currentRecipe, CURRENT);
    assert.equal(req.productName, "TEST RECIPE OIL 46");
    assert.equal(req.requestedBy.name, "Ramesh Kumar");
    assert.deepEqual(await recipeOf(SKUS[0]), CURRENT, "not applied before approval");
  });

  test("only one request can wait per product", async () => {
    await rejectsWith(ask(stock, [{ code: "n4", percent: 100 }]), "failed-precondition", /already waiting/);
  });

  test("Accounts and distributors can't ask", async () => {
    await rejectsWith(ask(accounts, [{ code: "n4", percent: 100 }]), "permission-denied");
    await rejectsWith(ask(distributor, [{ code: "n4", percent: 100 }]), "permission-denied");
  });

  test("bad recipes are refused with a clear reason", async () => {
    const reqs = [
      [[], /at least one/],
      [[{ code: "n4", percent: 120 }], /at most 100/],
      [[{ code: "n4", percent: 0 }], /above 0/],
      [[{ code: "n4", percent: 33.333 }], /2 decimals/],
      [[{ code: "n4", percent: 50 }, { code: "N4", percent: 50 }], /twice/],
      [[{ code: "bad/code", percent: 50 }], /recipe code/],
    ];
    for (const [recipe, pattern] of reqs) await rejectsWith(admin.call("requestRecipeChange", { productKey: KEY, recipe }), "invalid-argument", pattern);
    await rejectsWith(ask(admin, [{ code: "n4", percent: 90 }, { code: "ppd", percent: 10 }]), "invalid-argument", /same as the current/);
    await rejectsWith(stock.call("requestRecipeChange", { productKey: KEY, recipe: [{ code: "x", percent: 100 }] }), "invalid-argument", /why/);
  });

  test("a changed recipe must total exactly 100% (lines without a % don't count)", async () => {
    await rejectsWith(ask(admin, [{ code: "n4", percent: 90 }, { code: "ppd", percent: 5 }]), "invalid-argument", /95% — they must make exactly 100%/);
    await rejectsWith(ask(admin, [{ code: "n4", percent: 90 }, { code: "ppd", percent: 20 }]), "invalid-argument", /110%/);
    await rejectsWith(ask(admin, [{ code: "w70", percent: null }]), "invalid-argument", /0%/);
  });

  test("only an Admin decides", async () => {
    await rejectsWith(stock.call("decideRecipeChange", { requestId: pendingId, decision: "approve" }), "permission-denied");
  });

  test("Admin approves: every pack gets the new recipe, logged, and the request is closed", async () => {
    assert.deepEqual(await admin.call("decideRecipeChange", { requestId: pendingId, decision: "approve" }), { status: "approved" });
    for (const sku of SKUS) {
      assert.deepEqual(await recipeOf(sku), ["n4/85", "ppd/10", "w70/", "ep additive/5"]);
      const p = (await adminDb.doc(`products/${sku}`).get()).data();
      assert.ok(p.appEdited.includes("recipe"), "a later sheet import must not overwrite it");
      const log = (await adminDb.collection("productChanges").where("sku", "==", sku).get()).docs.map((d) => d.data());
      assert.ok(log.some((c) => c.field === "recipe" && c.byName === "Gaurav Verma"));
    }
    const req = await request(pendingId);
    assert.equal(req.status, "approved");
    assert.equal(req.decidedBy.name, "Gaurav Verma");
    await rejectsWith(admin.call("decideRecipeChange", { requestId: pendingId, decision: "approve" }), "failed-precondition", /already approved/);
  });
});

describe("rejecting, admin changes and out-of-date requests", () => {
  test("a rejected request changes nothing and says why", async () => {
    const { requestId } = await ask(stock, [{ code: "n4", percent: 100 }]);
    await rejectsWith(admin.call("decideRecipeChange", { requestId, decision: "reject" }), "invalid-argument", /why/);
    await admin.call("decideRecipeChange", { requestId, decision: "reject", note: "Viscosity would drop too far" });
    const req = await request(requestId);
    assert.equal(req.status, "rejected");
    assert.equal(req.decisionNote, "Viscosity would drop too far");
    assert.deepEqual(await recipeOf(SKUS[1]), ["n4/85", "ppd/10", "w70/", "ep additive/5"]);
  });

  test("an Admin's own change applies at once and replaces a waiting request", async () => {
    const waiting = await ask(stock, [{ code: "n4", percent: 95 }, { code: "ppd", percent: 5 }]);
    const mine = await admin.call("requestRecipeChange", { productKey: KEY, recipe: [{ code: "n4", percent: 92 }, { code: "ppd", percent: 8 }] });
    assert.equal(mine.status, "approved");
    assert.deepEqual(await recipeOf(SKUS[0]), ["n4/92", "ppd/8"]);
    assert.equal((await request(waiting.requestId)).status, "superseded");
    await rejectsWith(
      admin.call("decideRecipeChange", { requestId: waiting.requestId, decision: "approve" }),
      "failed-precondition",
      /already superseded/,
    );
  });

  test("approving a request made before the recipe changed another way is refused", async () => {
    const { requestId } = await ask(stock, [{ code: "n4", percent: 100 }]);
    await adminDb.doc(`products/${SKUS[0]}`).update({ recipe: ["n4/50", "w70/50"] }); // changed by an import, say
    await adminDb.doc(`products/${SKUS[1]}`).update({ recipe: ["n4/50", "w70/50"] });
    await rejectsWith(admin.call("decideRecipeChange", { requestId, decision: "approve" }), "failed-precondition", /changed since/);
    await admin.call("decideRecipeChange", { requestId, decision: "reject", note: "Out of date" });
  });
});

describe("who can see requests", () => {
  test("Admin and Stock & Production read; Accounts, distributors and visitors can't; nobody writes", async () => {
    const q = (who) => getDocs(collection(who.db, "recipeChangeRequests"));
    assert.ok((await q(admin)).size >= 1);
    assert.ok((await q(stock)).size >= 1);
    await denied(q(accounts));
    await denied(q(distributor));
    await denied(q(anon));
    await denied(setDoc(doc(admin.db, "recipeChangeRequests", "fake"), { productKey: KEY, status: "approved" }));
  });
});
