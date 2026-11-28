/**
 * Companies (Tally-style separate books, one per Humble Ledger company) with the fake
 * Humble Ledger: admin-only access, the company list, create (fresh / copy / carry the
 * year forward), close year, group reports, owner-only actions and HL's posting guards.
 * Real rules and Cloud Functions in throw-away emulators.
 *
 *   npm run test:emulator
 *
 * The home ("main") company is never locked here — other test files post into it.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { adminDb, as, closeClients, denied, PROJECT, rejectsWith, seedStaff } from "./helpers.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fnRequire = createRequire(path.join(path.resolve(here, "../../../firebase/functions"), "package.json"));
const { FakeHlClient } = fnRequire("./lib/ledger/fakeHlClient.js");
const { companyForDate } = fnRequire("./lib/companies/companyModel.js");
const fnAdminApp = fnRequire("firebase-admin/app").initializeApp({ projectId: PROJECT }, `fn-companies-${process.pid}`);
const libDb = fnRequire("firebase-admin/firestore").getFirestore(fnAdminApp);

let admin, accounts, stock;
let n = 0;
const rid = () => `test-co-${process.pid}-${Date.now()}-${n++}`;
const control = (data) => adminDb.doc("_fakeHl/control").set(data);
const company = async (id) => (await adminDb.doc(`companies/${id}`).get()).data();

/** Σ debits − Σ credits of the account with this name in one fake company's books. */
async function balanceByName(hlCompanyId, name) {
  const books = `_fakeHl/books-${hlCompanyId}`;
  const acc = await adminDb.collection(`${books}/accounts`).where("nameLower", "==", name.toLowerCase()).get();
  if (acc.empty) return null;
  const id = acc.docs[0].id;
  const s = await adminDb.collection(`${books}/txns`).where("accountIds", "array-contains", id).get();
  let sum = 0;
  for (const d of s.docs) for (const l of d.data().legs) if (l.accountId === id) sum += l.type === "DEBIT" ? l.amountPaise : -l.amountPaise;
  return sum;
}

before(async () => {
  await seedStaff();
  await control({});
  admin = await as("admin");
  accounts = await as("accounts");
  stock = await as("stock");
});

after(async () => {
  await control({});
  await closeClients();
});

describe("Who can see and manage companies", () => {
  test("only admin can call the company functions", async () => {
    await rejectsWith(accounts.call("refreshCompaniesList", {}), "permission-denied");
    await rejectsWith(stock.call("createCompany", { name: "X", requestId: rid() }), "permission-denied");
    await rejectsWith(accounts.call("closeCompanyYear", { companyId: "main", lockedThrough: "2026-03-31" }), "permission-denied");
  });

  test("rules: admin reads companies, nobody writes them; requests are server-only", async () => {
    await admin.call("refreshCompaniesList", {});
    const snap = await getDoc(doc(admin.db, "companies/main"));
    assert.equal(snap.exists(), true);
    assert.equal((await getDoc(doc(accounts.db, "companies/main"))).exists(), true, "Accounts reads the main business's years");
    await denied(setDoc(doc(admin.db, "companies/main"), { name: "Hacked" }));
    await denied(setDoc(doc(admin.db, "companies/new-one"), { name: "Mine" }));
    await denied(getDoc(doc(admin.db, "companyRequests/x")));
  });
});

