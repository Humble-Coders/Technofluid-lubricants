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
const { HttpHlClient, toHlAmount } = fnRequire("./lib/ledger/httpHlClient.js");

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const CFG = { gatewayBaseUrl: "https://gw.example", hlBaseUrl: "https://hl.example", projectId: "technofluid", adminToken: "admin-secret" };
const customer = (id, extra = {}) => ({ id, accountId: `acc-${id}`, name: `C ${id}`, email: null, phone: null, gstin: null, externalId: `ext-${id}`, isActive: true, outstanding: "0.00", ...extra });
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** fetch stub: `handlers` answer HL calls in order; the gateway always returns a token. */
function stub(handlers) {
  const calls = [];
  let tokens = 0;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: u, method: init.method, headers: init.headers, body });
    if (u.startsWith("https://gw.example/")) {
      tokens += 1;
      return json(200, { token: `tok-${tokens}` });
    }
    const next = handlers.shift();
    if (!next) throw new Error(`Unexpected HL call: ${init.method} ${u}`);
    return next({ url: u, method: init.method, headers: init.headers, body });
  };
  return { calls, hl: () => calls.filter((c) => c.url.startsWith("https://hl.example")), tokens: () => tokens };
}

describe("live HL client (stubbed fetch, OpenAPI shapes)", () => {
  test("paths are under /api/v1 (and a base that already ends in /api/v1 isn't doubled); the token comes from the gateway", async () => {
    const s = stub([() => json(200, { success: true, data: customer("1") })]);
    await new HttpHlClient(CFG).getCustomer("1");
    assert.equal(s.hl()[0].url, "https://hl.example/api/v1/customers/1");
    assert.equal(s.hl()[0].headers.Authorization, "Bearer tok-1");
    const gw = s.calls.find((c) => c.url === "https://gw.example/internal/hl-token");
    assert.equal(gw.headers["X-Admin-Token"], "admin-secret");
    assert.deepEqual(gw.body, { projectId: "technofluid" });

    const s2 = stub([() => json(200, { success: true, data: customer("1") })]);
    await new HttpHlClient({ ...CFG, hlBaseUrl: "https://hl.example/api/v1/" }).getCustomer("1");
    assert.equal(s2.hl()[0].url, "https://hl.example/api/v1/customers/1");
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

  test("opening balance: amount in rupees from paise, date + appId + sourceId sent; no txn id → fails loud", async () => {
    const s = stub([
      () => json(201, { success: true, data: { transactionId: "txn-1" }, idempotent: false }),
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
    stub([() => json(200, { success: true, data: { rows: [] } })]); // ledger without an opening balance
    await assert.rejects(new HttpHlClient(CFG).getLedger({ accountId: "a", from: "2026-04-01", to: "2026-04-30", page: 1, limit: 100 }), (e) => e.code === "UNEXPECTED_SHAPE");
  });

  test("ledger: rows, opening balance and hasMore are read from the envelope", async () => {
    stub([
      () =>
        json(200, {
          success: true,
          data: { openingBalance: "100.00", rows: [{ id: "t1", date: "2026-04-02T00:00:00Z", description: "Sale", sourceId: "sale_s1:goods", debit: "50.00", credit: "0.00", balance: "150.00" }] },
          meta: { hasMore: false },
        }),
    ]);
    const r = await new HttpHlClient(CFG).getLedger({ accountId: "a", from: "2026-04-01", to: "2026-04-30", page: 1, limit: 100 });
    assert.equal(r.openingBalance, "100.00");
    assert.deepEqual(r.rows[0], { txnId: "t1", date: "2026-04-02", description: "Sale", sourceId: "sale_s1:goods", debit: "50.00", credit: "0.00", balance: "150.00" });
  });
});
