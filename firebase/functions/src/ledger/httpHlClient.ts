import {logger} from "firebase-functions/v2";

import {
  HL_APP_ID,
  HL_MAX_PAGE,
  HlError,
  type HlAccount,
  type HlAccountType,
  type HlClient,
  type HlCustomer,
  type HlInvoice,
  type HlLedgerRow,
  type HlLeg,
  type HlMoneyMove,
  type HlPostingType,
  type HlProfilePayload,
  type HlSale,
} from "./hlClient";

/**
 * The live Humble Ledger client. Not used until Technofluid's HL company exists and
 * HL_MODE=live is set on the live project (a config change, not a code change).
 *
 * Shapes follow HL's OpenAPI (https://hl.humblesolutions.in/docs/json, checked 24 Oct
 * 2026). Every response is an envelope — {success, data, …} — so call() returns the
 * WHOLE body and each method unwraps it (e.g. create's `idempotent` and list's
 * `meta.hasMore` sit next to `data`, not in it). Anything not in the expected shape
 * fails loud rather than being guessed.
 *
 *  - Paths are under /api/v1 (HL_BASE_URL is the server root, e.g.
 *    https://hl.humblesolutions.in; a base that already ends in /api/v1 also works).
 *  - Sign-in: POST /auth/login {email, password} as Technofluid's own app user — no
 *    gateway (Ansh, 27 Oct 2026). The access token lasts ~15 minutes; it is kept per
 *    function instance and renewed on expiry or a 401. The password is a Functions
 *    secret (HL_LOGIN_PASSWORD) — never in the repo.
 *  - 30 s timeout; one retry on network errors / 5xx; on 401 refresh the token once.
 *  - Errors never carry the token or raw transport text to the app (see plainHlMessage);
 *    details go to the function log.
 */

export interface HttpHlConfig {
  hlBaseUrl: string;
  /** The app's HL user (ACCOUNTANT in Technofluid's company). */
  email: string;
  password: string;
}

/** Access tokens, shared by the clients of one function instance (a new client per run). */
const TOKENS = new Map<string, {token: string; until: number}>();
/** Renew a little before HL's 15 minutes run out. */
const TOKEN_LIFE_MS = 13 * 60_000;
/** For tests: forget every cached token. */
export const clearHlTokens = () => TOKENS.clear();

const TIMEOUT_MS = 30_000;
type Body = Record<string, unknown>;

/** The ONE place paise become HL's decimal rupees (brief §9b.9). */
export function toHlAmount(paise: number): number {
  if (!Number.isInteger(paise)) throw new RangeError("Amounts are whole paise");
  return paise / 100;
}

const unexpected = (what: string) => new HlError(`Humble Ledger sent an unexpected ${what} response`, 502, false, "UNEXPECTED_SHAPE");
const obj = (x: unknown): Body | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Body) : null);
const strOrNull = (x: unknown) => (typeof x === "string" ? x : typeof x === "number" ? String(x) : null);

/** HL's decimal rupees ("1234.5", "-0.01") → paise, read from the text (never × 100 on a float). */
function decimalPaise(v: string): number {
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(v.trim());
  if (!m) throw unexpected(`amount "${v}"`);
  const paise = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  return m[1] ? -paise : paise;
}
const paiseDecimal = (p: number) => `${p < 0 ? "-" : ""}${Math.floor(Math.abs(p) / 100)}.${String(Math.abs(p) % 100).padStart(2, "0")}`;

/** HL's Customer → ours; refuses anything without an id and an account. */
function toCustomer(x: unknown, what: string): HlCustomer {
  const c = obj(x);
  if (!c || typeof c.id !== "string" || typeof c.accountId !== "string") throw unexpected(what);
  return {
    id: c.id,
    accountId: c.accountId,
    externalId: strOrNull(c.externalId),
    name: String(c.name ?? ""),
    isActive: c.isActive !== false,
    outstanding: strOrNull(c.outstanding),
    balance: strOrNull(c.balance),
  };
}

function toAccount(x: unknown, what: string): HlAccount {
  const a = obj(x);
  if (!a || typeof a.id !== "string" || typeof a.name !== "string") throw unexpected(what);
  return {id: a.id, name: a.name, type: String(a.type ?? "") as HlAccountType, isActive: a.isActive !== false, isTaxAccount: a.isTaxAccount === true};
}

