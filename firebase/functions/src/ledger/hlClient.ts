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
  /**
   * Live HL's /ledger rows carry NO sourceId (Ansh HL, 27 Oct 2026) — so a row is matched
   * to our records by its txnId (the hlTxnId / hlSaleTxnId / payment txn ids we store).
   */
  sourceId: string | null;
  /** SALE, PAYMENT, PAYOUT, JOURNAL, EXPENSE, REVERSAL… — the fallback label. */
  postingType: string | null;
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
  /** Our wording — sent as `description` (and metadata.description) to /payments and /customer-payouts. */
  description: string;
  /** /payments only: apply it to this invoice (HL then tracks the invoice's amountPaid). */
  invoiceId?: string | null;
  /** /customer-payouts only: pay against this supplier bill of the party (HL tracks its amountPaid). */
  billId?: string | null;
}

/** One GST leg of a sale (CGST 9 %, SGST 9 % or IGST 18 %), credited to an output-tax account. */
export interface HlSaleTaxLine {
  label: string;
  rateBp: number;
  accountId: string;
  amountPaise: number;
}

/** A sale as HL books it: DR the customer's receivable (amount + tax), CR revenue and the tax lines. */
export interface HlSale {
  customerId: string;
  /** Before tax; includes freight and the round-off, so HL's invoice total = our grand total. */
  amountPaise: number;
  taxLines: HlSaleTaxLine[];
  revenueAccountId: string;
  description: string;
  date: string;
  sourceId: string;
  actorRef: string;
  /** Our own financial-year number ("TF/2026-27/0001") — HL doesn't consume its own series. */
  invoiceNumber: string;
}

/**
 * A supplier's bill booked against the same HL customer (netting — no HL vendors):
 * DR the inventory account (subtotal) + DR each input-tax line, CR the customer (total).
 * Crediting the customer takes their balance down — below zero = we owe them.
 */
export interface HlPurchase {
  customerId: string;
  /** Before tax: goods + freight + round-off (so HL's total = the supplier's bill total). */
  amountPaise: number;
  /** One per GST leg (Input CGST / SGST / IGST), posted as DEBIT; empty for no GST. */
  taxLines: HlSaleTaxLine[];
  expenseAccountId: string;
  description: string;
  date: string;
  sourceId: string;
  actorRef: string;
  /**
   * The supplier's own bill number: HL also keeps the purchase as a supplier bill on the
   * party (bill-by-bill payables, carried forward one by one). Unique per party (409
   * DUPLICATE_BILL_NUMBER). Sent on every purchase (Ansh HL, 29 Nov 2026).
   */
  billNumber?: string;
  /** Our own reference (PB/2026-27/0001). */
  reference?: string;
  dueDate?: string;
}

export type HlInvoiceStatus = "PENDING" | "PARTIAL" | "PAID" | "CANCELLED" | "REFUNDED" | string;

export interface HlInvoice {
  id: string;
  invoiceNumber: string | null;
  status: HlInvoiceStatus;
  /** Decimal rupees, as HL sends them. */
  total: string;
  amountPaid: string;
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
  /** Books a sale and creates its invoice; idempotent on (appId, sourceId). */
  postSale(p: HlSale): Promise<{txnId: string; invoiceId: string; idempotent: boolean}>;
  getInvoice(id: string): Promise<HlInvoice>;
  /**
   * Cancels an invoice: HL posts the mirror of the sale and marks it CANCELLED. NOT
   * idempotent (no sourceId) — read the invoice first and skip one already cancelled.
   */
  cancelInvoice(id: string, p: {reason: string; date: string}): Promise<void>;
  /** Books a supplier's bill (POST /customer-purchases); idempotent on (appId, sourceId). `billId` when a billNumber was sent. */
  postCustomerPurchase(p: HlPurchase): Promise<{txnId: string; idempotent: boolean; billId: string | null}>;
  /** A party's open supplier bills (GET /customers/{id}/payable-credits → openBills). */
  getPayableBills(customerId: string): Promise<{id: string; billNumber: string | null; outstanding: string}[]>;
  /** Cancels a supplier bill: reverses its purchase, keeps the bill as CANCELLED. Idempotent. */
  cancelSupplierBill(id: string, p: {reason: string; date: string}): Promise<{txnId: string | null}>;