describe("The company list", () => {
  test("the HL home company is our 'main' company, on the main business line", async () => {
    await admin.call("refreshCompaniesList", {});
    const main = await company("main");
    assert.equal(main.hlCompanyId, "hl-home");
    assert.equal(main.line, "main");
    assert.equal(main.kind, "BUSINESS");
    assert.equal(main.lineFrom, null);
    assert.equal(main.deleted, false);
  });

  test("routing: the company with the latest takeover date on or before the day", () => {
    const list = [
      { id: "main", line: "main", lineFrom: null, archived: false },
      { id: "y27", line: "main", lineFrom: "2027-04-01", archived: false },
      { id: "y28", line: "main", lineFrom: "2028-04-01", archived: false },
      { id: "ravi", line: "ravi", lineFrom: null, archived: false },
      { id: "gone", line: "main", lineFrom: "2027-10-01", archived: false, deleted: true },
    ];
    assert.equal(companyForDate(list, "main", "2026-11-28").id, "main");
    assert.equal(companyForDate(list, "main", "2027-04-01").id, "y27");
    assert.equal(companyForDate(list, "main", "2027-12-01").id, "y27");
    assert.equal(companyForDate(list, "main", "2028-06-01").id, "y28");
    assert.equal(companyForDate(list, "ravi", "2030-01-01").id, "ravi");
    assert.equal(companyForDate(list, "nobody", "2030-01-01"), null);
  });
});

