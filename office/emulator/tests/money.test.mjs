/**
 * Money in & out (brief: docs/office/money-brief.md) with the fake Humble Ledger:
 * the shared rules table against the server's copy, registers, every posting route with
 * its debits/credits, reversals, corrections, balances, "books not connected", and rules.
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
const CASES = JSON.parse(readFileSync(path.resolve(here, "../../core/src/money-entry.cases.json"), "utf8"));
const fnRequire = createRequire(path.join(path.resolve(here, "../../../firebase/functions"), "package.json"));
const model = fnRequire("./lib/money/moneyModel.js");
const { syncMoneyEntry, reconcileLedgerOnce } = fnRequire("./lib/money/sync.js");
const { syncEntity } = fnRequire("./lib/entities/sync.js");
const { FakeHlClient } = fnRequire("./lib/ledger/fakeHlClient.js");
const { NotConnectedHlClient } = fnRequire("./lib/ledger/hlClient.js");
const fnAdminApp = fnRequire("firebase-admin/app").initializeApp({ projectId: PROJECT }, `fn-money-${process.pid}`);
const libDb = fnRequire("firebase-admin/firestore").getFirestore(fnAdminApp);

let admin, accounts, stock, distributor;
let n = 0;
const rid = () => `test-mny-${process.pid}-${Date.now()}-${n++}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
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
const status = (col, id, want) => waitFor(async () => ((await get(col, id))?.syncStatus === want ? get(col, id) : null), `${col}/${id} ${want}`);

/** The fake ledger's transaction for an entry. */
const txnOf = async (entryId) => (await adminDb.doc(`_fakeHl/books/txns/technofluid-office~money_${entryId}`).get()).data();
/** Σ debits − Σ credits on one HL account, from the fake ledger. */
async function hlBalance(accountId) {
  const s = await adminDb.collection("_fakeHl/books/txns").where("accountIds", "array-contains", accountId).get();
  let sum = 0;
  for (const d of s.docs) for (const l of d.data().legs) if (l.accountId === accountId) sum += l.type === "DEBIT" ? l.amountPaise : -l.amountPaise;
  return sum;
}
async function accountIdByName(name) {
  const s = await adminDb.collection("_fakeHl/books/accounts").where("nameLower", "==", name.toLowerCase()).get();
  return s.docs[0]?.id ?? null;
}

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
const ref = {
  party: (e) => ({ kind: "PARTY", entityId: e, name: "x" }),
  cash: (id = "default-cash") => ({ kind: "CASH", registerId: id, name: "x" }),
  bank: (id = "default-bank") => ({ kind: "BANK", registerId: id, name: "x" }),
};
const record = (who, from, to, amountPaise, extra = {}) =>
  who.call("recordMoneyEntry", { requestId: rid(), from, to, amountPaise, businessDay: today, note: null, ...extra });

async function wipe() {
  for (const c of ["moneyEntries", "registers", "expenseCategories", "moneyRequests", "_fakeHl/books/customers", "_fakeHl/books/accounts", "_fakeHl/books/txns", "_fakeHl/books/log"]) {
    const s = await adminDb.collection(c).get();
    await Promise.all(s.docs.map((d) => d.ref.delete()));
  }
  await adminDb.doc("_fakeHl/control").delete();
  const ents = await adminDb.collection("entities").where("nameLower", ">=", "test mny").where("nameLower", "<", "test mnz").get();
  for (const d of ents.docs) {
    const h = await d.ref.collection("history").get();
    await Promise.all(h.docs.map((x) => x.ref.delete()));
    await d.ref.delete();
  }
}

let customer, supplier, hdfc, freight;

before(async () => {
  await seedStaff();
  await wipe();
  [admin, accounts, stock, distributor] = await Promise.all([as("admin"), as("accounts"), as("stock"), as("distributor")]);
  customer = (await accounts.call("saveEntity", { requestId: rid(), input: partyInput("TEST MNY Panipat Tractors", { opening: { amountPaise: 5_000_000, direction: "receivable", asOf: "2026-04-01" } }) })).entityId;
  supplier = (await accounts.call("saveEntity", { requestId: rid(), input: partyInput("TEST MNY Haryana Base Oils", { kinds: ["supplier"], priceTier: null, opening: { amountPaise: 2_000_000, direction: "payable", asOf: "2026-04-01" } }) })).entityId;
  await admin.call("ensureDefaultRegisters", {});
  hdfc = (await admin.call("saveRegister", { requestId: rid(), name: "HDFC Current", kind: "BANK", displayOrder: 2 })).registerId;
  freight = (await accounts.call("saveExpenseCategory", { requestId: rid(), name: "Freight" })).categoryId;
  for (const [col, id] of [["entities", customer], ["entities", supplier], ["registers", "default-cash"], ["registers", "default-bank"], ["registers", hdfc], ["expenseCategories", freight]]) {
    await status(col, id, "SYNCED");
  }
});