  // ─── Companies (HL multi-company, Ansh HL 28 Nov 2026) ───────────────────────
  // A client is scoped to ONE HL company (`hlCompanyId`; null = the login's home
  // company). Everything above posts into that company's books.

  /** The HL company this client posts into; null = the login's home company. */
  readonly hlCompanyId: string | null;
  /** The same kind of client, posting into another HL company (null = home). */
  forCompany(hlCompanyId: string | null): HlClient;
  /** Every company this login can open (GET /auth/companies). Not company-scoped. */
  listCompanies(): Promise<HlCompanySummary[]>;
  /**
   * POST /auth/companies. Idempotent on requestId (a retry returns the same company).
   * The copy source defaults to this client's company.
   */
  createCompany(p: HlCreateCompany): Promise<{company: HlCompanySummary; copied: HlCopied; idempotent: boolean}>;
  /** This client's company, with its entry count and dates (GET /company). */
  getCompany(): Promise<HlCompanyInfo>;
  /** PATCH /company — OWNER only in HL (our ACCOUNTANT login gets 403). */
  updateCompany(p: HlCompanyPatch): Promise<HlCompanyInfo>;
  /**
   * DELETE /auth/companies/{id} — for a company made by mistake: OWNER of it, called while
   * signed into ANOTHER company; refused for one with entries (409 COMPANY_HAS_ENTRIES), a
   * home company (409 HOME_COMPANY) or the one the token is in (409 SWITCH_AWAY_FIRST).
   */
  deleteCompany(hlCompanyId: string): Promise<void>;
  /** POST /company/archive | /unarchive — OWNER only in HL. */
  setCompanyArchived(archived: boolean): Promise<void>;
  /** The books lock: nothing dated on or before `lockedThrough` can be posted (GET /books-lock). */
  getBooksLock(): Promise<HlBooksLock>;
  /**
   * Moves the books lock later (PUT /books-lock) — "Close year". Reopening (an earlier
   * date) is OWNER only, so the app's ACCOUNTANT login gets 403. Not in the future.
   */
  setBooksLock(p: {lockedThrough: string}): Promise<HlBooksLock>;
  /** A customer's money on account and open bills (GET /customers/{id}/credits — bill matching). */
  getCustomerCredits(customerId: string): Promise<{availableCredit: string; openInvoices: {id: string; invoiceNumber: string | null; outstanding: string}[]}>;
  /**
   * Matches money already on a customer's account to their bills (POST
   * /customers/{id}/allocations, Tally "Agst Ref"). No ledger posting. All-or-nothing;
   * idempotent on (appId, sourceId).
   */
  allocateCustomerCredit(p: {customerId: string; sourceTransactionId: string; allocations: {invoiceId: string; amountPaise: number}[]; date: string; sourceId: string; actorRef: string; note?: string}): Promise<{batchId: string; idempotent: boolean}>;
  /** Group reports over 2–20 companies (GET /group/reports/…), a column per company. */
  getGroupReport(p: {kind: HlGroupReportKind; hlCompanyIds: string[]; from?: string; to?: string; date?: string}): Promise<HlGroupReport>;
}

export interface HlCompanySummary {
  id: string;
  name: string;
  currency: string | null;
  fyStartMonth: number | null;
  booksBeginFrom: string | null;
  lockedThrough: string | null;
  archived: boolean;
  /** This login's role in it (OWNER, ACCOUNTANT, …). */
  role: string | null;
  /** The login's home company (= our "main" company). */
  isHome: boolean;
}

export interface HlCompanyDetails {
  mailingName?: string;
  address?: string;
  state?: string;
  country?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  website?: string;
}

export interface HlCompanyInfo extends HlCompanySummary {
  details: HlCompanyDetails;
  transactionCount: number;
  firstEntryDate: string | null;
  lastEntryDate: string | null;
  carriedForwardAsOf: string | null;
}

export interface HlCompanyPatch {
  name?: string;
  details?: HlCompanyDetails;
  fyStartMonth?: number;
  booksBeginFrom?: string;
}

export type HlPendingBills = "ITEMIZED" | "TOTAL";