describe("Create, close year, carry forward", () => {
  let personId; // a separate, money-only company
  let nextYearId;

  test("a fresh company is its own money-only line; a retry returns the same company", async () => {
    const requestId = rid();
    const input = { name: "Ravi Verma", fyStartMonth: 4, details: { phone: "98765 43210", state: "Haryana" }, requestId };
    const first = await admin.call("createCompany", input);
    const again = await admin.call("createCompany", input);
    assert.equal(again.companyId, first.companyId);
    assert.equal(again.alreadyDone, true);
    personId = first.companyId;
    const c = await company(personId);
    assert.equal(c.name, "Ravi Verma");
    assert.equal(c.line, personId);
    assert.equal(c.kind, "MONEY");
    assert.equal(c.hlCompanyId, personId);
    assert.deepEqual(c.details, { phone: "98765 43210", state: "Haryana" });
    assert.equal(c.createdBy.uid, "t-admin");
  });

  test("input is checked before anything reaches the books", async () => {
    await rejectsWith(admin.call("createCompany", { name: "", requestId: rid() }), "invalid-argument", /name is required/);
    await rejectsWith(admin.call("createCompany", { name: "Y", requestId: rid(), fyStartMonth: 13 }), "invalid-argument", /month/);
    await rejectsWith(
      admin.call("createCompany", { name: "Y", requestId: rid(), copyFrom: { companyId: "main", carry: { asOf: "2026-03-31", pendingBills: "TOTAL" } } }),
      "invalid-argument",
      /books begin/,
    );
    await rejectsWith(
      admin.call("createCompany", { name: "Y", requestId: rid(), booksBeginFrom: "2026-03-31", copyFrom: { companyId: "main", carry: { asOf: "2026-03-31", pendingBills: "TOTAL" } } }),
      "invalid-argument",
      /after the closing date/,
    );
    await rejectsWith(admin.call("createCompany", { name: "Y", requestId: rid(), joinsLine: "source" }), "invalid-argument", /copy from it/);
  });

  test("a year's books: entries, then carry forward is refused until the year is closed", async () => {
    const books = new FakeHlClient(libDb, personId);
    const cash = await books.createAccount({ name: "Cash · Ravi", type: "ASSET" });
    const income = await books.createAccount({ name: "Commission", type: "INCOME" });
    await books.postTransaction({
      postingType: "JOURNAL", description: "Commission received", date: "2025-06-01", sourceId: `t-${rid()}`, actorRef: "test",
      legs: [{ accountId: cash.id, type: "DEBIT", amountPaise: 100000 }, { accountId: income.id, type: "CREDIT", amountPaise: 100000 }],
    });
    const cust = await books.createCustomer({ name: "Sharma Motors", externalId: `ent-${rid()}` });
    const sales = await books.createAccount({ name: "Sales · Ravi", type: "INCOME" });
    await books.postSale({
      customerId: cust.customer.id, amountPaise: 50000, taxLines: [], revenueAccountId: sales.id, description: "Bill", date: "2025-07-01",
      sourceId: `t-${rid()}`, actorRef: "test", invoiceNumber: "RV/2025-26/0001",
    });

    await rejectsWith(
      admin.call("createCompany", {
        name: "Ravi Verma", requestId: rid(), booksBeginFrom: "2026-04-01", joinsLine: "source",
        copyFrom: { companyId: personId, accounts: true, customers: true, carry: { asOf: "2026-03-31", pendingBills: "ITEMIZED" } },
      }),
      "failed-precondition",
      /Close the old year first/,
    );
  });

  test("close year: refuses a future date, then locks the books through the date", async () => {
    await rejectsWith(admin.call("closeCompanyYear", { companyId: personId, lockedThrough: "2999-03-31" }), "invalid-argument", /future/);
    const r = await admin.call("closeCompanyYear", { companyId: personId, lockedThrough: "2026-03-31" });
    assert.equal(r.lockedThrough, "2026-03-31");
    assert.equal((await company(personId)).lockedThrough, "2026-03-31");
    await rejectsWith(admin.call("closeCompanyYear", { companyId: personId, lockedThrough: "2026-01-31" }), "invalid-argument", /already closed/);
    // HL now refuses anything dated in the closed year — permanently.
    const books = new FakeHlClient(libDb, personId);
    const acc = (await books.listAccounts({ search: "Cash · Ravi", page: 1, limit: 10 })).data[0];
    const income = (await books.listAccounts({ search: "Commission", page: 1, limit: 10 })).data[0];
    await assert.rejects(
      books.postTransaction({
        postingType: "JOURNAL", description: "Late", date: "2026-03-15", sourceId: `t-${rid()}`, actorRef: "test",
        legs: [{ accountId: acc.id, type: "DEBIT", amountPaise: 100 }, { accountId: income.id, type: "CREDIT", amountPaise: 100 }],
      }),
      (e) => e.code === "BOOKS_LOCKED",
    );
  });

  test("new financial year: same name, continues the line, closing balances and unpaid bills carried", async () => {
    const r = await admin.call("createCompany", {
      name: "Ravi Verma", requestId: rid(), fyStartMonth: 4, booksBeginFrom: "2026-04-01", joinsLine: "source",
      copyFrom: { companyId: personId, accounts: true, customers: true, vendors: true, members: true, carry: { asOf: "2026-03-31", pendingBills: "ITEMIZED" } },
    });
    nextYearId = r.companyId;
    assert.notEqual(nextYearId, personId);
    assert.ok(r.copied.customers >= 1);
    assert.equal(r.copied.pendingBills, 1);
    const c = await company(nextYearId);
    assert.equal(c.line, personId, "continues the person's line");
    assert.equal(c.lineFrom, "2026-04-01");
    assert.equal(c.kind, "MONEY");
    assert.equal(c.carriedFrom.companyId, personId);
    assert.equal(c.carriedFrom.pendingBills, "ITEMIZED");
    // Cash came across at its closing balance; the year's profit went to Retained Earnings.
    assert.equal(await balanceByName(nextYearId, "Cash · Ravi"), 100000);
    assert.equal(await balanceByName(nextYearId, "Retained Earnings"), -150000);
    const inv = await adminDb.collection(`_fakeHl/books-${nextYearId}/invoices`).where("invoiceNumber", "==", "RV/2025-26/0001").get();
    assert.equal(inv.size, 1, "the unpaid bill keeps its number");
    assert.equal(inv.docs[0].data().totalPaise, 50000);
    // Nothing can be dated before the new books begin.
    const books = new FakeHlClient(libDb, nextYearId);
    const acc = (await books.listAccounts({ search: "Cash · Ravi", page: 1, limit: 10 })).data[0];
    const re = (await books.listAccounts({ search: "Retained", page: 1, limit: 10 })).data[0];
    await assert.rejects(
      books.postTransaction({
        postingType: "JOURNAL", description: "Too early", date: "2026-03-31", sourceId: `t-${rid()}`, actorRef: "test",
        legs: [{ accountId: acc.id, type: "DEBIT", amountPaise: 100 }, { accountId: re.id, type: "CREDIT", amountPaise: 100 }],
      }),
      (e) => e.code === "BEFORE_BOOKS_BEGIN",
    );
  });

  test("two companies can't take over the same line on the same day", async () => {
    await rejectsWith(
      admin.call("createCompany", {
        name: "Ravi Verma (again)", requestId: rid(), booksBeginFrom: "2026-04-01", joinsLine: "source",
        copyFrom: { companyId: personId, accounts: true },
      }),
      "invalid-argument",
      /already takes over/,
    );
  });

  test("company info: entry count and last entry date from the books", async () => {
    const info = await admin.call("getCompanyInfo", { companyId: personId });
    assert.equal(info.transactionCount, 2);
    assert.equal(info.firstEntryDate, "2025-06-01");
    assert.equal(info.lastEntryDate, "2025-07-01");
    assert.equal(info.lockedThrough, "2026-03-31");
    assert.equal((await company(personId)).info.transactionCount, 2);
  });

  test("group reports: P&L across a year and its carried year works; balance sheet refuses the pair", async () => {
    const pnl = await admin.call("getGroupReport", { kind: "pnl", companyIds: [personId, nextYearId], from: "2025-04-01", to: "2027-03-31" });
    const income = pnl.sections.find((s) => s.key === "income");
    const commission = income.lines.find((l) => l.name === "Commission");
    assert.equal(commission.totalPaise, 100000);
    assert.equal(commission.byCompany[personId], 100000, "columns are keyed by OUR company ids");
    await rejectsWith(
      admin.call("getGroupReport", { kind: "balance-sheet", companyIds: [personId, nextYearId], date: "2026-11-28" }),
      "failed-precondition",
      /count the same money twice/,
    );
    await rejectsWith(admin.call("getGroupReport", { kind: "pnl", companyIds: [personId], from: "2025-04-01", to: "2026-03-31" }), "invalid-argument", /2 to 20/);
    const tb = await admin.call("getGroupReport", { kind: "trial-balance", companyIds: ["main", personId], date: "2026-11-28" });
    assert.ok(tb.sections[0].lines.some((l) => l.name === "Cash · Ravi" && l.byCompany[personId] === 100000));
  });

  test("the app owns the companies it creates (alter, archive); in main it's an accountant and gets 'ask the owner'", async () => {
    assert.equal((await company(personId)).hlRole, "OWNER");
    assert.equal((await company("main")).hlRole, "ACCOUNTANT");
    await rejectsWith(admin.call("updateCompany", { companyId: "main", name: "Renamed" }), "permission-denied", /owner/);
    await rejectsWith(admin.call("setCompanyArchived", { companyId: "main", archived: true }), "invalid-argument", /main company/);
    await admin.call("updateCompany", { companyId: personId, name: "Ravi V.", details: { state: "Punjab" } });
    assert.equal((await company(personId)).name, "Ravi V.");
    await admin.call("setCompanyArchived", { companyId: personId, archived: true });
    assert.equal((await company(personId)).archived, true);
    const books = new FakeHlClient(libDb, personId);
    const acc = (await books.listAccounts({ search: "Cash · Ravi", page: 1, limit: 10 })).data[0];
    const income = (await books.listAccounts({ search: "Commission", page: 1, limit: 10 })).data[0];
    await assert.rejects(
      books.postTransaction({
        postingType: "JOURNAL", description: "After archive", date: "2026-11-01", sourceId: `t-${rid()}`, actorRef: "test",
        legs: [{ accountId: acc.id, type: "DEBIT", amountPaise: 100 }, { accountId: income.id, type: "CREDIT", amountPaise: 100 }],
      }),
      (e) => e.code === "COMPANY_ARCHIVED",
    );
    await admin.call("setCompanyArchived", { companyId: personId, archived: false });
  });
});

