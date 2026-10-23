import {logger} from "firebase-functions/v2";

import {HL_APP_ID, HL_MAX_PAGE, HlError, type HlClient, type HlCustomer, type HlLedgerRow, type HlProfilePayload} from "./hlClient";

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
 *  - Token: POST <GATEWAY_BASE_URL>/internal/hl-token, header X-Admin-Token, body
 *    {projectId}. The admin token is a Functions secret (GATEWAY_ADMIN_TOKEN) — never in
 *    the repo; Ansh supplies one scoped to Technofluid (Aromex lesson 8).
 *  - 30 s timeout; one retry on network errors / 5xx; on 401 refresh the token once.
 *  - Errors never carry the token or raw transport text to the app (see plainHlMessage);
 *    details go to the function log.
 */

export interface HttpHlConfig {
  gatewayBaseUrl: string;
  hlBaseUrl: string;
  projectId: string;
  adminToken: string;
}

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

export class HttpHlClient implements HlClient {
  readonly mode = "live" as const;
  private token: string | null = null;
  private readonly api: string;

  constructor(private readonly cfg: HttpHlConfig) {
    if (!cfg.gatewayBaseUrl || !cfg.hlBaseUrl || !cfg.projectId || !cfg.adminToken) {
      throw new HlError("Humble Ledger isn't configured (gateway, base URL, project or token missing).", 500, false, "NOT_CONNECTED");
    }
    const root = cfg.hlBaseUrl.replace(/\/+$/, "");
    this.api = root.endsWith("/api/v1") ? root : `${root}/api/v1`;
  }

  private async fetchToken(): Promise<string> {
    const res = await this.raw(`${this.cfg.gatewayBaseUrl.replace(/\/+$/, "")}/internal/hl-token`, {
      method: "POST",
      headers: {"Content-Type": "application/json", "X-Admin-Token": this.cfg.adminToken},
      body: JSON.stringify({projectId: this.cfg.projectId}),
    });
    const body = obj(await res.json().catch(() => null)) ?? {};
    const data = obj(body.data) ?? {};
    const token = [body.token, body.accessToken, data.token, data.accessToken].find((t): t is string => typeof t === "string" && t.length > 0);
    if (!res.ok || !token) {
      throw new HlError(`Couldn't get a Humble Ledger token (${res.status})`, res.status >= 500 ? res.status : 502, res.status >= 500);
    }
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
    const data = obj(res.data) ?? {};
    const txnId = [data.transactionId, data.txnId, data.id, res.transactionId, res.txnId].map(strOrNull).find(Boolean);
    if (!txnId) throw unexpected("opening-balance");
    return {txnId, idempotent: res.idempotent === true || data.idempotent === true};
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
   * VERIFY ON FIRST LIVE CALL: the OpenAPI only says "Ledger with running balance and
   * pagination meta". We accept rows at data (array) or data.rows / data.entries, the
   * opening balance at data.openingBalance / meta.openingBalance / openingBalance, and
   * hasMore at meta.hasMore — and fail loud on anything else.
   */
  async getLedger(p: {accountId: string; from: string; to: string; page: number; limit: number}) {
    const q = new URLSearchParams({accountId: p.accountId, from: p.from, to: p.to, page: String(p.page), limit: String(Math.min(p.limit, HL_MAX_PAGE))});
    const res = await this.call("GET", `/ledger?${q.toString()}`);
    const data = res.data;
    const holder = obj(data);
    const rawRows = Array.isArray(data) ? data : holder?.rows ?? holder?.entries;
    if (!Array.isArray(rawRows)) throw unexpected("ledger");
    const meta = obj(res.meta) ?? obj(holder?.meta) ?? {};
    const opening = strOrNull(holder?.openingBalance ?? meta.openingBalance ?? res.openingBalance);
    if (opening === null) throw unexpected("ledger (openingBalance)");
    const rows: HlLedgerRow[] = rawRows.map((r) => {
      const x = obj(r);
      const txnId = strOrNull(x?.txnId ?? x?.transactionId ?? x?.id);
      const balance = strOrNull(x?.balance ?? x?.runningBalance);
      if (!x || !txnId || balance === null || typeof x.date !== "string") throw unexpected("ledger row");
      return {
        txnId,
        date: x.date.slice(0, 10),
        description: String(x.description ?? x.narration ?? ""),
        sourceId: strOrNull(x.sourceId),
        debit: strOrNull(x.debit) ?? "0",
        credit: strOrNull(x.credit) ?? "0",
        balance,
      };
    });
    return {openingBalance: opening, rows, hasMore: meta.hasMore === true};
  }
}