after(async () => {
  await wipe();
  await closeClients();
  await libDb.terminate();
  await fnRequire("firebase-admin/app").deleteApp(fnAdminApp);
});

describe("the shared rules table (money-entry.cases.json) against the server's copy", () => {
  test("validation codes, direction, GST split and corrections", () => {
    for (const c of CASES.validate) assert.equal(model.moneyEntryError(c.input, CASES.today), c.expect, c.case);
    for (const c of CASES.direction) assert.equal(model.moneyDirection({ from: c.from, to: c.to }), c.expect, c.case);
    for (const c of CASES.gstSplit) assert.deepEqual(model.expenseGstSplit(c.input), c.expect, c.case);
    for (const c of CASES.correction) assert.deepEqual(model.correctionFor(c.target, c.current, c.wanted), c.expect, c.case);
  });

  test("the callable refuses what the form refuses, with the same code", async () => {
    await assert.rejects(record(accounts, ref.cash(), ref.cash(), 100), (e) => e.code === "functions/invalid-argument" && e.details?.code === "SAME_ACCOUNT");
    await assert.rejects(record(accounts, ref.party(customer), ref.cash(), 0), (e) => e.details?.code === "INVALID_AMOUNT");
    await assert.rejects(record(accounts, ref.party(customer), ref.cash(), 100, { businessDay: "2999-01-01" }), (e) => e.details?.code === "FUTURE_DAY");
  });
});

