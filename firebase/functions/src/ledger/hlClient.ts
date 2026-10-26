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
 * Shapes follow HL's OpenAPI (https://hl.humblesolutions.in/docs/json): a Customer is
 * {id, accountId, name, email, phone, gstin, externalId, isActive, outstanding}.
 *
 * Implementations: httpHlClient (live, through the Humble gateway), fakeHlClient (ONLY
 * on demo- projects — a real little ledger in _fakeHl/*) and the "not connected" client
 * for any other project until HL_MODE=live is set — every call then fails loud, so
 * nothing is ever booked in a practice ledger in production. See getHlClient.
 */

export const HL_APP_ID = "technofluid-office";
export const HL_MAX_PAGE = 100;

export interface HlProfilePayload {
  name: string;
  /** Left out (create) or sent as null (update) when there is none — HL rejects "". */
  phone?: string;
  email?: string;
  gstin?: string;
}

export interface HlCustomer {
  id: string;
  accountId: string;
  externalId: string | null;
  name: string;
  /** false once archived. */
  isActive: boolean;
  /** Decimal rupees (HL's field). Read balance ?? outstanding — some responses lack one. */
  outstanding?: string | null;
  balance?: string | null;
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

export type HlAccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";

export interface HlAccount {
  id: string;
  name: string;
  type: HlAccountType;
  isActive: boolean;
  isTaxAccount: boolean;
}

/** One leg of a double-entry transaction (HL's EntryInput), in paise until the boundary. */
export interface HlLeg {
  accountId: string;
  type: "DEBIT" | "CREDIT";
  amountPaise: number;
}

export type HlPostingType = "SALE" | "PAYMENT" | "ADVANCE" | "ADVANCE_APPLIED" | "EXPENSE" | "PURCHASE" | "PAYOUT" | "REFUND" | "REVERSAL" | "JOURNAL";

/** A customer payment in, or a payout to a customer, against one of our cash/bank accounts. */
export interface HlMoneyMove {
  customerId: string;
  amountPaise: number;
  method: "CASH" | "BANK";
  paymentAccountId: string;
  date: string;
  sourceId: string;
  actorRef: string;
  /** Our wording — HL's /payments and /customer-payouts take it as metadata.description. */
  description: string;
}

export interface HlClient {
  /** "off" = a non-demo project without HL_MODE=live: every call fails (NOT_CONNECTED). */
  readonly mode: "fake" | "live" | "off";
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
  /** Accounts by name/type (paged). */
  listAccounts(p: {type?: HlAccountType; search?: string; page: number; limit: number}): Promise<{data: HlAccount[]; hasMore: boolean}>;
  /** 409 (an account with that name exists) → HlError code ACCOUNT_EXISTS. */
  createAccount(p: {name: string; type: HlAccountType; isTaxAccount?: boolean}): Promise<HlAccount>;
  /** A raw double-entry transaction; idempotent on (appId, sourceId). Must balance. */
  postTransaction(p: {
    postingType: HlPostingType;
    description: string;
    date: string;
    sourceId: string;
    actorRef: string;
    legs: HlLeg[];
  }): Promise<{txnId: string; idempotent: boolean}>;
  /** DR our cash/bank, CR the customer — money received (no invoice yet). */
  postPayment(p: HlMoneyMove): Promise<{txnId: string; idempotent: boolean}>;
  /** DR the customer, CR our cash/bank — money paid to a party we owe. */
  postPayout(p: HlMoneyMove): Promise<{txnId: string; idempotent: boolean}>;
  /** Balance of every account on `date`, by account id (decimal strings). */
  getBalanceSheet(date: string): Promise<Record<string, string>>;
}

/** An HL failure. `transient` = worth retrying (network, 5xx, 429); else the data is wrong. */
export class HlError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly transient: boolean,
    /** HL's error code when it gives one (e.g. CUSTOMER_HAS_BALANCE), or NOT_CONNECTED. */
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "HlError";
  }
}

export const isNotFound = (e: unknown) => e instanceof HlError && e.status === 404;
export const isNotConnected = (e: unknown) => e instanceof HlError && e.code === "NOT_CONNECTED";
/** HL refuses to archive a customer who still has a balance (422 CUSTOMER_HAS_BALANCE). */
export const hasBalanceError = (e: unknown) => e instanceof HlError && e.code === "CUSTOMER_HAS_BALANCE";

/** A non-demo project with HL not switched on yet: fails every call, loudly and permanently. */
export class NotConnectedHlClient implements HlClient {
  readonly mode = "off" as const;
  private async fail(): Promise<never> {
    throw new HlError("The books (Humble Ledger) aren't connected yet.", 503, false, "NOT_CONNECTED");
  }
  createCustomer = () => this.fail();
  updateCustomer = () => this.fail();
  archiveCustomer = () => this.fail();
  unarchiveCustomer = () => this.fail();
  postOpeningBalance = () => this.fail();
  listCustomers = () => this.fail();
  getCustomer = () => this.fail();
  getLedger = () => this.fail();
  listAccounts = () => this.fail();
  createAccount = () => this.fail();
  postTransaction = () => this.fail();
  postPayment = () => this.fail();
  postPayout = () => this.fail();
  getBalanceSheet = () => this.fail();
}

/**
 * A plain first line for people. Never the raw transport error — it can carry the bearer
 * token (brief §9b.6); the full error goes to the function log only.
 */
export function plainHlMessage(e: unknown): string {
  if (isNotConnected(e)) return "The books (Humble Ledger) aren't connected yet — nothing has been saved to them.";
  if (e instanceof HlError) {
    if (e.transient) return "The books (Humble Ledger) couldn't be reached. Try again in a minute.";
    return `The books refused it: ${e.message.split("\n")[0].slice(0, 200)}`;
  }
  return "Something went wrong talking to the books.";
}