/** A posting's txn id, wherever this (partly undocumented) response keeps it. */
function txnIdOf(res: Body, what: string): string {
  const data = obj(res.data) ?? {};
  const txn = obj(data.transaction) ?? {};
  const id = [txn.id, data.transactionId, data.txnId, data.id, data.existingTransactionId, res.existingTransactionId, res.transactionId, res.txnId].map(strOrNull).find(Boolean);
  if (!id) throw unexpected(what);
  return id;
}

export class HttpHlClient implements HlClient {
  readonly mode = "live" as const;
  private token: string | null = null;
  private readonly api: string;

  constructor(private readonly cfg: HttpHlConfig) {
    if (!cfg.hlBaseUrl || !cfg.email || !cfg.password) {
      throw new HlError("Humble Ledger isn't configured (base URL, app login email or password missing).", 500, false, "NOT_CONNECTED");
    }
    const root = cfg.hlBaseUrl.replace(/\/+$/, "");
    this.api = root.endsWith("/api/v1") ? root : `${root}/api/v1`;
    this.key = `${this.api}|${cfg.email.toLowerCase()}`;
  }

  private readonly key: string;

  /**
   * POST /auth/login → 200 {data: {accessToken (15 min), refreshToken, token, user}}
   * (confirmed by Ansh HL, 27 Oct 2026). Each login stores a refresh token in HL, so we
   * sign in once per ~13 minutes per instance, never per request. A refused login (wrong
   * password, user disabled) is permanent — retrying can't fix it.
   */
  private async fetchToken(): Promise<string> {
    const cached = TOKENS.get(this.key);
    if (cached && cached.until > Date.now()) return cached.token;
    const res = await this.raw(`${this.api}/auth/login`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({email: this.cfg.email, password: this.cfg.password}),
    });
    const body = obj(await res.json().catch(() => null)) ?? {};
    const data = obj(body.data) ?? {};
    const tokens = obj(data.tokens) ?? {};
    const token = [data.accessToken, tokens.accessToken, body.accessToken, data.token].find((t): t is string => typeof t === "string" && t.length > 0);
    if (res.status === 401 || res.status === 403) {
      throw new HlError("Humble Ledger refused the app's sign-in — check HL_LOGIN_EMAIL / HL_LOGIN_PASSWORD.", res.status, false, "LOGIN_FAILED");
    }
    if (!res.ok || !token) {
      throw new HlError(`Couldn't sign in to Humble Ledger (${res.status})`, res.status >= 500 ? res.status : 502, res.status >= 500 || res.status === 429);
    }
    TOKENS.set(this.key, {token, until: Date.now() + TOKEN_LIFE_MS});
    return token;
  }

  private async raw(url: string, init: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      return await fetch(url, {...init, signal: ctrl.signal});
    } catch (e) {
      logger.warn("HL network error", {url: url.replace(/\?.*$/, ""), error: String(e)});
      throw new HlError("Network error reaching Humble Ledger", 503, true);
    } finally {
      clearTimeout(timer);
    }
  }

  /** One HL request → the whole response body (unwrapped by each method). */
  private async call(method: string, path: string, body?: unknown, attempt = 0, refreshed = false): Promise<Body> {
    if (!this.token) this.token = await this.fetchToken();
    let res: Response;
    try {
      res = await this.raw(`${this.api}${path}`, {
        method,
        headers: {"Content-Type": "application/json", "Authorization": `Bearer ${this.token}`},
        ...(body === undefined ? {} : {body: JSON.stringify(body)}),
      });
    } catch (e) {
      if (attempt === 0) return this.call(method, path, body, 1, refreshed);
      throw e;
    }
    if (res.status === 401 && !refreshed) {
      TOKENS.delete(this.key);
      this.token = await this.fetchToken();
      return this.call(method, path, body, attempt, true);
    }
    if (res.status >= 500 && attempt === 0) return this.call(method, path, body, 1, refreshed);
    const json = obj(await res.json().catch(() => null)) ?? {};
    if (!res.ok || json.success === false) {
      const err = obj(json.error) ?? {};
      const message = String(err.message ?? json.message ?? `HTTP ${res.status}`);
      const code = strOrNull(err.code ?? json.code);
      logger.warn("HL error", {method, path: path.replace(/\?.*$/, ""), status: res.status, code, message});
      throw new HlError(message, res.status, res.status >= 500 || res.status === 429, code);
    }
    return json;
  }

  async createCustomer(p: HlProfilePayload & {externalId: string}) {
    // Create: blanks are left out — HL rejects "" (Aromex lesson 7).
    const payload = Object.fromEntries(Object.entries({...p}).filter(([, v]) => typeof v === "string" && v !== ""));
    const res = await this.call("POST", "/customers", payload);
    return {customer: toCustomer(res.data, "create-customer"), idempotent: res.idempotent === true};
  }

  async updateCustomer(id: string, p: HlProfilePayload) {
    // Update: a field we no longer have is cleared with null (HL allows it), never "".
    const res = await this.call("PATCH", `/customers/${encodeURIComponent(id)}`, {
      name: p.name,
      email: p.email || null,
      phone: p.phone || null,
      gstin: p.gstin || null,
    });
    return toCustomer(res.data, "update-customer");
  }

  async archiveCustomer(id: string) {
    await this.call("POST", `/customers/${encodeURIComponent(id)}/archive`, {});
  }

  async unarchiveCustomer(id: string) {
    await this.call("POST", `/customers/${encodeURIComponent(id)}/unarchive`, {});
  }

  /**
   * VERIFY ON FIRST LIVE CALL: the OpenAPI documents the request but not the 201 body.
   * We accept the txn id at data.transactionId / data.txnId / data.id (or top level) and
   * fail loud if none is there — never mark an opening posted without HL's txn id.
   */
  async postOpeningBalance(
    customerId: string,
    p: {amountPaise: number; direction: "RECEIVABLE" | "PAYABLE"; date: string; sourceId: string; actorRef: string},
  ) {
    const res = await this.call("POST", `/customers/${encodeURIComponent(customerId)}/opening-balance`, {
      amount: toHlAmount(p.amountPaise),
      direction: p.direction,
      date: p.date,
      appId: HL_APP_ID,
      sourceId: p.sourceId,
      actorRef: p.actorRef,
    });
    const txnId = txnIdOf(res, "opening-balance"); // data.transaction.id (Ansh HL, 27 Oct 2026)
    return {txnId, idempotent: res.idempotent === true || obj(res.data)?.idempotent === true};
  }

  async listCustomers(p: {page: number; limit: number}) {
    const q = new URLSearchParams({page: String(p.page), limit: String(Math.min(p.limit, HL_MAX_PAGE)), includeArchived: "true"});
    const res = await this.call("GET", `/customers?${q.toString()}`);
    if (!Array.isArray(res.data)) throw unexpected("list-customers");
    const meta = obj(res.meta);
    if (!meta || typeof meta.hasMore !== "boolean") throw unexpected("list-customers (meta.hasMore)");
    return {data: res.data.map((c) => toCustomer(c, "list-customers")), hasMore: meta.hasMore};
  }

  async getCustomer(id: string) {
    const res = await this.call("GET", `/customers/${encodeURIComponent(id)}`);
    return toCustomer(res.data, "get-customer");
  }

  /**
   * GET /ledger (shape from Ansh HL, 27 Oct 2026): data.rows[{date, description,
   * postingType, debit|null, credit|null, balance, transactionId}] ascending, data.meta
   * {hasMore…}, data.closingBalance, data.account. There is NO openingBalance and NO
   * sourceId: the opening is the first row's running balance less that row's own movement
   * (signed by the account's normal side), or the closing balance when the range is empty.
   */
  async getLedger(p: {accountId: string; from: string; to: string; page: number; limit: number}) {
    const q = new URLSearchParams({accountId: p.accountId, from: p.from, to: p.to, page: String(p.page), limit: String(Math.min(p.limit, HL_MAX_PAGE))});
    const res = await this.call("GET", `/ledger?${q.toString()}`);
    const data = res.data;
    const holder = obj(data);
    const rawRows = Array.isArray(data) ? data : holder?.rows ?? holder?.entries;
    if (!Array.isArray(rawRows)) throw unexpected("ledger");
    const meta = obj(holder?.meta) ?? obj(res.meta) ?? {};
    const rows: HlLedgerRow[] = rawRows.map((r) => {
      const x = obj(r);
      const txnId = strOrNull(x?.transactionId ?? x?.txnId ?? x?.id);
      const balance = strOrNull(x?.balance ?? x?.runningBalance);
      if (!x || !txnId || balance === null || typeof x.date !== "string") throw unexpected("ledger row");
      return {
        txnId,
        date: x.date.slice(0, 10),
        description: String(x.description ?? x.narration ?? ""),
        sourceId: strOrNull(x.sourceId),
        postingType: strOrNull(x.postingType),
        debit: strOrNull(x.debit) ?? "0",
        credit: strOrNull(x.credit) ?? "0",
        balance,
      };
    });
    let opening = strOrNull(holder?.openingBalance ?? meta.openingBalance ?? res.openingBalance);
    if (opening === null) {
      if (rows.length > 0) {
        const first = rows[0];
        const type = String(obj(holder?.account)?.type ?? "ASSET").toUpperCase();
        const creditNormal = type === "LIABILITY" || type === "EQUITY" || type === "INCOME";
        const move = creditNormal ? decimalPaise(first.credit) - decimalPaise(first.debit) : decimalPaise(first.debit) - decimalPaise(first.credit);
        opening = paiseDecimal(decimalPaise(first.balance) - move);
      } else {
        opening = strOrNull(holder?.closingBalance);
        if (opening === null) throw unexpected("ledger (no rows and no closingBalance)");
      }
    }
    return {openingBalance: opening, rows, hasMore: meta.hasMore === true};
  }

  async listAccounts(p: {type?: HlAccountType; search?: string; page: number; limit: number}) {
    const q = new URLSearchParams({page: String(p.page), limit: String(Math.min(p.limit, HL_MAX_PAGE))});
    if (p.type) q.set("type", p.type);
    if (p.search) q.set("search", p.search);
    const res = await this.call("GET", `/accounts?${q.toString()}`);
    if (!Array.isArray(res.data)) throw unexpected("list-accounts");
    const meta = obj(res.meta);
    if (!meta || typeof meta.hasMore !== "boolean") throw unexpected("list-accounts (meta.hasMore)");
    return {data: res.data.map((a) => toAccount(a, "list-accounts")), hasMore: meta.hasMore};
  }

  /** VERIFY ON FIRST LIVE CALL: the 201 body is "Account created" (assumed {data: Account}). */
  async createAccount(p: {name: string; type: HlAccountType; isTaxAccount?: boolean}) {
    try {
      const res = await this.call("POST", "/accounts", {name: p.name, type: p.type, isTaxAccount: p.isTaxAccount === true});
      return toAccount(res.data, "create-account");
    } catch (e) {
      if (e instanceof HlError && e.status === 409) throw new HlError(e.message, 409, false, "ACCOUNT_EXISTS");
      throw e;
    }
  }

  async postTransaction(p: {postingType: HlPostingType; description: string; date: string; sourceId: string; actorRef: string; legs: HlLeg[]}) {
    const res = await this.call("POST", "/transactions", {
      appId: HL_APP_ID,
      sourceId: p.sourceId,
      postingType: p.postingType,
      description: p.description,
      date: p.date,
      actorRef: p.actorRef,
      entries: p.legs.map((l) => ({accountId: l.accountId, type: l.type, amount: toHlAmount(l.amountPaise)})),
    });
    return {txnId: txnIdOf(res, "transaction"), idempotent: res.idempotent === true};
  }

  /**
   * VERIFY ON FIRST LIVE CALL (payments and payouts): the 201 bodies aren't documented.
   * Our wording goes in `description` (so HL's statement reads properly) and metadata.description.
   * No invoiceId (Sales isn't built), so HL's 422 OVERPAYMENT (tied to invoices) shouldn't
   * apply to an advance; confirm.
   */
  private async move(path: string, p: HlMoneyMove) {
    const res = await this.call("POST", path, {
      customerId: p.customerId,
      amount: toHlAmount(p.amountPaise),
      method: p.method,
      paymentAccountId: p.paymentAccountId,
      date: p.date,
      appId: HL_APP_ID,
      sourceId: p.sourceId,
      actorRef: p.actorRef,
      description: p.description,
      metadata: {description: p.description},
      ...(p.invoiceId ? {invoiceId: p.invoiceId} : {}),
    });
    return {txnId: txnIdOf(res, path.slice(1)), idempotent: res.idempotent === true};
  }

  postPayment(p: HlMoneyMove) {
    return this.move("/payments", p);
  }

  postPayout(p: HlMoneyMove) {
    return this.move("/customer-payouts", p);
  }

  /**
   * VERIFY ON FIRST LIVE CALL: the report body is only "Balance sheet". We collect every
   * node that has an account id and a balance, anywhere under data, and fail loud if the
   * body isn't an object — a missing report is an error, never "everything is ₹0".
   */
  async getBalanceSheet(date: string) {
    const res = await this.call("GET", `/reports/balance-sheet?date=${encodeURIComponent(date)}`);
    if (!obj(res.data) && !Array.isArray(res.data)) throw unexpected("balance-sheet");
    const out: Record<string, string> = {};
    const walk = (x: unknown) => {
      if (Array.isArray(x)) return x.forEach(walk);
      const o = obj(x);
      if (!o) return;
      const id = strOrNull(o.accountId ?? o.id);
      const bal = strOrNull(o.balance ?? o.amount ?? o.closingBalance);
      if (id && bal !== null) out[id] = bal;
      Object.values(o).forEach(walk);
    };
    walk(res.data);
    return out;
  }

  /**
   * POST /sales with our own invoice number (≤ 50 chars, unique per company — a clash is
   * 409 and nothing is posted) and at most 4 tax lines (HL's limit; we send one per GST
   * leg). With taxLines HL takes tax = their sum, verbatim; `rate` is a fraction (0.09).
   * Confirmed by Ansh HL, 27 Oct 2026.
   */
  async postSale(p: HlSale) {
    const tax = p.taxLines.reduce((s, l) => s + l.amountPaise, 0);
    const res = await this.call("POST", "/sales", {
      customerId: p.customerId,
      amount: toHlAmount(p.amountPaise),
      taxAmount: toHlAmount(tax),
      taxLines: p.taxLines.map((l) => ({amount: toHlAmount(l.amountPaise), accountId: l.accountId, ...(l.rateBp ? {rate: l.rateBp / 10_000} : {}), label: l.label.slice(0, 40)})),
      revenueAccountId: p.revenueAccountId,
      description: p.description,
      date: p.date,
      appId: HL_APP_ID,
      sourceId: p.sourceId,
      actorRef: p.actorRef,
      invoiceNumber: p.invoiceNumber,
    });
    // 201 {data: {invoice, transaction}}; a replay adds idempotent + existingInvoiceId /
    // existingTransactionId (Ansh HL, 27 Oct 2026) — read wherever they are.
    const data = obj(res.data) ?? {};
    const invoice = obj(data.invoice) ?? {};
    const invoiceId = [invoice.id, data.invoiceId, data.existingInvoiceId, res.existingInvoiceId].map(strOrNull).find(Boolean);
    if (!invoiceId) throw unexpected("sale (invoice id)");
    return {txnId: txnIdOf(res, "sale"), invoiceId, idempotent: res.idempotent === true};
  }

  async getInvoice(id: string): Promise<HlInvoice> {
    const res = await this.call("GET", `/invoices/${encodeURIComponent(id)}`);
    const d = obj(res.data);
    const total = strOrNull(d?.total);
    const amountPaid = strOrNull(d?.amountPaid);
    if (!d || typeof d.id !== "string" || typeof d.status !== "string" || total === null || amountPaid === null) throw unexpected("invoice");
    return {id: d.id, invoiceNumber: strOrNull(d.invoiceNumber), status: d.status, total, amountPaid};
  }

  /** Not idempotent (HL takes no sourceId here) — the caller reads the invoice first. */
  async cancelInvoice(id: string, p: {reason: string; date: string}) {
    await this.call("POST", `/invoices/${encodeURIComponent(id)}/cancel`, {reason: p.reason, date: p.date});
  }
}
