import {logger} from "firebase-functions/v2";

import {HL_APP_ID, HL_MAX_PAGE, HlError, type HlClient, type HlCustomer, type HlLedgerRow, type HlProfilePayload} from "./hlClient";

/**
 * The live Humble Ledger client. Not used until Technofluid's HL company exists and
 * HL_MODE=live is set on the live project (a config change, not a code change).
 *
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

/** The ONE place paise become HL's decimal rupees (brief §9b.9). */
export function toHlAmount(paise: number): number {
  if (!Number.isInteger(paise)) throw new RangeError("Amounts are whole paise");
  return paise / 100;
}

export class HttpHlClient implements HlClient {
  readonly mode = "live" as const;
  private token: string | null = null;

  constructor(private readonly cfg: HttpHlConfig) {
    if (!cfg.gatewayBaseUrl || !cfg.hlBaseUrl || !cfg.projectId || !cfg.adminToken) {
      throw new HlError("Humble Ledger isn't configured (gateway, base URL, project or token missing).", 500, false);
    }
  }

  private async fetchToken(): Promise<string> {
    const res = await this.raw(`${this.cfg.gatewayBaseUrl.replace(/\/$/, "")}/internal/hl-token`, {
      method: "POST",
      headers: {"Content-Type": "application/json", "X-Admin-Token": this.cfg.adminToken},
      body: JSON.stringify({projectId: this.cfg.projectId}),
    });
    const body = (await res.json().catch(() => ({}))) as {token?: string; accessToken?: string};
    const token = body.token ?? body.accessToken;
    if (!res.ok || !token) throw new HlError(`Couldn't get a Humble Ledger token (${res.status})`, res.status >= 500 ? res.status : 502, res.status >= 500);
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

  private async call<T>(method: string, path: string, body?: unknown, attempt = 0, refreshed = false): Promise<T> {
    if (!this.token) this.token = await this.fetchToken();
    let res: Response;
    try {
      res = await this.raw(`${this.cfg.hlBaseUrl.replace(/\/$/, "")}${path}`, {
        method,
        headers: {"Content-Type": "application/json", "Authorization": `Bearer ${this.token}`},
        ...(body === undefined ? {} : {body: JSON.stringify(body)}),
      });
    } catch (e) {
      if (attempt === 0) return this.call<T>(method, path, body, 1, refreshed);
      throw e;
    }
    if (res.status === 401 && !refreshed) {
      this.token = await this.fetchToken();
      return this.call<T>(method, path, body, attempt, true);
    }
    if (res.status >= 500 && attempt === 0) return this.call<T>(method, path, body, 1, refreshed);
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const message = String((json.error as {message?: string} | undefined)?.message ?? json.message ?? `HTTP ${res.status}`);
      logger.warn("HL error", {method, path: path.replace(/\?.*$/, ""), status: res.status, message});
      throw new HlError(message, res.status, res.status >= 500 || res.status === 429);
    }
    return ((json.data ?? json) as T);
  }

  private static profile(p: HlProfilePayload) {
    // Omit blanks — HL rejects "" (Aromex lesson 7).
    return Object.fromEntries(Object.entries(p).filter(([, v]) => typeof v === "string" && v !== ""));
  }

  async createCustomer(p: HlProfilePayload & {externalId: string}) {
    const res = await this.call<{customer?: HlCustomer; idempotent?: boolean} & HlCustomer>("POST", "/customers", {
      ...HttpHlClient.profile(p),
      externalId: p.externalId,
    });
    const customer = res.customer ?? res;
    return {customer, idempotent: res.idempotent === true};
  }

  updateCustomer(id: string, p: HlProfilePayload) {
    return this.call<HlCustomer>("PATCH", `/customers/${encodeURIComponent(id)}`, HttpHlClient.profile(p));
  }

  async archiveCustomer(id: string) {
    await this.call("POST", `/customers/${encodeURIComponent(id)}/archive`, {});
  }

  async unarchiveCustomer(id: string) {
    await this.call("POST", `/customers/${encodeURIComponent(id)}/unarchive`, {});
  }

  async postOpeningBalance(
    customerId: string,
    p: {amountPaise: number; direction: "RECEIVABLE" | "PAYABLE"; date: string; sourceId: string; actorRef: string},
  ) {
    const res = await this.call<{id?: string; txnId?: string; transactionId?: string; idempotent?: boolean}>(
      "POST",
      `/customers/${encodeURIComponent(customerId)}/opening-balance`,
      {amount: toHlAmount(p.amountPaise), direction: p.direction, date: p.date, appId: HL_APP_ID, sourceId: p.sourceId, actorRef: p.actorRef},
    );
    const txnId = res.txnId ?? res.transactionId ?? res.id;
    if (!txnId) throw new HlError("Humble Ledger didn't return a transaction id", 502, true);
    return {txnId, idempotent: res.idempotent === true};
  }

  async listCustomers(p: {page: number; limit: number}) {
    const res = await this.call<{data?: HlCustomer[]; meta?: {hasMore?: boolean}} | HlCustomer[]>(
      "GET",
      `/customers?page=${p.page}&limit=${Math.min(p.limit, HL_MAX_PAGE)}`,
    );
    if (Array.isArray(res)) return {data: res, hasMore: false};
    return {data: res.data ?? [], hasMore: res.meta?.hasMore === true};
  }

  getCustomer(id: string) {
    return this.call<HlCustomer>("GET", `/customers/${encodeURIComponent(id)}`);
  }

  async getLedger(p: {accountId: string; from: string; to: string; page: number; limit: number}) {
    const q = new URLSearchParams({accountId: p.accountId, from: p.from, to: p.to, page: String(p.page), limit: String(Math.min(p.limit, HL_MAX_PAGE))});
    const res = await this.call<{openingBalance?: string; rows?: HlLedgerRow[]; entries?: HlLedgerRow[]; meta?: {hasMore?: boolean}}>(
      "GET",
      `/ledger?${q.toString()}`,
    );
    return {openingBalance: res.openingBalance ?? "0", rows: res.rows ?? res.entries ?? [], hasMore: res.meta?.hasMore === true};
  }
}
