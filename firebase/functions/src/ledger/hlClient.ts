/**
 * Humble Ledger (HL) — the one interface the app's Cloud Functions use. HL is called
 * ONLY from Cloud Functions (reads included); the desktop never holds an HL token.
 *
 *  - Amounts go IN as integer paise; the live client converts to rupees in exactly one
 *    function (toHlAmount). Amounts come OUT as HL's decimal STRINGS — read them with
 *    hlAmountToPaise, never Number() × 100.
 *  - Every post carries appId, a deterministic sourceId and an actorRef; HL is
 *    idempotent on (appId, sourceId) and returns the ORIGINAL txn on a replay.
 *  - Page sizes ≤ 100 (HL /transactions returns 400 above that).
 *
 * Two implementations: httpHlClient (live, through the Humble gateway) and fakeHlClient
 * (in the emulator, a real little ledger in _fakeHl/*). Which one is used is config
 * (HL_MODE), and a demo- project can only ever get the fake — see getHlClient.
 */

export const HL_APP_ID = "technofluid-office";
export const HL_MAX_PAGE = 100;

export interface HlProfilePayload {
  name: string;
  /** Omitted when there is none — HL rejects "". */
  phone?: string;
  email?: string;
  gstin?: string;
}

export interface HlCustomer {
  id: string;
  accountId: string;
  externalId: string | null;
  name: string;
  archived: boolean;
  /** Decimal rupees; some HL responses only carry `outstanding` — read balance ?? outstanding. */
  balance?: string | null;
  outstanding?: string | null;
}

export interface HlLedgerRow {
  txnId: string;
  date: string;
  description: string;
  sourceId: string | null;
  debit: string;
  credit: string;
  /** HL's running balance, as given — never recomputed. */
  balance: string;
}

export interface HlClient {
  readonly mode: "fake" | "live";
  createCustomer(p: HlProfilePayload & {externalId: string}): Promise<{customer: HlCustomer; idempotent: boolean}>;
  updateCustomer(id: string, p: HlProfilePayload): Promise<HlCustomer>;
  archiveCustomer(id: string): Promise<void>;
  unarchiveCustomer(id: string): Promise<void>;
  postOpeningBalance(
    customerId: string,
    p: {amountPaise: number; direction: "RECEIVABLE" | "PAYABLE"; date: string; sourceId: string; actorRef: string},
  ): Promise<{txnId: string; idempotent: boolean}>;
  listCustomers(p: {page: number; limit: number}): Promise<{data: HlCustomer[]; hasMore: boolean}>;
  getCustomer(id: string): Promise<HlCustomer>;
  getLedger(p: {accountId: string; from: string; to: string; page: number; limit: number}): Promise<{
    openingBalance: string;
    rows: HlLedgerRow[];
    hasMore: boolean;
  }>;
}

/** An HL failure. `transient` = worth retrying (network, 5xx, 429); else the data is wrong. */
export class HlError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly transient: boolean,
  ) {
    super(message);
    this.name = "HlError";
  }
}

export const isNotFound = (e: unknown) => e instanceof HlError && e.status === 404;

/**
 * A plain first line for people. Never the raw transport error — it can carry the bearer
 * token (brief §9b.6); the full error goes to the function log only.
 */
export function plainHlMessage(e: unknown): string {
  if (e instanceof HlError) {
    if (e.transient) return "The books (Humble Ledger) couldn't be reached. Try again in a minute.";
    return `The books refused it: ${e.message.split("\n")[0].slice(0, 200)}`;
  }
  return "Something went wrong talking to the books.";
}