// ─── Money in another company ──────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
async function waitFor(fn, what, ms = 20_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(200);
  }
}
const docOf = async (col, id) => (await adminDb.doc(`${col}/${id}`).get()).data();
const synced = (col, id) => waitFor(async () => {
  const d = await docOf(col, id);
  if (d?.syncStatus === "FAILED") throw new Error(`${col}/${id} failed: ${d.hlSyncError}`);
  return d?.syncStatus === "SYNCED" ? d : null;
}, `${col}/${id} SYNCED`);
const party = (e) => ({ kind: "PARTY", entityId: e, name: "x" });
const cash = (id) => ({ kind: "CASH", registerId: id, name: "x" });
const partyInput = (name) => ({
  name, kinds: ["customer"], phones: [], email: null, gstin: null,
  address: { line1: "", line2: "", city: "Karnal", district: "", pincode: "", stateCode: "06" },
  priceTier: "Dealer", creditLimitPaise: null, notes: null,
});

describe("Money in another company", () => {
  let priya; // a money-only company
  let till; // its cash register
  let customer;

  before(async () => {
    await admin.call("ensureDefaultRegisters", {});
    priya = (await admin.call("createCompany", { name: "Priya Sharma", requestId: rid() })).companyId;
    customer = (await admin.call("saveEntity", { requestId: rid(), input: partyInput("TEST CO Panipat Motors") })).entityId;
    till = (await admin.call("saveRegister", { requestId: rid(), companyId: priya, name: `Priya cash ${rid()}`, kind: "CASH" })).registerId;
  });

  test("a register added in a company belongs to that company's books", async () => {
    assert.equal((await docOf("registers", till)).line, priya);
  });

  test("its opening balance is posted into that company's books, not the main one", async () => {
    await admin.call("setRegisterOpening", { requestId: rid(), registerId: till, amountPaise: 500000, asOf: today });
    const r = await synced("registers", till);
    assert.equal(r.opening.posted, true);
    assert.equal(r.opening.companyId, priya);
    assert.equal(await balanceByName(priya, `Cash · ${r.name} · ${till}`), 500000);
  });

  test("money received is entered once and posted into the company's books", async () => {
    const { entryId } = await admin.call("recordMoneyEntry", { requestId: rid(), companyId: priya, from: party(customer), to: cash(till), amountPaise: 120000, businessDay: today, note: "Rent share" });
    const e = await synced("moneyEntries", entryId);
    assert.equal(e.companyId, priya);
    const txn = (await adminDb.doc(`_fakeHl/books-${priya}/txns/technofluid-office~money_${entryId}`).get()).data();
    assert.ok(txn, "posted in Priya's books");
    assert.equal((await adminDb.doc(`_fakeHl/books/txns/technofluid-office~money_${entryId}`).get()).exists, false, "not in the main books");
    // The customer exists in Priya's books by its own id, linked for next time.
    const link = (await adminDb.doc(`companies/${priya}/links/${customer}`).get()).data();
    assert.ok(link.hlCustomerId);
    const balances = await admin.call("getRegisterBalances", { companyId: priya });
    assert.equal(balances.balances[till], 620000);
    assert.equal(balances.balances["default-cash"], undefined, "the main company's cash isn't in this company");
    const owed = await admin.call("getEntityBalances", { companyId: priya });
    assert.equal(owed.balances[customer].balancePaise, -120000);
    const st = await admin.call("getRegisterStatement", { companyId: priya, registerId: till, from: today, to: today });
    assert.equal(st.closingPaise, 620000);
  });

  test("a reversal goes to the original's company", async () => {
    const { entryId } = await admin.call("recordMoneyEntry", { requestId: rid(), companyId: priya, from: cash(till), to: party(customer), amountPaise: 10000, businessDay: today });
    await synced("moneyEntries", entryId);
    const mirror = await admin.call("reverseMoneyEntry", { requestId: rid(), entryId, reason: "Wrong person" });
    const m = await synced("moneyEntries", mirror.entryId);
    assert.equal(m.companyId, priya);
    assert.equal((await admin.call("getRegisterBalances", { companyId: priya })).balances[till], 620000);
  });

  test("only Admin works in another company; registers and invoices stay with their own books", async () => {
    await rejectsWith(accounts.call("recordMoneyEntry", { requestId: rid(), companyId: priya, from: party(customer), to: cash(till), amountPaise: 100, businessDay: today }), "permission-denied", /Admin/);
    await rejectsWith(accounts.call("getRegisterBalances", { companyId: priya }), "permission-denied");
    await rejectsWith(
      admin.call("recordMoneyEntry", { requestId: rid(), companyId: priya, from: party(customer), to: cash("default-cash"), amountPaise: 100, businessDay: today }),
      "invalid-argument",
      /another company's books/,
    );
    await rejectsWith(
      admin.call("recordMoneyEntry", { requestId: rid(), from: party(customer), to: cash(till), amountPaise: 100, businessDay: today }),
      "invalid-argument",
      /another company's books/,
    );
    await rejectsWith(
      admin.call("recordMoneyEntry", { requestId: rid(), companyId: priya, from: party(customer), to: cash(till), amountPaise: 100, businessDay: today, saleId: "any" }),
      "invalid-argument",
      /money only/,
    );
  });

  test("an entry without a company still goes to the main company", async () => {
    const { entryId } = await admin.call("recordMoneyEntry", { requestId: rid(), from: party(customer), to: cash("default-cash"), amountPaise: 2500, businessDay: today });
    const e = await waitFor(async () => {
      const d = await docOf("moneyEntries", entryId);
      return d?.syncStatus && d.syncStatus !== "PENDING" ? d : null;
    }, "main entry posted", 30_000).catch(() => null);
    assert.equal((await docOf("moneyEntries", entryId)).companyId, "main");
    if (e?.syncStatus === "SYNCED") assert.ok((await adminDb.doc(`_fakeHl/books/txns/technofluid-office~money_${entryId}`).get()).exists);
  });
});

