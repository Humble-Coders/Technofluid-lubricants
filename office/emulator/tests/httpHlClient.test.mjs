/**
 * The LIVE Humble Ledger client (functions/src/ledger/httpHlClient.ts) against a stubbed
 * fetch that replays HL's OpenAPI shapes (https://hl.humblesolutions.in/docs/json) — no
 * network, no real HL. Needs no emulator; runs with the rest of `npm run test:emulator`.
 */
import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const fnRequire = createRequire(path.join(path.resolve(here, "../../../firebase/functions"), "package.json"));
const { HttpHlClient, toHlAmount, clearHlTokens } = fnRequire("./lib/ledger/httpHlClient.js");
const { realBooksFromEmulator } = fnRequire("./lib/ledger/getHlClient.js");

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  clearHlTokens();
});

// No gateway (Ansh, 27 Oct 2026): the functions sign in to HL as the app's own user.
const CFG = { hlBaseUrl: "https://hl.example", email: "office-app@technofluid.test", password: "pw-test" };
const customer = (id, extra = {}) => ({ id, accountId: `acc-${id}`, name: `C ${id}`, email: null, phone: null, gstin: null, externalId: `ext-${id}`, isActive: true, outstanding: "0.00", ...extra });
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** fetch stub: `handlers` answer HL calls in order; every sign-in (/auth/login) returns a new token. */
function stub(handlers) {
  const calls = [];
  let tokens = 0;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: u, method: init.method, headers: init.headers, body });
    if (u.endsWith("/api/v1/auth/login")) {
      tokens += 1;
      return json(200, { success: true, data: { accessToken: `tok-${tokens}`, refreshToken: `ref-${tokens}` } });
    }
    const next = handlers.shift();
    if (!next) throw new Error(`Unexpected HL call: ${init.method} ${u}`);
    return next({ url: u, method: init.method, headers: init.headers, body });
  };
  return { calls, hl: () => calls.filter((c) => c.url.startsWith("https://hl.example") && !c.url.endsWith("/auth/login")), tokens: () => tokens };
}

