/**
 * Customers & suppliers ("entities") with the fake Humble Ledger (brief:
 * docs/office/entities-brief.md): rules, saveEntity, the HL sync (trigger + reconcile),
 * archive, the distributor import, the walk-in, balances and statements. Real rules and
 * Cloud Functions in throw-away emulators; HL is the fake one in _fakeHl/*.
 *
 * The validation table office/core/src/entity.cases.json is run here against the
 * server's copy of the rules too (and by vitest against core), so the two can't drift.
 *
 *   npm run test:emulator
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { adminDb, as, closeClients, denied, PROJECT, rejectsWith, seedStaff } from "./helpers.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const CASES = JSON.parse(readFileSync(path.resolve(here, "../../core/src/entity.cases.json"), "utf8"));

// The functions' own build (lib/) — for the pure mirror, reconcileOnce and the HL factory.
const functionsDir = path.resolve(here, "../../../firebase/functions");
const fnRequire = createRequire(path.join(functionsDir, "package.json"));
const model = fnRequire("./lib/entities/entityModel.js");
const { reconcileOnce, syncEntity } = fnRequire("./lib/entities/sync.js");
const { NotConnectedHlClient } = fnRequire("./lib/ledger/hlClient.js");
const { createHlClient, hlModeFor } = fnRequire("./lib/ledger/getHlClient.js");
const { FakeHlClient } = fnRequire("./lib/ledger/fakeHlClient.js");
const fnAdminApp = fnRequire("firebase-admin/app").initializeApp({ projectId: PROJECT }, `fn-${process.pid}`);
const libDb = fnRequire("firebase-admin/firestore").getFirestore(fnAdminApp);

let admin, accounts, stock, distributor;
let n = 0;
const rid = () => `test-ent-${process.pid}-${Date.now()}-${n++}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const entity = async (id) => (await adminDb.doc(`entities/${id}`).get()).data();
const control = (data) => adminDb.doc("_fakeHl/control").set(data);
const hlCalls = async (op, key) => (await adminDb.collection("_fakeHl/books/log").where("op", "==", op).where("key", "==", key).get()).size;

async function waitFor(fn, what, ms = 20_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(200);
  }
}
const synced = (id) => waitFor(async () => ((await entity(id))?.syncStatus === "SYNCED" ? entity(id) : null), `${id} SYNCED`);

// A valid GSTIN (with its check digit) for state `st` and a unique PAN-ish middle.
const GC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function gstin(st, mid) {
  const first14 = `${st}${mid}1Z`;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = GC.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return first14 + GC[(36 - (sum % 36)) % 36];
}

const base = (over = {}) => ({
  name: "TEST ENT Karnal Auto",
  kinds: ["customer"],
  phones: [],
  email: null,
  gstin: null,
  address: { line1: "GT Road", line2: "", city: "Karnal", district: "Karnal", pincode: "132001", stateCode: "06" },
  priceTier: "Dealer",
  creditLimitPaise: null,
  notes: null,
  ...over,
});
const save = (who, input, extra = {}) => who.call("saveEntity", { requestId: rid(), input, ...extra });

async function cleanUp() {
  const ents = await adminDb.collection("entities").get();
  for (const d of ents.docs) {
    if (!String(d.data().name ?? "").startsWith("TEST ENT") && d.id !== "walk-in-customer") continue;
    const h = await d.ref.collection("history").get();
    await Promise.all(h.docs.map((x) => x.ref.delete()));
    await d.ref.delete();
  }
  for (const c of ["_fakeHl/books/customers", "_fakeHl/books/txns", "_fakeHl/books/log"]) {
    const s = await adminDb.collection(c).get();
    await Promise.all(s.docs.map((x) => x.ref.delete()));
  }
  await adminDb.doc("_fakeHl/control").delete();
  const dists = await adminDb.collection("distributors").where("name", ">=", "TEST ENT").where("name", "<", "TEST ENU").get();
  await Promise.all(dists.docs.map((x) => x.ref.delete()));
}

before(async () => {
  await seedStaff();
  await cleanUp();
  [admin, accounts, stock, distributor] = await Promise.all([as("admin"), as("accounts"), as("stock"), as("distributor")]);
});

after(async () => {
  await cleanUp();
  await closeClients();
  await libDb.terminate();
  await fnRequire("firebase-admin/app").deleteApp(fnAdminApp);
});

describe("the shared rules table (entity.cases.json) against the server's copy", () => {
  test("validate cases through saveEntity (the real callable)", async () => {
    for (const c of CASES.validate) {
      const input = { ...c.input, name: c.input.name.trim() ? `TEST ENT ${c.input.name.trim()}` : c.input.name };
      if (c.expect.ok) {
        const { entityId } = await save(accounts, input);
        const d = await entity(entityId);
        for (const [k, v] of Object.entries(c.expect.value)) {
          assert.deepEqual(d[k], k === "name" ? `TEST ENT ${v}` : v, `${c.case}: ${k}`);
        }
      } else {
        await assert.rejects(save(accounts, input), (err) => {
          assert.equal(err.code, "functions/invalid-argument", c.case);
          assert.deepEqual([...err.details.codes].sort(), [...c.expect.codes].sort(), c.case);
          return true;
        });
      }
    }
  });

  test("phones, HL amounts and HL-profile changes in the server's copy", () => {
    for (const c of CASES.phone) assert.equal(model.normalizePhone(c.input), c.expect, c.input);
    for (const c of CASES.hlAmount) {
      if (c.expect === "error") assert.throws(() => model.hlAmountToPaise(c.input), c.input);
      else assert.equal(model.hlAmountToPaise(c.input), c.expect, c.input);
    }
    for (const c of CASES.profileChanged) assert.equal(model.hlProfileChanged(c.before, c.after), c.expect, c.case);
  });
});

describe("who can see entities", () => {
  test("Admin and Accounts read; Stock & Production and distributors can't; nobody writes", async () => {
    const { entityId } = await save(accounts, base({ name: "TEST ENT Rules" }));
    assert.ok((await getDoc(doc(admin.db, "entities", entityId))).exists());
    assert.ok((await getDoc(doc(accounts.db, "entities", entityId))).exists());
    await denied(getDoc(doc(stock.db, "entities", entityId)));
    await denied(getDoc(doc(distributor.db, "entities", entityId)));
    await denied(getDocs(collection(stock.db, "entities", entityId, "history")));
    await denied(setDoc(doc(admin.db, "entities", "x"), { name: "x" }));
    await denied(getDoc(doc(admin.db, "_fakeHl", "control")));
    await rejectsWith(save(stock, base()), "permission-denied");
  });
});

describe("saving an entity and its copy in the books", () => {
  let id;

  test("a new customer is PENDING, then SYNCED: one HL customer, the opening posted once on its as-of date", async () => {
    const r = await save(accounts, base({ name: "TEST ENT Opening", opening: { amountPaise: 1_250_050, direction: "receivable", asOf: "2026-04-01" } }));
    id = r.entityId;
    const d = await synced(id);
    assert.ok(d.hlCustomerId && d.hlAccountId);
    assert.equal(d.opening.posted, true);
    assert.ok(d.opening.hlTxnId);
    const txns = await adminDb.collection("_fakeHl/books/txns").where("sourceId", "==", `entity_${id}:opening`).get();
    assert.equal(txns.size, 1);
    assert.equal(txns.docs[0].data().date, "2026-04-01");
    const hist = await adminDb.collection(`entities/${id}/history`).get();
    assert.equal(hist.docs[0].data().action, "create");
  });

  test("syncing twice never posts the opening twice, and the SYNCED write doesn't re-trigger", async () => {
    await libDb.doc(`entities/${id}`).update({ syncStatus: "PENDING", "opening.posted": false }); // as if a sync crashed after posting
    await synced(id);
    const txns = await adminDb.collection("_fakeHl/books/txns").where("sourceId", "==", `entity_${id}:opening`).get();
    assert.equal(txns.size, 1);
    const hlId = (await entity(id)).hlCustomerId;
    await sleep(1000);
    const updates = await hlCalls("updateCustomer", hlId);
    await sleep(1500);
    assert.equal(await hlCalls("updateCustomer", hlId), updates);
    assert.equal(await hlCalls("createCustomer", id), 1);
  });

  test("a notes edit doesn't call HL; a name edit does (PATCH)", async () => {
    const d = await entity(id);
    const before = await hlCalls("updateCustomer", d.hlCustomerId);
    await accounts.call("saveEntity", { requestId: rid(), entityId: id, input: base({ name: "TEST ENT Opening", notes: "Pays on the 5th" }) });
    await sleep(1500);
    assert.equal((await entity(id)).syncStatus, "SYNCED");
    assert.equal(await hlCalls("updateCustomer", d.hlCustomerId), before);
    await accounts.call("saveEntity", { requestId: rid(), entityId: id, input: base({ name: "TEST ENT Opening Renamed", notes: "Pays on the 5th" }) });
    await synced(id);
    await waitFor(async () => (await hlCalls("updateCustomer", d.hlCustomerId)) > before, "the PATCH");
    const hist = (await adminDb.collection(`entities/${id}/history`).get()).docs.map((x) => x.data());
    assert.ok(hist.some((h) => h.action === "edit" && h.changes.name?.to === "TEST ENT Opening Renamed"));
  });

  test("the opening can't change after creation; the same requestId saves once", async () => {
    await rejectsWith(
      accounts.call("saveEntity", { requestId: rid(), entityId: id, input: base({ name: "TEST ENT Opening Renamed", opening: { amountPaise: 1, direction: "payable", asOf: "2026-04-01" } }) }),
      "invalid-argument",
      /opening balance can't be changed/,
    );
    const requestId = rid();
    const a = await accounts.call("saveEntity", { requestId, input: base({ name: "TEST ENT Once" }) });
    const b = await accounts.call("saveEntity", { requestId, input: base({ name: "TEST ENT Once" }) });
    assert.equal(a.entityId, b.entityId);
    assert.equal(b.alreadyDone, true);
    assert.equal((await adminDb.collection("entities").where("name", "==", "TEST ENT Once").get()).size, 1);
  });

  test("a GSTIN already in use is refused (naming who has it) unless an Admin allows it; a shared phone only warns", async () => {
    const g = gstin("06", "AABCT9001F");
    await save(accounts, base({ name: "TEST ENT Firm HQ", gstin: g, phones: ["9876500001"] }));
    await rejectsWith(save(accounts, base({ name: "TEST ENT Firm Branch", gstin: g })), "already-exists", /TEST ENT Firm HQ/);
    await rejectsWith(save(accounts, base({ name: "TEST ENT Firm Branch", gstin: g }), { allowSameGstin: true }), "invalid-argument", /Only an Admin/);
    const ok = await save(admin, base({ name: "TEST ENT Firm Branch", gstin: g }), { allowSameGstin: true });
    assert.ok(ok.entityId);
    const warned = await save(accounts, base({ name: "TEST ENT Same Phone", phones: ["98765 00001"] }));
    assert.ok(warned.warnings.some((w) => /TEST ENT Firm HQ/.test(w)));
  });
});

describe("when the books fail", () => {
  test("HL failing → FAILED with a plain message → Retry → SYNCED", async () => {
    await control({ failNext: 6 });
    const { entityId } = await save(accounts, base({ name: "TEST ENT Flaky" }));
    const failed = await waitFor(async () => ((await entity(entityId)).syncStatus === "FAILED" ? entity(entityId) : null), "FAILED");
    assert.match(failed.hlSyncError, /couldn't be reached/);
    assert.doesNotMatch(failed.hlSyncError, /Bearer|token/i);
    await control({ failNext: 0 });
    await accounts.call("retryEntitySync", { entityId });
    await synced(entityId);
  });

  test("reconcile picks up only entities whose last edit is over 3 minutes old", async () => {
    await control({ down: true });
    const { entityId } = await save(accounts, base({ name: "TEST ENT Stale" }));
    await waitFor(async () => (await entity(entityId)).syncStatus === "FAILED", "FAILED");
    await control({});
    const hl = new FakeHlClient(libDb);
    await reconcileOnce(libDb, hl, Date.now());
    assert.equal((await entity(entityId)).syncStatus, "FAILED"); // too fresh
    const later = await reconcileOnce(libDb, hl, Date.now() + 10 * 60_000);
    assert.ok(later.tried >= 1);
    assert.equal((await entity(entityId)).syncStatus, "SYNCED");
  });

  test("an HL customer that disappeared (404) is re-created and the ids rewritten", async () => {
    const { entityId } = await save(accounts, base({ name: "TEST ENT Healed" }));
    const first = await synced(entityId);
    await adminDb.doc(`_fakeHl/books/customers/${first.hlCustomerId}`).delete();
    await accounts.call("saveEntity", { requestId: rid(), entityId, input: base({ name: "TEST ENT Healed Again" }) });
    const healed = await waitFor(async () => {
      const d = await entity(entityId);
      return d.syncStatus === "SYNCED" && d.hlCustomerId !== first.hlCustomerId ? d : null;
    }, "a new HL customer");
    assert.ok((await adminDb.doc(`_fakeHl/books/customers/${healed.hlCustomerId}`).get()).exists);
  });

  test("balances fail loudly when the books are down — never an empty list", async () => {
    await control({ down: true });
    await rejectsWith(accounts.call("getEntityBalances", {}), "unavailable", /couldn't be reached/);
    await control({});
  });
});

describe("balances, statements and archiving", () => {
  let rec, pay;

  before(async () => {
    rec = (await save(accounts, base({ name: "TEST ENT Owes Us", opening: { amountPaise: 1_250_050, direction: "receivable", asOf: "2026-04-01" } }))).entityId;
    pay = (await save(accounts, base({ name: "TEST ENT We Owe", kinds: ["supplier"], opening: { amountPaise: 99, direction: "payable", asOf: "2026-04-02" } }))).entityId;
    await synced(rec);
    await synced(pay);
  });

  test("balances are signed integer paise from the books (balance ?? outstanding)", async () => {
    const { balances } = await accounts.call("getEntityBalances", {});
    assert.deepEqual(balances[rec], { balancePaise: 1_250_050, direction: "receivable" });
    assert.deepEqual(balances[pay], { balancePaise: -99, direction: "payable" });
    await control({ omitBalance: true });
    const again = await accounts.call("getEntityBalances", {});
    assert.equal(again.balances[rec].balancePaise, 1_250_050);
    await control({});
  });

  test("the statement: an opening line for 'from', rows in paise with HL's running balance", async () => {
    const all = await accounts.call("getEntityStatement", { entityId: rec, from: "2026-03-01", to: "2026-12-31" });
    assert.equal(all.openingPaise, 0);
    assert.equal(all.rows.length, 1);
    assert.deepEqual(
      { what: all.rows[0].what, date: all.rows[0].date, debit: all.rows[0].debitPaise, credit: all.rows[0].creditPaise, balance: all.rows[0].balancePaise },
      { what: "Opening balance", date: "2026-04-01", debit: 1_250_050, credit: 0, balance: 1_250_050 },
    );
    const later = await accounts.call("getEntityStatement", { entityId: rec, from: "2026-05-01", to: "2026-12-31" });
    assert.equal(later.openingPaise, 1_250_050);
    assert.equal(later.rows.length, 0);
    await rejectsWith(stock.call("getEntityStatement", { entityId: rec, from: "2026-03-01", to: "2026-12-31" }), "permission-denied");
  });

  test("an entity with a balance can't be archived; at zero it archives in the books too, and back", async () => {
    await rejectsWith(
      accounts.call("setEntityActive", { requestId: rid(), entityId: rec, active: false, reason: "Closed" }),
      "failed-precondition",
      /Settle ₹12,500\.50 first/,
    );
    const { entityId } = await save(accounts, base({ name: "TEST ENT Zero" }));
    const d = await synced(entityId);
    await accounts.call("setEntityActive", { requestId: rid(), entityId, active: false, reason: "No longer buys" });
    assert.equal((await entity(entityId)).isActive, false);
    assert.equal((await adminDb.doc(`_fakeHl/books/customers/${d.hlCustomerId}`).get()).data().archived, true);
    await accounts.call("setEntityActive", { requestId: rid(), entityId, active: true, reason: "Back" });
    assert.equal((await adminDb.doc(`_fakeHl/books/customers/${d.hlCustomerId}`).get()).data().archived, false);
    await rejectsWith(accounts.call("setEntityActive", { requestId: rid(), entityId, active: false, reason: " " }), "invalid-argument", /reason/);
  });

  test("archiving an entity whose HL customer is already archived doesn't call archive again or misreport a balance", async () => {
    const { entityId } = await save(accounts, base({ name: "TEST ENT Already Archived" }));
    const d = await synced(entityId);
    await adminDb.doc(`_fakeHl/books/customers/${d.hlCustomerId}`).set({ archived: true }, { merge: true });
    await accounts.call("setEntityActive", { requestId: rid(), entityId, active: false, reason: "Closed" });
    assert.equal((await entity(entityId)).isActive, false);
    assert.equal(await hlCalls("archiveCustomer", d.hlCustomerId), 0);
  });
});

describe("the walk-in customer", () => {
  test("one fixed record: can't be archived; only its notes change", async () => {
    await rejectsWith(accounts.call("ensureSystemEntities", {}), "permission-denied");
    await admin.call("ensureSystemEntities", {});
    const again = await admin.call("ensureSystemEntities", {});
    assert.deepEqual(again.created, []);
    const w = await synced("walk-in-customer");
    assert.equal(w.isWalkIn, true);
    await rejectsWith(accounts.call("setEntityActive", { requestId: rid(), entityId: "walk-in-customer", active: false, reason: "x" }), "invalid-argument", /walk-in/);
    const walkInInput = { name: w.name, kinds: w.kinds, phones: w.phones, email: w.email, gstin: w.gstin, address: w.address, priceTier: w.priceTier, creditLimitPaise: w.creditLimitPaise };
    await rejectsWith(accounts.call("saveEntity", { requestId: rid(), entityId: "walk-in-customer", input: { ...walkInInput, name: "Cash", notes: null } }), "invalid-argument", /Only the notes/);
    await accounts.call("saveEntity", { requestId: rid(), entityId: "walk-in-customer", input: { ...walkInInput, notes: "Counter sales" } });
    assert.equal((await entity("walk-in-customer")).notes, "Counter sales");
  });
});

describe("website distributors", () => {
  const D = { a: "test-ent-dist-a", b: "test-ent-dist-b", pending: "test-ent-dist-pending", off: "test-ent-dist-off", link: "test-ent-dist-link" };
  const g = gstin("27", "AAPFU7777F");

  before(async () => {
    const dist = (name, over) => ({ name, email: "", phone: "", address: "", status: "approved", isActive: true, deleted: false, contactInfo: "", createdBy: "x", ...over });
    await adminDb.doc(`distributors/${D.a}`).set(dist("TEST ENT Dist A", { gstNumber: g, phone: "98100 12345", email: "a@dist.in", address: "Plot 9, MIDC" }));
    await adminDb.doc(`distributors/${D.b}`).set(dist("TEST ENT Dist B", { gstNumber: "not-a-gstin", email: "bad email" }));
    await adminDb.doc(`distributors/${D.pending}`).set(dist("TEST ENT Dist Pending", { status: "pending" }));
    await adminDb.doc(`distributors/${D.off}`).set(dist("TEST ENT Dist Off", { isActive: false }));
  });

  test("the dry run says exactly what would happen and writes nothing", async () => {
    await rejectsWith(accounts.call("importDistributorEntities", { dryRun: true }), "permission-denied");
    const r = await admin.call("importDistributorEntities", { dryRun: true });
    assert.equal(r.dryRun, true);
    const names = r.created.map((c) => c.name);
    assert.ok(names.includes("TEST ENT Dist A") && names.includes("TEST ENT Dist B"));
    assert.ok(!names.includes("TEST ENT Dist Pending") && !names.includes("TEST ENT Dist Off"));
    assert.ok(r.stateFromGstin.includes("TEST ENT Dist A"));
    assert.ok(r.stateNeeded.includes("TEST ENT Dist B"));
    assert.equal((await adminDb.collection("entities").where("distributorId", "==", D.a).get()).size, 0);
  });

  test("the import creates them once (state from the GSTIN, or flagged), and is safe to run again", async () => {
    const r = await admin.call("importDistributorEntities", { dryRun: false });
    const a = r.created.find((c) => c.distributorId === D.a);
    const b = r.created.find((c) => c.distributorId === D.b);
    assert.ok(a && b);
    const ea = await entity(a.entityId);
    assert.equal(ea.address.stateCode, "27");
    assert.equal(ea.gstin, g);
    assert.deepEqual(ea.phones, ["+919810012345"]);
    assert.equal(ea.priceTier, null);
    const eb = await entity(b.entityId);
    assert.equal(eb.address.stateCode, null);
    assert.equal(eb.gstin, null);
    assert.equal(eb.email, null);
    assert.ok(eb.importNotes.some((x) => /State needed/.test(x)));
    await synced(a.entityId);
    const again = await admin.call("importDistributorEntities", { dryRun: false });
    assert.equal(again.created.filter((c) => [D.a, D.b].includes(c.distributorId)).length, 0);
    assert.ok(again.skipped.some((s) => s.distributorId === D.a && /Already has a customer/.test(s.reason)));
  });

  test("linking: Admin only, approved distributors only, one entity per distributor", async () => {
    // Added after the import ran, so it has no customer yet.
    await adminDb.doc(`distributors/${D.link}`).set({ name: "TEST ENT Dist Link", status: "approved", isActive: true, deleted: false, contactInfo: "", createdBy: "x" });
    const one = (await save(accounts, base({ name: "TEST ENT Linkable" }))).entityId;
    const two = (await save(accounts, base({ name: "TEST ENT Linkable Two" }))).entityId;
    await rejectsWith(accounts.call("linkEntityToDistributor", { requestId: rid(), entityId: one, distributorId: D.link }), "permission-denied");
    await rejectsWith(admin.call("linkEntityToDistributor", { requestId: rid(), entityId: one, distributorId: D.pending }), "invalid-argument", /approved/);
    await admin.call("linkEntityToDistributor", { requestId: rid(), entityId: one, distributorId: D.link });
    assert.equal((await entity(one)).distributorId, D.link);
    await rejectsWith(admin.call("linkEntityToDistributor", { requestId: rid(), entityId: two, distributorId: D.link }), "already-exists", /TEST ENT Linkable/);
    await admin.call("linkEntityToDistributor", { requestId: rid(), entityId: one, distributorId: null });
    assert.equal((await entity(one)).distributorId, null);
  });
});

describe("which Humble Ledger", () => {
  const live = () => ({ gatewayBaseUrl: "https://gw.example", hlBaseUrl: "https://hl.example", projectId: "p", adminToken: "t" });

  test("a demo- project gets the fake one even with HL_MODE=live", () => {
    assert.equal(createHlClient({ projectId: "demo-technofluid", mode: "live", db: libDb, live }).mode, "fake");
    assert.equal(hlModeFor("demo-technofluid", "live"), "fake");
  });

  test("any other project NEVER gets the fake: live only with HL_MODE=live, otherwise every call fails loud", async () => {
    for (const mode of ["fake", "", "off", "nonsense"]) {
      const c = createHlClient({ projectId: "techno-fluid", mode, db: libDb, live });
      assert.equal(c.mode, "off", `HL_MODE=${mode}`);
      assert.ok(!(c instanceof FakeHlClient));
      await assert.rejects(c.getCustomer("x"), (e) => e.code === "NOT_CONNECTED" && e.transient === false);
    }
    assert.equal(hlModeFor("", "live"), "off");
    assert.equal(createHlClient({ projectId: "techno-fluid", mode: "live", db: libDb, live }).mode, "live");
  });

  test("books not connected: the entity stays as it was — nothing FAILED, no opening marked posted; reconcile does nothing", async () => {
    const id = "test-ent-not-connected";
    await libDb.doc(`entities/${id}`).set({
      ...base({ name: "TEST ENT Not Connected" }),
      nameLower: "test ent not connected",
      deleted: false,
      isActive: true,
      // FAILED so the emulator's own trigger leaves it alone during this test.
      syncStatus: "FAILED",
      syncAttempts: 0,
      opening: { amountPaise: 500, direction: "receivable", asOf: "2026-04-01", posted: false, hlTxnId: null },
    });
    const off = new NotConnectedHlClient();
    assert.equal(await syncEntity(libDb, off, id), "skipped");
    const d = await entity(id);
    assert.equal(d.opening.posted, false);
    assert.equal(d.syncAttempts, 0);
    assert.equal(d.hlCustomerId ?? null, null);
    const r = await reconcileOnce(libDb, off, Date.now() + 3_600_000);
    assert.equal(r.notConnected, true);
    assert.equal(r.tried, 0);
  });
});

describe("trigger retries", () => {
  test("the retry cap is read from the fresh doc, not the frozen event: rethrows under 3 attempts, then stops", async () => {
    const id = "test-ent-retry-cap";
    await libDb.doc(`entities/${id}`).set({
      ...base({ name: "TEST ENT Retry Cap" }),
      nameLower: "test ent retry cap",
      deleted: false,
      isActive: true,
      syncStatus: "FAILED", // the emulator's trigger ignores FAILED docs
      syncAttempts: 2,
      opening: null,
    });
    const hl = new FakeHlClient(libDb);
    await control({ failNext: 1 });
    await assert.rejects(syncEntity(libDb, hl, id, { fromTrigger: true })); // 2 < 3 → redeliver
    assert.equal((await entity(id)).syncAttempts, 3);
    await control({ failNext: 1 });
    assert.equal(await syncEntity(libDb, hl, id, { fromTrigger: true }), "failed"); // 3 → no more redelivery
    assert.equal((await entity(id)).syncAttempts, 4);
    await control({});
    assert.equal(await syncEntity(libDb, hl, id), "synced");
  });
});