describe("Routing by date within a company's books", () => {
  test("an entry dated in the new year goes to the new year's company", async () => {
    // Two years of one person's books: the first from the start, the next from 1 Apr 2026.
    const first = (await admin.call("createCompany", { name: "Karan Mehta", requestId: rid() })).companyId;
    const box = (await admin.call("saveRegister", { requestId: rid(), companyId: first, name: `Karan cash ${rid()}`, kind: "CASH" })).registerId;
    const someone = (await admin.call("saveEntity", { requestId: rid(), input: partyInput("TEST CO Karnal Traders") })).entityId;
    const old = await admin.call("recordMoneyEntry", { requestId: rid(), companyId: first, from: party(someone), to: cash(box), amountPaise: 1000, businessDay: "2026-02-01" });
    await synced("moneyEntries", old.entryId);
    await admin.call("closeCompanyYear", { companyId: first, lockedThrough: "2026-03-31" });
    const next = (await admin.call("createCompany", {
      name: "Karan Mehta", requestId: rid(), booksBeginFrom: "2026-04-01", joinsLine: "source",
      copyFrom: { companyId: first, accounts: true, customers: true, carry: { asOf: "2026-03-31", pendingBills: "TOTAL" } },
    })).companyId;
    // Entered while "in" the old company, dated today: it belongs to the new year.
    const { entryId } = await admin.call("recordMoneyEntry", { requestId: rid(), companyId: first, from: party(someone), to: cash(box), amountPaise: 700, businessDay: today });
    const e = await synced("moneyEntries", entryId);
    assert.equal(e.companyId, next);
    // The cash account came across with its closing balance and keeps going in the new books.
    assert.equal((await admin.call("getRegisterBalances", { companyId: next })).balances[box], 1700);
    // A date in the closed year is refused before anything is written.
    await rejectsWith(
      admin.call("recordMoneyEntry", { requestId: rid(), companyId: next, from: party(someone), to: cash(box), amountPaise: 5, businessDay: "2026-03-01" }),
      "failed-precondition",
      /closed year/,
    );
  });
});

