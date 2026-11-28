/**
 * "To fill in": the resolveDataGap function and the dataGaps rules. Real rules and Cloud
 * Functions, in throw-away emulators.
 *
 *   npm run test:emulator
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { adminDb, as, closeClients, denied, rejectsWith, seedStaff, signedOut } from "./helpers.mjs";

const IDS = ["price:TEST-GAP-26L", "question:recipe-basis", "old:TEST-OLD-1", "code:testcode(kg)"];
let admin, accounts, stock, distributor, anon;
const gap = async (id) => (await adminDb.doc(`dataGaps/${id}`).get()).data();
const resolve = (who, data) => who.call("resolveDataGap", data);

async function cleanUp() {
  await Promise.all(IDS.map((id) => adminDb.doc(`dataGaps/${id}`).delete()));
}

before(async () => {
  await seedStaff();
  await cleanUp();
  [admin, accounts, stock, distributor] = await Promise.all([as("admin"), as("accounts"), as("stock"), as("distributor")]);
  anon = signedOut();
});

after(async () => {
  await cleanUp();
  await closeClients();
});

describe("recording decisions", () => {
  test("Admin marks a gap not needed, with a note", async () => {
    const r = await resolve(admin, { gapId: "price:TEST-GAP-26L", action: "notNeeded", note: "  Not sold   loose " });
    assert.deepEqual(r, { gapId: "price:TEST-GAP-26L", status: "decided" });
    const g = await gap("price:TEST-GAP-26L");
    assert.equal(g.section, "price");
    assert.equal(g.status, "decided");
    assert.equal(g.action, "notNeeded");
    assert.equal(g.note, "Not sold loose");
    assert.equal(g.by.name, "Gaurav Verma");
    assert.equal(g.history.length, 1);
  });

  test("undo reopens it and keeps the history", async () => {
    await resolve(admin, { gapId: "price:TEST-GAP-26L", action: "reopen" });
    const g = await gap("price:TEST-GAP-26L");
    assert.equal(g.status, "open");
    assert.equal(g.action, null);
    assert.deepEqual(g.history.map((h) => h.action), ["notNeeded", "reopen"]);
  });

  test("a question takes an answer; an answer is required", async () => {
    await rejectsWith(resolve(admin, { gapId: "question:recipe-basis", action: "answer", value: "  " }), "invalid-argument", /answer/);
    await resolve(admin, { gapId: "question:recipe-basis", action: "answer", value: "By litre" });
    assert.equal((await gap("question:recipe-basis")).value, "By litre");
  });

  test("an old product takes keep or remove (recorded only; the product isn't touched)", async () => {
    await resolve(admin, { gapId: "old:TEST-OLD-1", action: "remove", note: "Renamed in the master" });
    const g = await gap("old:TEST-OLD-1");
    assert.equal(g.action, "remove");
    assert.equal((await adminDb.doc("products/TEST-OLD-1").get()).exists, false);
  });

  test("recipe codes keep their brackets and dots in the id", async () => {
    await resolve(admin, { gapId: "code:testcode(kg)", action: "notNeeded" });
    assert.equal((await gap("code:testcode(kg)")).section, "code");
  });

  test("refuses unknown ids, unknown questions and choices that don't apply", async () => {
    await rejectsWith(resolve(admin, { gapId: "nonsense:x", action: "notNeeded" }), "invalid-argument");
    await rejectsWith(resolve(admin, { gapId: "price:a/b", action: "notNeeded" }), "invalid-argument");
    await rejectsWith(resolve(admin, { gapId: "question:anything", action: "answer", value: "x" }), "invalid-argument", /question/);
    await rejectsWith(resolve(admin, { gapId: "price:TEST-GAP-26L", action: "remove" }), "invalid-argument");
    await rejectsWith(resolve(admin, { gapId: "old:TEST-OLD-1", action: "notNeeded" }), "invalid-argument");
    await rejectsWith(resolve(admin, { gapId: "question:recipe-basis", action: "notNeeded" }), "invalid-argument");
  });
});

describe("who can", () => {
  test("only an Admin records decisions", async () => {
    for (const who of [accounts, stock, distributor, anon]) {
      await assert.rejects(resolve(who, { gapId: "price:TEST-GAP-26L", action: "notNeeded" }));
    }
  });

  test("only an Admin reads them; nobody writes them directly", async () => {
    assert.equal((await getDoc(doc(admin.db, "dataGaps/question:recipe-basis"))).data().value, "By litre");
    for (const who of [accounts, stock, distributor, anon]) await denied(getDoc(doc(who.db, "dataGaps/question:recipe-basis")));
    await denied(setDoc(doc(admin.db, "dataGaps/price:TEST-GAP-26L"), { status: "decided" }));
  });
});