describe("live HL client (stubbed fetch, OpenAPI shapes)", () => {
  test("paths are under /api/v1 (a base already ending in /api/v1 isn't doubled); it signs in as the app user, once per instance", async () => {
    const s = stub([() => json(200, { success: true, data: customer("1") }), () => json(200, { success: true, data: customer("1") })]);
    await new HttpHlClient(CFG).getCustomer("1");
    await new HttpHlClient(CFG).getCustomer("1"); // a new client in the same instance reuses the token
    assert.equal(s.hl()[0].url, "https://hl.example/api/v1/customers/1");
    assert.equal(s.hl()[0].headers.Authorization, "Bearer tok-1");
    assert.equal(s.hl()[1].headers.Authorization, "Bearer tok-1");
    assert.equal(s.tokens(), 1);
    const login = s.calls.find((c) => c.url === "https://hl.example/api/v1/auth/login");
    assert.deepEqual(login.body, { email: "office-app@technofluid.test", password: "pw-test" });
    assert.equal(login.headers.Authorization, undefined);
    assert.ok(!s.calls.some((c) => /gateway|internal\/hl-token/.test(c.url)));

    clearHlTokens();
    const s2 = stub([() => json(200, { success: true, data: customer("1") })]);
    await new HttpHlClient({ ...CFG, hlBaseUrl: "https://hl.example/api/v1/" }).getCustomer("1");
    assert.equal(s2.hl()[0].url, "https://hl.example/api/v1/customers/1");
  });

  test("a refused sign-in is a permanent LOGIN_FAILED; missing settings are NOT_CONNECTED", async () => {
    globalThis.fetch = async () => json(401, { success: false, error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } });
    await assert.rejects(new HttpHlClient(CFG).getCustomer("1"), (e) => e.code === "LOGIN_FAILED" && e.transient === false);
    assert.throws(() => new HttpHlClient({ ...CFG, password: "" }), (e) => e.code === "NOT_CONNECTED");
  });

  test("create: `idempotent` is read from the envelope (true and false); blank fields are left out", async () => {
    const s = stub([
      () => json(201, { success: true, data: customer("9"), idempotent: true, existingCustomerId: "9" }),
      () => json(201, { success: true, data: customer("10") }),
    ]);
    const c = new HttpHlClient(CFG);
    const a = await c.createCustomer({ name: "A", email: "", phone: "+919876543210", externalId: "ent-1" });
    assert.equal(a.idempotent, true);
    assert.equal(a.customer.id, "9");
    assert.deepEqual(s.hl()[0].body, { name: "A", phone: "+919876543210", externalId: "ent-1" });
    const b = await c.createCustomer({ name: "B", externalId: "ent-2" });
    assert.equal(b.idempotent, false);
    assert.equal(b.customer.isActive, true);
    assert.equal(b.customer.outstanding, "0.00");
  });

  test("update clears a removed field with null, never \"\"", async () => {
    const s = stub([() => json(200, { success: true, data: customer("1") })]);
    await new HttpHlClient(CFG).updateCustomer("1", { name: "A", phone: "+919876543210" });
    assert.deepEqual(s.hl()[0].body, { name: "A", email: null, phone: "+919876543210", gstin: null });
    assert.equal(s.hl()[0].method, "PATCH");
  });

  test("list: data + meta.hasMore across 2 pages, archived included, pages ≤ 100", async () => {
    const s = stub([
      () => json(200, { success: true, data: [customer("1"), customer("2", { isActive: false })], meta: { page: 1, limit: 100, total: 3, totalPages: 2, hasMore: true } }),
      () => json(200, { success: true, data: [customer("3", { outstanding: "-12.50" })], meta: { page: 2, limit: 100, total: 3, totalPages: 2, hasMore: false } }),
    ]);
    const c = new HttpHlClient(CFG);
    const p1 = await c.listCustomers({ page: 1, limit: 500 });
    const p2 = await c.listCustomers({ page: 2, limit: 100 });
    assert.equal(p1.hasMore, true);
    assert.equal(p2.hasMore, false);
    assert.deepEqual([...p1.data, ...p2.data].map((x) => x.id), ["1", "2", "3"]);
    assert.equal(p1.data[1].isActive, false);
    assert.equal(p2.data[0].outstanding, "-12.50");
    const q = new URL(s.hl()[0].url).searchParams;
    assert.equal(q.get("limit"), "100");
    assert.equal(q.get("includeArchived"), "true");
  });

  test("401 refreshes the token once and retries", async () => {
    const s = stub([() => json(401, { success: false, error: { code: "UNAUTHORIZED", message: "expired" } }), () => json(200, { success: true, data: customer("1") })]);
    await new HttpHlClient(CFG).getCustomer("1");
    assert.equal(s.tokens(), 2);
    assert.equal(s.hl()[1].headers.Authorization, "Bearer tok-2");
  });

  test("5xx is retried once; twice is a transient error", async () => {
    const s = stub([() => json(503, {}), () => json(200, { success: true, data: customer("1") })]);
    await new HttpHlClient(CFG).getCustomer("1");
    assert.equal(s.hl().length, 2);
    stub([() => json(502, {}), () => json(502, {})]);
    await assert.rejects(new HttpHlClient(CFG).getCustomer("1"), (e) => e.name === "HlError" && e.transient === true);
  });

  test("HL's error codes come through (422 CUSTOMER_HAS_BALANCE), as permanent errors", async () => {
    stub([() => json(422, { success: false, error: { code: "CUSTOMER_HAS_BALANCE", message: "settle the balance first" } })]);
    await assert.rejects(new HttpHlClient(CFG).archiveCustomer("1"), (e) => e.code === "CUSTOMER_HAS_BALANCE" && e.transient === false && e.status === 422);
  });

  test("opening balance: amount in rupees from paise, date + appId + sourceId sent; txn id at data.transaction.id; none → fails loud", async () => {
    const s = stub([
      () => json(201, { success: true, data: { transaction: { id: "txn-1" }, customer: { id: "1", balance: 12500.5 }, idempotent: false }, idempotent: false }),
      () => json(201, { success: true, data: {} }),
    ]);
    const c = new HttpHlClient(CFG);
    const r = await c.postOpeningBalance("1", { amountPaise: 1_250_050, direction: "RECEIVABLE", date: "2026-04-01", sourceId: "entity_e1:opening", actorRef: "u1" });
    assert.equal(r.txnId, "txn-1");
    assert.deepEqual(s.hl()[0].body, { amount: 12500.5, direction: "RECEIVABLE", date: "2026-04-01", appId: "technofluid-office", sourceId: "entity_e1:opening", actorRef: "u1" });
    await assert.rejects(
      c.postOpeningBalance("1", { amountPaise: 100, direction: "PAYABLE", date: "2026-04-01", sourceId: "x", actorRef: "u1" }),
      (e) => e.code === "UNEXPECTED_SHAPE",
    );
    assert.equal(toHlAmount(99), 0.99);
    assert.throws(() => toHlAmount(1.5));
  });

  test("unexpected shapes fail loud instead of being guessed", async () => {
    stub([() => json(200, { success: true, data: [customer("1")] })]); // no meta.hasMore
    await assert.rejects(new HttpHlClient(CFG).listCustomers({ page: 1, limit: 100 }), (e) => e.code === "UNEXPECTED_SHAPE");
    stub([() => json(200, { success: true, data: { id: "1" } })]); // no accountId
    await assert.rejects(new HttpHlClient(CFG).getCustomer("1"), (e) => e.code === "UNEXPECTED_SHAPE");
    stub([() => json(200, { success: true, data: { rows: [] } })]); // empty range and no closingBalance — nothing to open with
    await assert.rejects(new HttpHlClient(CFG).getLedger({ accountId: "a", from: "2026-04-01", to: "2026-04-30", page: 1, limit: 100 }), (e) => e.code === "UNEXPECTED_SHAPE");
  });

  test("ledger (HL's real shape): rows by transactionId, no sourceId; the opening is worked out from the first row or the closing balance", async () => {
    const row = { transactionId: "t1", date: "2026-04-02T00:00:00Z", description: "Sale TF/2026-27/0001", postingType: "SALE", debit: "50.00", credit: null, balance: "150.00" };
    stub([
      () => json(200, { success: true, data: { rows: [row], closingBalance: "150.00", account: { id: "a", type: "ASSET" }, meta: { page: 1, limit: 100, total: 1, totalPages: 1, hasMore: false } } }),
      () => json(200, { success: true, data: { rows: [], closingBalance: "75.50", account: { id: "a", type: "ASSET" }, meta: { hasMore: false } } }),
      () => json(200, { success: true, data: { rows: [{ ...row, debit: null, credit: "30.00", balance: "130.00" }], closingBalance: "130.00", account: { id: "l", type: "LIABILITY" }, meta: { hasMore: true } } }),
    ]);
    const c = new HttpHlClient(CFG);
    const q = { accountId: "a", from: "2026-04-01", to: "2026-04-30", page: 1, limit: 100 };
    const r = await c.getLedger(q);
    assert.equal(r.openingBalance, "100.00");
    assert.deepEqual(r.rows[0], { txnId: "t1", date: "2026-04-02", description: "Sale TF/2026-27/0001", sourceId: null, postingType: "SALE", debit: "50.00", credit: "0", balance: "150.00" });
    assert.equal(r.hasMore, false);
    assert.equal((await c.getLedger(q)).openingBalance, "75.50");
    const l = await c.getLedger(q);
    assert.equal(l.openingBalance, "100.00"); // credit-normal: 130 less its own +30
    assert.equal(l.hasMore, true);
  });

  test("a sale: our invoice number, one tax line per leg (rate as a fraction), ids from data.invoice / data.transaction; a replay's existing ids", async () => {
    const s = stub([
      () => json(201, { success: true, data: { invoice: { id: "inv-1", invoiceNumber: "TF/2026-27/0001" }, transaction: { id: "tx-1" } }, idempotent: false }),
      () => json(201, { success: true, data: {}, idempotent: true, existingTransactionId: "tx-1", existingInvoiceId: "inv-1" }),
      () => json(201, { success: true, data: { transaction: { id: "tx-2" } } }),
    ]);
    const c = new HttpHlClient(CFG);
    const sale = {
      customerId: "c1",
      amountPaise: 1_414_572,
      taxLines: [
        { label: "CGST 9%", rateBp: 900, accountId: "cgst", amountPaise: 127_314 },
        { label: "SGST 9%", rateBp: 900, accountId: "sgst", amountPaise: 127_314 },
      ],
      revenueAccountId: "rev",
      description: "Sale TF/2026-27/0001",
      date: "2026-10-27",
      sourceId: "sale_s1:sale",
      actorRef: "u1",
      invoiceNumber: "TF/2026-27/0001",
    };
    assert.deepEqual(await c.postSale(sale), { txnId: "tx-1", invoiceId: "inv-1", idempotent: false });
    assert.deepEqual(s.hl()[0].body, {
      customerId: "c1",
      amount: 14145.72,
      taxAmount: 2546.28,
      taxLines: [
        { amount: 1273.14, accountId: "cgst", rate: 0.09, label: "CGST 9%" },
        { amount: 1273.14, accountId: "sgst", rate: 0.09, label: "SGST 9%" },
      ],
      revenueAccountId: "rev",
      description: "Sale TF/2026-27/0001",
      date: "2026-10-27",
      appId: "technofluid-office",
      sourceId: "sale_s1:sale",
      actorRef: "u1",
      invoiceNumber: "TF/2026-27/0001",
    });
    assert.deepEqual(await c.postSale(sale), { txnId: "tx-1", invoiceId: "inv-1", idempotent: true });
    await assert.rejects(c.postSale(sale), (e) => e.code === "UNEXPECTED_SHAPE"); // no invoice id
  });

  test("a supplier's bill: /customer-purchases with input-tax lines (rate as a fraction); no tax → none sent; txn id at data.transaction.id", async () => {
    const s = stub([
      () => json(201, { success: true, data: { transaction: { id: "pt-1" }, idempotent: false, customer: { id: "c1", name: "Supplier", balance: "-53100.00" } } }),
      () => json(201, { success: true, data: { transaction: { id: "pt-2" } } }),
    ]);
    const c = new HttpHlClient(CFG);
    const bill = {
      customerId: "c1",
      amountPaise: 4_500_000,
      taxLines: [
        { label: "Input CGST 9%", rateBp: 900, accountId: "icgst", amountPaise: 405_000 },
        { label: "Input SGST 9%", rateBp: 900, accountId: "isgst", amountPaise: 405_000 },
      ],
      expenseAccountId: "inv",
      description: "Purchase PB/2026-27/0001 · bill TP-001",
      date: "2026-11-12",
      sourceId: "purchase_p1:bill",
      actorRef: "u1",
    };
    assert.deepEqual(await c.postCustomerPurchase(bill), { txnId: "pt-1", idempotent: false });
    assert.equal(s.hl()[0].url, "https://hl.example/api/v1/customer-purchases");
    assert.deepEqual(s.hl()[0].body, {
      customerId: "c1",
      amount: 45000,
      expenseAccountId: "inv",
      taxAmount: 8100,
      taxLines: [
        { amount: 4050, accountId: "icgst", rate: 0.09, label: "Input CGST 9%" },
        { amount: 4050, accountId: "isgst", rate: 0.09, label: "Input SGST 9%" },
      ],
      description: "Purchase PB/2026-27/0001 · bill TP-001",
      date: "2026-11-12",
      appId: "technofluid-office",
      sourceId: "purchase_p1:bill",
      actorRef: "u1",
      metadata: { description: "Purchase PB/2026-27/0001 · bill TP-001" },
    });
    await c.postCustomerPurchase({ ...bill, sourceId: "purchase_p2:bill", taxLines: [] });
    assert.equal("taxLines" in s.hl()[1].body, false);
    assert.equal("taxAmount" in s.hl()[1].body, false);
  });

  test("invoices: read one; cancel sends reason + date; a payment against an invoice sends invoiceId", async () => {
    const s = stub([
      () => json(200, { success: true, data: { id: "inv-1", invoiceNumber: "TF/2026-27/0001", status: "PARTIAL", total: "16692.00", amountPaid: "5000.00" } }),
      () => json(200, { success: true, data: { id: "inv-1", status: "CANCELLED" } }),
      () => json(201, { success: true, data: { transaction: { id: "p1" }, invoice: { id: "inv-1" } } }),
    ]);
    const c = new HttpHlClient(CFG);
    assert.deepEqual(await c.getInvoice("inv-1"), { id: "inv-1", invoiceNumber: "TF/2026-27/0001", status: "PARTIAL", total: "16692.00", amountPaid: "5000.00" });
    await c.cancelInvoice("inv-1", { reason: "Wrong customer", date: "2026-10-28" });
    assert.equal(s.hl()[1].url, "https://hl.example/api/v1/invoices/inv-1/cancel");
    assert.deepEqual(s.hl()[1].body, { reason: "Wrong customer", date: "2026-10-28" });
    const r = await c.postPayment({ customerId: "c1", amountPaise: 500_000, method: "CASH", paymentAccountId: "cash", date: "2026-10-27", sourceId: "sale_s1:payment_0", actorRef: "u1", description: "Payment received with TF/2026-27/0001", invoiceId: "inv-1" });
    assert.equal(r.txnId, "p1");
    assert.equal(s.hl()[2].body.invoiceId, "inv-1");
  });

  test("accounts: list reads data + meta.hasMore; a 409 on create is ACCOUNT_EXISTS", async () => {
    const s = stub([
      () => json(200, { success: true, data: [{ id: "a1", name: "Input CGST", type: "ASSET", isActive: true, isTaxAccount: true }], meta: { hasMore: false } }),
      () => json(409, { success: false, error: { code: "CONFLICT", message: "Account name already exists in this company" } }),
    ]);
    const c = new HttpHlClient(CFG);
    const list = await c.listAccounts({ type: "ASSET", search: "Input CGST", page: 1, limit: 100 });
    assert.equal(list.data[0].isTaxAccount, true);
    const q = new URL(s.hl()[0].url).searchParams;
    assert.equal(q.get("type"), "ASSET");
    assert.equal(q.get("search"), "Input CGST");
    await assert.rejects(c.createAccount({ name: "Input CGST", type: "ASSET", isTaxAccount: true }), (e) => e.code === "ACCOUNT_EXISTS" && e.status === 409);
  });

  test("a transaction: entries in rupees from paise, with appId + sourceId; the txn id comes from data", async () => {
    const s = stub([() => json(201, { success: true, data: { id: "t9", postingType: "JOURNAL" } })]);
    const r = await new HttpHlClient(CFG).postTransaction({
      postingType: "JOURNAL",
      description: "Transfer",
      date: "2026-10-20",
      sourceId: "money_m1",
      actorRef: "u1",
      legs: [
        { accountId: "bank", type: "DEBIT", amountPaise: 1_000_050 },
        { accountId: "cash", type: "CREDIT", amountPaise: 1_000_050 },
      ],
    });
    assert.equal(r.txnId, "t9");
    assert.deepEqual(s.hl()[0].body, {
      appId: "technofluid-office",
      sourceId: "money_m1",
      postingType: "JOURNAL",
      description: "Transfer",
      date: "2026-10-20",
      actorRef: "u1",
      entries: [
        { accountId: "bank", type: "DEBIT", amount: 10000.5 },
        { accountId: "cash", type: "CREDIT", amount: 10000.5 },
      ],
    });
  });

  test("payments and payouts: our wording goes in description (and metadata); no txn id → fails loud", async () => {
    const s = stub([
      () => json(201, { success: true, data: { transactionId: "p1" } }),
      () => json(201, { success: true, data: { transaction: { id: "p2" } } }),
      () => json(201, { success: true, data: {} }),
    ]);
    const c = new HttpHlClient(CFG);
    const move = { customerId: "c1", amountPaise: 500, method: "BANK", paymentAccountId: "bank", date: "2026-10-20", sourceId: "money_m2", actorRef: "u1", description: "Payment received" };
    assert.equal((await c.postPayment(move)).txnId, "p1");
    assert.equal(s.hl()[0].url, "https://hl.example/api/v1/payments");
    assert.equal(s.hl()[0].body.description, "Payment received");
    assert.deepEqual(s.hl()[0].body.metadata, { description: "Payment received" });
    assert.equal(s.hl()[0].body.amount, 5);
    assert.equal(s.hl()[0].body.invoiceId, undefined);
    assert.equal((await c.postPayout(move)).txnId, "p2");
    assert.equal(s.hl()[1].url, "https://hl.example/api/v1/customer-payouts");
    await assert.rejects(c.postPayment(move), (e) => e.code === "UNEXPECTED_SHAPE");
  });

  test("the balance sheet is read by account id wherever it sits; a body that isn't one fails loud", async () => {
    stub([
      () =>
        json(200, {
          success: true,
          data: { asOf: "2026-10-26", assets: { total: "99.00", groups: [{ name: "Cash", accounts: [{ accountId: "cash", name: "Cash", balance: "120.50" }, { id: "bank", balance: "-3.00" }] }] } },
        }),
    ]);
    const sheet = await new HttpHlClient(CFG).getBalanceSheet("2026-10-26");
    assert.equal(sheet.cash, "120.50");
    assert.equal(sheet.bank, "-3.00");
    stub([() => json(200, { success: true })]);
    await assert.rejects(new HttpHlClient(CFG).getBalanceSheet("2026-10-26"), (e) => e.code === "UNEXPECTED_SHAPE");
  });

  test("the real-books switch: only inside the Functions emulator, only when emulators:real-books sets all of it", () => {
    const all = { FUNCTIONS_EMULATOR: "true", TECHNOFLUID_REAL_BOOKS: "yes", TECHNOFLUID_REAL_BOOKS_URL: "https://hl.example", TECHNOFLUID_REAL_BOOKS_EMAIL: "office-app@technofluid.test", TECHNOFLUID_REAL_BOOKS_PASSWORD: "pw" };
    assert.deepEqual(realBooksFromEmulator(all), { hlBaseUrl: "https://hl.example", email: "office-app@technofluid.test", password: "pw" });
    assert.equal(realBooksFromEmulator({ ...all, FUNCTIONS_EMULATOR: undefined }), null); // a deployed function: never
    assert.equal(realBooksFromEmulator({ ...all, TECHNOFLUID_REAL_BOOKS: "true" }), null); // only the exact "yes"
    assert.equal(realBooksFromEmulator({ ...all, TECHNOFLUID_REAL_BOOKS_PASSWORD: "" }), null);
    assert.equal(realBooksFromEmulator({}), null);
  });
});