describe("Accounts sees only the main business", () => {
  test("rules: a person's money records, cash/bank and company are Admin only", async () => {
    const pc = (await admin.call("createCompany", { name: "Neha Gupta", requestId: rid() })).companyId;
    const box = (await admin.call("saveRegister", { requestId: rid(), companyId: pc, name: `Neha cash ${rid()}`, kind: "CASH" })).registerId;
    const someone = (await admin.call("saveEntity", { requestId: rid(), input: partyInput("TEST CO Neha Friend") })).entityId;
    const { entryId } = await admin.call("recordMoneyEntry", { requestId: rid(), companyId: pc, from: party(someone), to: cash(box), amountPaise: 900, businessDay: today });
    assert.equal((await docOf("moneyEntries", entryId)).line, pc);
    const mainEntry = await admin.call("recordMoneyEntry", { requestId: rid(), from: party(someone), to: cash("default-cash"), amountPaise: 300, businessDay: today });
    assert.equal((await docOf("moneyEntries", mainEntry.entryId)).line, "main");

    await denied(getDoc(doc(accounts.db, `moneyEntries/${entryId}`)));
    await denied(getDoc(doc(accounts.db, `registers/${box}`)));
    await denied(getDoc(doc(accounts.db, `companies/${pc}`)));
    assert.equal((await getDoc(doc(accounts.db, `moneyEntries/${mainEntry.entryId}`))).exists(), true);
    assert.equal((await getDoc(doc(accounts.db, "registers/default-cash"))).exists(), true);
    assert.equal((await getDoc(doc(admin.db, `moneyEntries/${entryId}`))).exists(), true);
    // Accounts' lists ask for the main business only — and get it.
    const rows = await getDocs(query(collection(accounts.db, "moneyEntries"), where("line", "==", "main"), where("businessDay", "==", today)));
    assert.ok(rows.docs.every((d) => d.data().line === "main"));
    await denied(getDocs(query(collection(accounts.db, "moneyEntries"), where("businessDay", "==", today))));
    const years = await getDocs(query(collection(accounts.db, "companies"), where("line", "==", "main")));
    assert.ok(years.docs.some((d) => d.id === "main"));
    await denied(getDocs(collection(stock.db, "moneyEntries")));
  });

  test("older records without a line are stamped as the main business's, once", async () => {
    await adminDb.doc("moneyEntries/old-entry-test").set({ from: { kind: "ADJUSTMENT" }, to: { kind: "ADJUSTMENT" }, amountPaise: 1, businessDay: "2026-05-01", syncStatus: "SYNCED", deleted: false });
    await adminDb.doc("registers/old-register-test").set({ name: "Old till", kind: "CASH", deleted: false, isActive: true });
    await adminDb.doc("officeSettings/companies").delete();
    await admin.call("refreshCompaniesList", {});
    assert.equal((await docOf("moneyEntries", "old-entry-test")).line, "main");
    assert.equal((await docOf("moneyEntries", "old-entry-test")).companyId, "main");
    assert.equal((await docOf("registers", "old-register-test")).line, "main");
    assert.equal((await docOf("officeSettings", "companies")).stampedLine, true);
    await adminDb.doc("moneyEntries/old-entry-test").delete();
    await adminDb.doc("registers/old-register-test").delete();
  });

  test("Accounts can work in the main business's current year, not in a person's books", async () => {
    const pc = (await admin.call("createCompany", { name: "Arjun Rao", requestId: rid() })).companyId;
    await rejectsWith(accounts.call("getRegisterBalances", { companyId: pc }), "permission-denied");
    const r = await accounts.call("getRegisterBalances", { companyId: "main" });
    assert.equal(r.companyId, "main");
  });
});

