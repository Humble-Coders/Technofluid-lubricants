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
import { doc, getDoc, setDoc } from "firebase/firestore";
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
    await denied(getDoc(doc(accounts.db, "companies/main")));
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

  test("alter and archive are the owner's: the app's accountant login gets a plain 'ask the owner'", async () => {
    await rejectsWith(admin.call("updateCompany", { companyId: personId, name: "Ravi V." }), "permission-denied", /owner/);
    await rejectsWith(admin.call("setCompanyArchived", { companyId: personId, archived: true }), "permission-denied", /owner/);
    await rejectsWith(admin.call("setCompanyArchived", { companyId: "main", archived: true }), "invalid-argument", /main company/);
    await control({ owner: true });
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
    await control({});
  });
});