describe("registers", () => {
  test("defaults exist once; reserved and duplicate names are refused; the kind is locked; Admin only", async () => {
    assert.deepEqual((await admin.call("ensureDefaultRegisters", {})).created, []);
    await rejectsWith(admin.call("saveRegister", { requestId: rid(), name: "Cash", kind: "CASH" }), "invalid-argument", /reserved/);
    await rejectsWith(admin.call("saveRegister", { requestId: rid(), name: "hdfc current", kind: "BANK" }), "invalid-argument", /already a register/);
    await rejectsWith(admin.call("saveRegister", { requestId: rid(), registerId: hdfc, name: "HDFC Current", kind: "CASH" }), "invalid-argument", /can't be changed/);
    await admin.call("saveRegister", { requestId: rid(), registerId: "default-bank", name: "Bank" }); // a default keeps its own reserved name
    await rejectsWith(accounts.call("saveRegister", { requestId: rid(), name: "Petty cash", kind: "CASH" }), "permission-denied");
  });

  test("the opening is posted once, on its as-of date, against Opening Balance Equity; it can't be set twice", async () => {
    await admin.call("setRegisterOpening", { requestId: rid(), registerId: hdfc, amountPaise: 10_000_000, asOf: "2026-04-01" });
    const r = await status("registers", hdfc, "SYNCED");
    assert.equal(r.opening.posted, true);
    const t = (await adminDb.doc(`_fakeHl/books/txns/technofluid-office~register_${hdfc}:opening`).get()).data();
    assert.equal(t.date, "2026-04-01");
    const equity = await accountIdByName("Opening Balance Equity");
    assert.deepEqual(
      t.legs.map((l) => [l.accountId === r.hlAccountId ? "register" : l.accountId === equity ? "equity" : l.accountId, l.type, l.amountPaise]),
      [["register", "DEBIT", 10_000_000], ["equity", "CREDIT", 10_000_000]],
    );
    await rejectsWith(admin.call("setRegisterOpening", { requestId: rid(), registerId: hdfc, amountPaise: 5, asOf: "2026-04-01" }), "failed-precondition", /already set/);
    await admin.call("setRegisterOpening", { requestId: rid(), registerId: "default-cash", amountPaise: 2_500_000, asOf: "2026-04-01" });
    await status("registers", "default-cash", "SYNCED");
    await rejectsWith(admin.call("setRegisterOpening", { requestId: rid(), registerId: "default-bank", amountPaise: -1, asOf: "2999-01-01" }), "invalid-argument", /future/);
  });

  test("a default can't be archived; one with a balance can't either; an empty one can", async () => {
    await rejectsWith(admin.call("setRegisterActive", { requestId: rid(), registerId: "default-cash", active: false, reason: "x" }), "invalid-argument", /can't be archived/);
    await rejectsWith(admin.call("setRegisterActive", { requestId: rid(), registerId: hdfc, active: false, reason: "Closed" }), "failed-precondition", /₹1,00,000/);
    const spare = (await admin.call("saveRegister", { requestId: rid(), name: "Old till", kind: "CASH" })).registerId;
    await status("registers", spare, "SYNCED");
    await admin.call("setRegisterActive", { requestId: rid(), registerId: spare, active: false, reason: "Not used" });
    assert.equal((await get("registers", spare)).isActive, false);
  });
});

describe("posting routes", () => {
  const ids = {};

  test("money received: party → cash is a /payments posting (DR cash, CR the party)", async () => {
    ids.received = (await record(accounts, ref.party(customer), ref.cash(), 1_000_000, { note: "Part payment" })).entryId;
    const e = await status("moneyEntries", ids.received, "SYNCED");
    const t = await txnOf(ids.received);
    const cash = (await get("registers", "default-cash")).hlAccountId;
    const party = (await get("entities", customer)).hlAccountId;
    assert.equal(t.postingType, "PAYMENT");
    assert.deepEqual(t.legs.map((l) => [l.accountId, l.type]), [[cash, "DEBIT"], [party, "CREDIT"]]);
    assert.ok(e.hlTxnId);
    const { balances } = await accounts.call("getEntityBalances", {});
    assert.equal(balances[customer].balancePaise, 4_000_000);
  });

  test("money paid: bank → supplier is a /customer-payouts posting (DR the party, CR bank)", async () => {
    ids.paid = (await record(accounts, ref.bank(hdfc), ref.party(supplier), 500_000)).entryId;
    await status("moneyEntries", ids.paid, "SYNCED");
    const t = await txnOf(ids.paid);
    assert.equal(t.postingType, "PAYOUT");
    assert.equal(t.legs.find((l) => l.type === "DEBIT").accountId, (await get("entities", supplier)).hlAccountId);
    assert.equal(t.legs.find((l) => l.type === "CREDIT").accountId, (await get("registers", hdfc)).hlAccountId);
    const { balances } = await accounts.call("getEntityBalances", {});
    assert.equal(balances[supplier].balancePaise, -1_500_000); // we owed 20,000; paid 5,000
  });

  test("transfer and balance move are journals: debit what receives, credit what gives", async () => {
    ids.transfer = (await record(accounts, ref.cash(), ref.bank(hdfc), 200_000, { note: "Deposit" })).entryId;
    ids.move = (await record(accounts, ref.party(customer), ref.party(supplier), 100_000)).entryId;
    await status("moneyEntries", ids.transfer, "SYNCED");
    await status("moneyEntries", ids.move, "SYNCED");
    const tr = await txnOf(ids.transfer);
    assert.equal(tr.postingType, "JOURNAL");
    assert.deepEqual(tr.legs.map((l) => l.type), ["DEBIT", "CREDIT"]);
    assert.equal(tr.legs[0].accountId, (await get("registers", hdfc)).hlAccountId);
    const mv = await txnOf(ids.move);
    assert.equal(mv.legs[0].accountId, (await get("entities", supplier)).hlAccountId); // `to` owes more
    assert.match(mv.description, /Balance moved from TEST MNY Panipat Tractors to TEST MNY Haryana Base Oils/);
  });

  test("a GST expense posts category + Input CGST + Input SGST against the register, and balances", async () => {
    const gst = {
      supplier: { entityId: null, name: "Karnal Transport", gstin: "06AABCT1234F1ZU", stateCode: "06" },
      billNo: "KT-77",
      billDate: today,
      rateBp: 1800,
      taxablePaise: 100_000,
      cgstPaise: 9_000,
      sgstPaise: 9_000,
      igstPaise: 0,
    };
    ids.expense = (
      await accounts.call("recordExpense", { requestId: rid(), categoryId: freight, registerKind: "CASH", registerId: "default-cash", amountPaise: 118_000, businessDay: today, note: "Drums to Panipat", gst })
    ).entryId;
    await status("moneyEntries", ids.expense, "SYNCED");
    const t = await txnOf(ids.expense);
    assert.equal(t.postingType, "EXPENSE");
    const cgst = await accountIdByName("Input CGST");
    const sgst = await accountIdByName("Input SGST");
    const category = (await get("expenseCategories", freight)).hlAccountId;
    const cash = (await get("registers", "default-cash")).hlAccountId;
    const named = { [category]: "freight", [cgst]: "input cgst", [sgst]: "input sgst", [cash]: "cash" };
    assert.deepEqual(t.legs.map((l) => [named[l.accountId], l.type, l.amountPaise]), [
      ["freight", "DEBIT", 100_000],
      ["input cgst", "DEBIT", 9_000],
      ["input sgst", "DEBIT", 9_000],
      ["cash", "CREDIT", 118_000],
    ]);
    const dr = t.legs.filter((l) => l.type === "DEBIT").reduce((s, l) => s + l.amountPaise, 0);
    const cr = t.legs.filter((l) => l.type === "CREDIT").reduce((s, l) => s + l.amountPaise, 0);
    assert.equal(dr, cr);
    assert.equal((await adminDb.doc(`_fakeHl/books/accounts/${cgst}`).get()).data().isTaxAccount, true);
  });

  test("an inter-state GST expense posts IGST only; a known supplier's GSTIN comes from its record", async () => {
    const delhi = (await accounts.call("saveEntity", { requestId: rid(), input: partyInput("TEST MNY Delhi Couriers", { kinds: ["supplier"], priceTier: null, gstin: "07AAACR5055K1Z9", address: { stateCode: "07" } }) })).entityId;
    const gst = { supplier: { entityId: delhi, name: "ignored", gstin: "06AABCT1234F1ZU", stateCode: "06" }, billNo: "D1", billDate: today, rateBp: 1800, taxablePaise: 10_000, cgstPaise: 0, sgstPaise: 0, igstPaise: 1_800 };
    const { entryId } = await accounts.call("recordExpense", { requestId: rid(), categoryId: freight, registerKind: "BANK", registerId: hdfc, amountPaise: 11_800, businessDay: today, note: null, gst });
    const e = await status("moneyEntries", entryId, "SYNCED");
    assert.equal(e.gst.supplier.gstin, "07AAACR5055K1Z9");
    const t = await txnOf(entryId);
    assert.equal(t.legs.length, 3);
    assert.ok(t.legs.some((l) => l.amountPaise === 1_800));
    ids.igst = entryId;
  });

  test("corrections (Admin): read from the books, routed before payouts, through Balance Adjustments / Cash Over and Short", async () => {
    await rejectsWith(accounts.call("correctBalance", { requestId: rid(), target: ref.party(customer), wantedPaise: 0, reason: "x" }), "permission-denied");
    const r = await admin.call("correctBalance", { requestId: rid(), target: ref.party(customer), wantedPaise: 4_000_000, businessDay: today, reason: "Matches the paper ledger" });
    assert.equal(r.currentPaise, 3_900_000); // ₹50,000 opening − ₹10,000 received − ₹1,000 moved
    const c = await status("moneyEntries", r.entryId, "SYNCED");
    assert.deepEqual([c.from.kind, c.to.kind, c.amountPaise], ["ADJUSTMENT", "PARTY", 100_000]);
    const t = await txnOf(r.entryId);
    assert.equal(t.postingType, "JOURNAL"); // NOT a payout of cash we never handed over
    assert.equal(t.legs.find((l) => l.type === "CREDIT").accountId, await accountIdByName("Balance Adjustments"));
    assert.equal((await accounts.call("getEntityBalances", {})).balances[customer].balancePaise, 4_000_000);
    const same = await admin.call("correctBalance", { requestId: rid(), target: ref.party(customer), wantedPaise: 4_000_000, reason: "check" });
    assert.equal(same.noChange, true);
    const till = await admin.call("correctBalance", { requestId: rid(), target: ref.cash(), wantedPaise: 2_500_000, businessDay: today, reason: "Counted the till" });
    const tc = await status("moneyEntries", till.entryId, "SYNCED");
    assert.deepEqual([tc.from.kind, tc.to.kind], ["CASH", "ADJUSTMENT"]); // till short
    const tt = await txnOf(till.entryId);
    assert.equal(tt.legs.find((l) => l.type === "DEBIT").accountId, await accountIdByName("Cash Over and Short"));
    assert.equal(tt.legs.find((l) => l.type === "CREDIT").accountId, (await get("registers", "default-cash")).hlAccountId);
    ids.correction = r.entryId;
  });

  test("a redelivered trigger posts nothing twice", async () => {
    await libDb.doc(`moneyEntries/${ids.transfer}`).update({ syncStatus: "PENDING" }); // as if the SYNCED write were lost
    await status("moneyEntries", ids.transfer, "SYNCED");
    const s = await adminDb.collection("_fakeHl/books/txns").where("sourceId", "==", `money_${ids.transfer}`).get();
    assert.equal(s.size, 1);
    assert.equal(await syncMoneyEntry(libDb, new FakeHlClient(libDb), ids.transfer), "skipped");
  });

  describe("reversal", () => {
    test("the mirror nets every route to zero (GST expense included)", async () => {
      for (const id of [ids.received, ids.paid, ids.transfer, ids.move, ids.expense, ids.igst]) {
        const before = await txnOf(id);
        const { entryId } = await accounts.call("reverseMoneyEntry", { requestId: rid(), entryId: id, reason: "Entered twice" });
        const m = await status("moneyEntries", entryId, "SYNCED");
        assert.equal(m.reversesEntryId, id);
        assert.equal((await get("moneyEntries", id)).reversedByEntryId, entryId);
        const after = await txnOf(entryId);
        assert.equal(after.postingType, "REVERSAL");
        for (const acct of new Set(before.legs.map((l) => l.accountId))) {
          const net = [...before.legs, ...after.legs].filter((l) => l.accountId === acct).reduce((s, l) => s + (l.type === "DEBIT" ? l.amountPaise : -l.amountPaise), 0);
          assert.equal(net, 0, `${id} nets to zero on ${acct}`);
        }
      }
    });

    test("a second reverse, a reversal of a reversal, and a missing reason are refused; corrections are Admin-only", async () => {
      await rejectsWith(accounts.call("reverseMoneyEntry", { requestId: rid(), entryId: ids.received, reason: "again" }), "failed-precondition", /already/);
      const mirror = (await get("moneyEntries", ids.received)).reversedByEntryId;
      await rejectsWith(accounts.call("reverseMoneyEntry", { requestId: rid(), entryId: mirror, reason: "x" }), "failed-precondition", /can't itself/);
      await rejectsWith(accounts.call("reverseMoneyEntry", { requestId: rid(), entryId: ids.correction, reason: " " }), "invalid-argument", /Reason/);
      await rejectsWith(accounts.call("reverseMoneyEntry", { requestId: rid(), entryId: ids.correction, reason: "Wrong" }), "permission-denied");
      const { entryId } = await admin.call("reverseMoneyEntry", { requestId: rid(), entryId: ids.correction, reason: "Wrong" });
      await status("moneyEntries", entryId, "SYNCED");
    });
  });
});

describe("waiting, failing and not connected", () => {
  test("a party not in the books yet: the entry stays PENDING untouched; it posts once the party is", async () => {
    const late = "test-mny-late-party";
    await libDb.doc(`entities/${late}`).set({ ...partyInput("TEST MNY Late Party"), nameLower: "test mny late party", isActive: true, deleted: false, syncStatus: "FAILED", syncAttempts: 0, opening: null, hlCustomerId: null, hlAccountId: null });
    const a = (await record(accounts, ref.party(late), ref.cash(), 5_000)).entryId;
    await sleep(1500);
    const waiting = await get("moneyEntries", a);
    assert.equal(waiting.syncStatus, "PENDING");
    assert.equal(waiting.syncAttempts, 0);
    assert.equal(waiting.hlSyncError, null);
    // The party reaches the books (outside the trigger), then the reconcile posts the entry.
    assert.equal(await syncEntity(libDb, new FakeHlClient(libDb), late), "synced");
    const r = await reconcileLedgerOnce(libDb, new FakeHlClient(libDb), Date.now() + 10 * 60_000);
    assert.ok(r.entries.synced >= 1);
    assert.equal((await get("moneyEntries", a)).syncStatus, "SYNCED");
    // …and when the party syncs through its own trigger, waiting entries go at once.
    const b = (await record(accounts, ref.party(late), ref.bank(hdfc), 7_000)).entryId;
    await status("moneyEntries", b, "SYNCED");
  });

  test("an entry pointing at an archived register fails permanently (not retried)", async () => {
    const old = (await admin.call("saveRegister", { requestId: rid(), name: "Shut branch", kind: "CASH" })).registerId;
    await status("registers", old, "SYNCED");
    await libDb.doc(`registers/${old}`).update({ isActive: false });
    const id = "test-mny-archived-register";
    await libDb.doc(`moneyEntries/${id}`).set({
      from: { kind: "PARTY", entityId: customer, name: "x" },
      to: { kind: "CASH", registerId: old, name: "Shut branch" },
      sideIds: [customer, old],
      amountPaise: 100,
      businessDay: today,
      note: null,
      isCorrection: false,
      gst: null,
      reversesEntryId: null,
      reversedByEntryId: null,
      syncStatus: "PENDING",
      syncAttempts: 0,
      deleted: false,
    });
    const f = await status("moneyEntries", id, "FAILED");
    assert.match(f.hlSyncError, /archived/);
    assert.equal(f.syncAttempts, 1);
  });

  test("books not connected: nothing posts, nothing is marked synced", async () => {
    const id = "test-mny-off";
    await libDb.doc(`moneyEntries/${id}`).set({ from: ref.party(customer), to: ref.cash(), sideIds: [customer, "default-cash"], amountPaise: 1, businessDay: today, note: null, isCorrection: false, gst: null, reversesEntryId: null, reversedByEntryId: null, syncStatus: "FAILED", syncAttempts: 0, deleted: false });
    const off = new NotConnectedHlClient();
    assert.equal(await syncMoneyEntry(libDb, off, id), "skipped");
    assert.equal((await get("moneyEntries", id)).syncAttempts, 0);
    assert.deepEqual(await reconcileLedgerOnce(libDb, off), { notConnected: true });
  });
});

describe("balances and statements", () => {
  test("register balances match by account id; a never-posted register is ₹0; books down is an error", async () => {
    const fresh = (await admin.call("saveRegister", { requestId: rid(), name: "Petty cash", kind: "CASH" })).registerId;
    const { balances } = await accounts.call("getRegisterBalances", {});
    assert.equal(balances[fresh], 0);
    assert.equal(balances[hdfc], await hlBalance((await get("registers", hdfc)).hlAccountId));
    await control({ down: true });
    await rejectsWith(accounts.call("getRegisterBalances", {}), "unavailable", /couldn't be reached/);
    await control({});
  });

  test("the register statement: HL's running balance, rows joined to their entries", async () => {
    const st = await accounts.call("getRegisterStatement", { registerId: hdfc, from: "2026-04-01", to: today });
    assert.equal(st.rows[0].kind, "opening");
    assert.ok(st.rows.some((r) => r.kind === "transfer"));
    assert.ok(st.rows.some((r) => r.kind === "reversal"));
    assert.equal(st.closingPaise, st.rows[st.rows.length - 1].balancePaise);
  });

  test("the customer statement labels money rows from the customer's side", async () => {
    const st = await accounts.call("getEntityStatement", { entityId: customer, from: "2026-04-01", to: today });
    const whats = st.rows.map((r) => r.what);
    assert.ok(whats.includes("Payment received"));
    assert.ok(whats.some((w) => /^Balance moved to TEST MNY Haryana Base Oils/.test(w)));
    assert.ok(whats.some((w) => /^Correction: /.test(w)));
    assert.ok(whats.some((w) => /^Reversal: /.test(w)));
  });
});

describe("who can see money", () => {
  test("Admin and Accounts read; Stock & Production and distributors can't; nobody writes", async () => {
    assert.ok((await getDoc(doc(accounts.db, "registers", hdfc))).exists());
    for (const [col, id] of [["registers", hdfc], ["expenseCategories", freight]]) {
      await denied(getDoc(doc(stock.db, col, id)));
      await denied(getDoc(doc(distributor.db, col, id)));
    }
    await denied(setDoc(doc(admin.db, "moneyEntries", "x"), { amountPaise: 1 }));
    await denied(getDoc(doc(admin.db, "moneyRequests", "x")));
    await rejectsWith(stock.call("recordMoneyEntry", { requestId: rid(), from: ref.cash(), to: ref.bank(), amountPaise: 1, businessDay: today }), "permission-denied");
  });
});