describe("A party's details reach its copies in other companies", () => {
  test("renaming a customer updates it in every company that has it", async () => {
    const pc = (await admin.call("createCompany", { name: "Meera Iyer", requestId: rid() })).companyId;
    const box = (await admin.call("saveRegister", { requestId: rid(), companyId: pc, name: `Meera cash ${rid()}`, kind: "CASH" })).registerId;
    const input = partyInput("TEST CO Old Name Motors");
    const e = (await admin.call("saveEntity", { requestId: rid(), input })).entityId;
    const { entryId } = await admin.call("recordMoneyEntry", { requestId: rid(), companyId: pc, from: party(e), to: cash(box), amountPaise: 100, businessDay: today });
    await synced("moneyEntries", entryId);
    await synced("entities", e);
    const link = (await adminDb.doc(`companies/${pc}/links/${e}`).get()).data();
    await admin.call("saveEntity", { requestId: rid(), entityId: e, input: { ...input, name: "TEST CO New Name Motors" } });
    const renamed = await waitFor(async () => {
      const c = (await adminDb.doc(`_fakeHl/books-${pc}/customers/${link.hlCustomerId}`).get()).data();
      return c?.name === "TEST CO New Name Motors" ? c : null;
    }, "copy renamed");
    assert.equal(renamed.name, "TEST CO New Name Motors");
  });
});