export interface HlCreateCompany {
  name: string;
  fyStartMonth?: number;
  booksBeginFrom?: string;
  details?: HlCompanyDetails;
  /** Our own uuid — a retry with the same one returns the same company. */
  requestId: string;
  /**
   * The creating login becomes OWNER of the NEW company (Ansh, 28 Nov 2026 — option B), so
   * the app can alter / archive it. Its role elsewhere is unchanged. The app never reopens
   * a closed year even so — only Ansh does.
   */
  creatorIsOwner?: boolean;
  copyFrom?: {
    /** HL company id; default = this client's company. */
    companyId?: string;
    accounts?: boolean;
    customers?: boolean;
    vendors?: boolean;
    members?: boolean;
    /** Carry forward: closing balances on asOf become openings on booksBeginFrom. */
    openingBalances?: {asOf: string; pendingBills: HlPendingBills};
  };
}

export interface HlCopied {
  accounts: number;
  customers: number;
  vendors: number;
  members: number;
  openingBalanceLines: number;
  pendingBills: number;
  pendingSupplierBills: number;
}

/** HL's books lock. `history` = the latest changes, newest first. */
export interface HlBooksLock {
  lockedThrough: string | null;
  history: {previousDate: string | null; newDate: string | null; changedByRole: string | null; reason: string | null; createdAt: string | null}[];
}

export type HlGroupReportKind = "pnl" | "balance-sheet" | "trial-balance";

/** Lines merged by account name across companies; amounts are HL's decimal strings. */
export interface HlGroupReport {
  sections: {key: string; lines: {name: string; total: string; byCompany: Record<string, string>}[]}[];
  /** Any top-level totals HL sends (e.g. netProfit), each with its byCompany split if given. */
  totals: {key: string; total: string; byCompany: Record<string, string>}[];
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
/**
 * Refusals that retrying can never fix — show them, never queue them (Ansh HL guide §5):
 * a closed year, a date before the company's books begin, an archived company, or a
 * login that lost access to the company.
 */
export const PERMANENT_COMPANY_CODES = ["BOOKS_LOCKED", "BEFORE_BOOKS_BEGIN", "COMPANY_ARCHIVED", "COMPANY_ACCESS_REVOKED"] as const;
export const isPermanentCompanyRefusal = (e: unknown) => e instanceof HlError && (PERMANENT_COMPANY_CODES as readonly string[]).includes(e.code ?? "");
/** HL refuses to archive a customer who still has a balance (422 CUSTOMER_HAS_BALANCE). */
export const hasBalanceError = (e: unknown) => e instanceof HlError && e.code === "CUSTOMER_HAS_BALANCE";

/** A non-demo project with HL not switched on yet: fails every call, loudly and permanently. */
export class NotConnectedHlClient implements HlClient {
  readonly mode = "off" as const;
  constructor(readonly hlCompanyId: string | null = null) {}
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
  postSale = () => this.fail();
  getInvoice = () => this.fail();
  cancelInvoice = () => this.fail();
  postCustomerPurchase = () => this.fail();
  listCompanies = () => this.fail();
  createCompany = () => this.fail();
  getCompany = () => this.fail();
  updateCompany = () => this.fail();
  setCompanyArchived = () => this.fail();
  deleteCompany = () => this.fail();
  getBooksLock = () => this.fail();
  setBooksLock = () => this.fail();
  getGroupReport = () => this.fail();
  getCustomerCredits = () => this.fail();
  getPayableBills = () => this.fail();
  cancelSupplierBill = () => this.fail();
  allocateCustomerCredit = () => this.fail();
  forCompany = (hlCompanyId: string | null) => new NotConnectedHlClient(hlCompanyId);
}

/**
 * A plain first line for people. Never the raw transport error — it can carry the bearer
 * token (brief §9b.6); the full error goes to the function log only.
 */
export function plainHlMessage(e: unknown): string {
  if (isNotConnected(e)) return "The books (Humble Ledger) aren't connected yet — nothing has been saved to them.";
  if (e instanceof HlError) {
    const known: Record<string, string> = {
      BOOKS_LOCKED: "That date is in a closed year — the books refused it. Use a date after the year was closed.",
      BEFORE_BOOKS_BEGIN: "That date is before this company's books begin.",
      COMPANY_ARCHIVED: "This company is archived (read-only) — nothing can be added to it.",
      COMPANY_ACCESS_REVOKED: "The app no longer has access to this company in Humble Ledger. Ask the owner to give it back.",
    };
    if (e.code && known[e.code]) return known[e.code];
    if (e.transient) return "The books (Humble Ledger) couldn't be reached. Try again in a minute.";
    return `The books refused it: ${e.message.split("\n")[0].slice(0, 200)}`;
  }
  return "Something went wrong talking to the books.";
}