describe("Sales go to the main business's company for their date", () => {
  const SKU = "TEST-CO-HYD68-26L";
  let yearCo;
  after(async () => {
    // Later test files post into the main company: retire this test year.
    if (yearCo) await adminDb.doc(`companies/${yearCo}`).set({ deleted: true }, { merge: true });
    await adminDb.doc(`products/${SKU}`).delete();
    await adminDb.doc(`product_prices/${SKU}`).delete();
  });

  test("a sale dated in a new year of the main business is booked in that year's company", async () => {
    await adminDb.doc(`products/${SKU}`).set({ sku: SKU, product: "TEST CO Hydraulic", grade: "68", orderableUnit: "26 Ltr Can", productKey: "test-co-hyd68", packQty: 26, baseUnit: "L", gstPct: 18, hsnCode: null, active: true, deleted: false });
    await adminDb.doc(`product_prices/${SKU}`).set({ pricePer: "per litre", dealerPrice: 10000, distributorPrice: 9000 });
    await adminDb.doc("stockItems/pool_test-co-hyd68").set({ kind: "product_pool", productKey: "test-co-hyd68", name: "TEST CO Hydraulic 68", nameLower: "test co hydraulic 68", baseUnit: "L", onHandMilli: 100_000, lastMovementAt: null, deleted: false });
    await admin.call("saveCompanyProfile", {
      legalName: "Lube Chem Industries", tradeName: "Technofluid Lubricants", gstin: "06AAACL1234M1ZO",
      address: { line1: "Near Gaushala Road", line2: "Matak Majri", city: "Karnal", pincode: "132001" }, phone: "+91 88148 85245", email: null, invoicePrefix: "TF",
    });
    const buyer = (await admin.call("saveEntity", { requestId: rid(), input: partyInput("TEST CO Year Buyer") })).entityId;
    yearCo = (await admin.call("createCompany", { name: "Technofluid Lubricants (test year)", requestId: rid(), booksBeginFrom: today, joinsLine: "main", lineFrom: today })).companyId;
    const sale = await admin.call("createSale", {
      requestId: rid(), customerEntityId: buyer, invoiceDate: today, lines: [{ sku: SKU, packs: 1, discountBp: 0 }], freightPaise: 0,
      payments: [{ registerId: "default-cash", amountPaise: 100 }], note: null,
    });
    const s = await synced("sales", sale.saleId);
    assert.equal(s.companyId, yearCo);
    assert.equal(s.line, "main");
    assert.ok((await adminDb.doc(`_fakeHl/books-${yearCo}/txns/technofluid-office~sale_${sale.saleId}:sale`).get()).exists, "in the year's books");
    assert.equal((await adminDb.doc(`_fakeHl/books/txns/technofluid-office~sale_${sale.saleId}:sale`).get()).exists, false, "not in the main books");
    const inv = (await adminDb.doc(`_fakeHl/books-${yearCo}/invoices/${s.hlInvoiceId}`).get()).data();
    assert.equal(inv.amountPaidPaise, 100, "the payment at billing is applied to the invoice in the same books");
  });
});
