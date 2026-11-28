import * as admin from "firebase-admin";

import {
  HL_APP_ID,
  HL_MAX_PAGE,
  HlError,
  type HlAccount,
  type HlAccountType,
  type HlBooksLock,
  type HlClient,
  type HlCompanyInfo,
  type HlCompanyPatch,
  type HlCompanySummary,
  type HlCopied,
  type HlCreateCompany,
  type HlGroupReport,
  type HlGroupReportKind,
  type HlCustomer,
  type HlInvoice,
  type HlLedgerRow,
  type HlLeg,
  type HlMoneyMove,
  type HlPostingType,
  type HlProfilePayload,
  type HlPurchase,
  type HlSale,
} from "./hlClient";

/**
 * A stand-in for Humble Ledger, used ONLY on demo- projects (the emulators): a real
 * little double-entry ledger kept in Firestore under _fakeHl/*, so balances and
 * statements are real. It behaves like HL where it matters:
 *  - idempotent on externalId (customers) and on (appId, sourceId) (every posting —
 *    the transaction doc id is derived from them, so even racing retries post once);
 *  - every transaction must balance (more than a paisa off is refused) and may only use
 *    existing, active accounts (400 ACCOUNT_NOT_FOUND / 422 ACCOUNT_ARCHIVED);
 *  - accounts are unique by name (409 ACCOUNT_EXISTS);
 *  - each customer has its own receivable account: + they owe us, − we owe them;
 *  - 404 for unknown ids; archive refuses a non-zero balance (422 CUSTOMER_HAS_BALANCE);
 *    pages > 100 are a 400;
 *  - customers look like HL's ({…, isActive, outstanding}); amounts are decimal strings;
 *  - a sale creates an invoice (DR receivable, CR revenue + each tax line); a payment
 *    with an invoiceId raises its amountPaid and is refused past the total (422
 *    OVERPAYMENT) or on a cancelled invoice (422 INVOICE_CANCELLED); cancelling posts the
 *    mirror of the sale (never before the invoice date) and refuses a second cancel.
 * Test hook: _fakeHl/control {failNext: n} fails the next n calls with a 503;
 * {down: true} fails every call (to try the "books unreachable" screens);
 * {omitBalance: true} returns only `outstanding` (as HL does), not `balance` as well.
 * Every call is logged in _fakeHl/books/log {op, key}. Rules deny all client access.
 *
 * Companies (HL multi-company): the home company's books stay at _fakeHl/books/*; every
 * other company has its own at _fakeHl/books-<hlCompanyId>/*. The company list lives in
 * _fakeHl/registry/companies/{id}. Like HL, posting is refused before booksBeginFrom (409
 * BEFORE_BOOKS_BEGIN), inside the books lock (409 BOOKS_LOCKED) and in an archived company
 * (409 COMPANY_ARCHIVED); creating a company copies accounts/customers and can carry the
 * closing balances forward (the source must be locked through asOf: 409 SOURCE_NOT_LOCKED).
 * Our login is an ACCOUNTANT, so alter/archive/reopen are 403 — unless _fakeHl/control
 * {owner: true} (test switch) makes it act as an OWNER.
 */
export const FAKE_HOME_COMPANY_ID = "hl-home";
const REGISTRY = "_fakeHl/registry/companies";
const REQUESTS = "_fakeHl/registry/requests";
const RETAINED = "Retained Earnings";

interface StoredCompany {
  name: string;
  currency: string;
  fyStartMonth: number;
  booksBeginFrom: string | null;
  lockedThrough: string | null;
  lockHistory: HlBooksLock["history"];
  archived: boolean;
  details: Record<string, string>;
  /** The company it was carried forward from, and as of which day. */
  carriedFrom: {companyId: string; asOf: string} | null;
  /** Our login's role in it: ACCOUNTANT (home, or made without creatorIsOwner) or OWNER. */
  appRole?: "OWNER" | "ACCOUNTANT";
  createdAt: number;
}

const ROOT = "_fakeHl";
const toAmount = (paise: number) => {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
};
const EQUITY_OPENING = "Opening Balance Equity";

interface StoredCustomer {
  externalId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  accountId: string;
  archived: boolean;
}
interface StoredAccount {
  name: string;
  nameLower: string;
  type: HlAccountType;
  isTaxAccount: boolean;
  isActive: boolean;
}
interface StoredInvoice {
  invoiceNumber: string;
  customerId: string;
  saleTxnId: string;
  issueDate: string;
  totalPaise: number;
  amountPaidPaise: number;
  status: "PENDING" | "PARTIAL" | "PAID" | "CANCELLED";
}
interface StoredBill {
  customerId: string;
  billNumber: string;
  reference: string | null;
  billDate: string;
  totalPaise: number;
  amountPaidPaise: number;
  status: "OPEN" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
  purchaseTxnId: string;
}
interface StoredTxn {
  appId: string;
  sourceId: string;
  postingType: HlPostingType;
  date: string;
  description: string;
  legs: HlLeg[];
  /** For "transactions touching this account" queries. */
  accountIds: string[];
  actorRef: string;
  seq: number;
}

export class FakeHlClient implements HlClient {
  readonly mode = "fake" as const;
  private readonly books: string;
  constructor(private readonly db: admin.firestore.Firestore, readonly hlCompanyId: string | null = null) {
    this.books = hlCompanyId && hlCompanyId !== FAKE_HOME_COMPANY_ID ? `${ROOT}/books-${hlCompanyId}` : `${ROOT}/books`;
  }
  forCompany(hlCompanyId: string | null): HlClient {
    return new FakeHlClient(this.db, hlCompanyId);
  }

  /** This client's company id in the registry. */
  private get companyId() {
    return this.hlCompanyId ?? FAKE_HOME_COMPANY_ID;
  }

  private customers() {
    return this.db.collection(`${this.books}/customers`);
  }
  private accounts() {
    return this.db.collection(`${this.books}/accounts`);
  }
  private txns() {
    return this.db.collection(`${this.books}/txns`);
  }
  private invoices() {
    return this.db.collection(`${this.books}/invoices`);
  }
  private bills() {
    return this.db.collection(`${this.books}/bills`);
  }
  private txnRef(sourceId: string) {
    return this.txns().doc(`${HL_APP_ID}~${sourceId}`.replace(/\//g, "_"));
  }

  /** Every call goes through here first: the test hooks and the call log. */
  private async gate(op: string, key: string): Promise<{omitBalance: boolean}> {
    const ref = this.db.doc(`${ROOT}/control`);
    await this.db.collection(`${this.books}/log`).add({op, key, at: Date.now()});
    return this.db.runTransaction(async (tx) => {
      const c = (await tx.get(ref)).data() ?? {};
      if (c.down === true) throw new HlError("Fake HL is down (test switch).", 503, true);
      if (typeof c.failNext === "number" && c.failNext > 0) {
        tx.set(ref, {failNext: c.failNext - 1}, {merge: true});
        throw new HlError("Fake HL failed this call (failNext).", 503, true);
      }
      return {omitBalance: c.omitBalance === true};
    });
  }

  /** Σ debits − Σ credits on an account (up to `asOf` if given). */
  private async balanceOf(accountId: string, asOf?: string): Promise<number> {
    const snap = await this.txns().where("accountIds", "array-contains", accountId).get();
    let sum = 0;
    for (const d of snap.docs) {
      const t = d.data() as StoredTxn;
      if (asOf && t.date > asOf) continue;
      for (const l of t.legs) if (l.accountId === accountId) sum += l.type === "DEBIT" ? l.amountPaise : -l.amountPaise;
    }
    return sum;
  }

  private async view(id: string, c: StoredCustomer, omitBalance: boolean): Promise<HlCustomer> {
    const bal = toAmount(await this.balanceOf(c.accountId));
    return {
      id,
      accountId: c.accountId,
      externalId: c.externalId,
      name: c.name,
      isActive: !c.archived,
      ...(omitBalance ? {outstanding: bal} : {balance: bal, outstanding: bal}),
    };
  }

  private async load(id: string): Promise<StoredCustomer> {
    const snap = await this.customers().doc(id).get();
    if (!snap.exists) throw new HlError(`Customer ${id} not found`, 404, false);
    return snap.data() as StoredCustomer;
  }

  private static clean(p: HlProfilePayload) {
    for (const [k, v] of Object.entries(p)) {
      if (v === "") throw new HlError(`${k} must not be empty`, 400, false); // like HL: omit blanks
    }
    if (!p.name?.trim()) throw new HlError("name is required", 400, false);
    return {name: p.name, phone: p.phone ?? null, email: p.email ?? null, gstin: p.gstin ?? null};
  }

  /** Our own system account, made on first use (like HL's chart of accounts). */
  private async systemAccount(name: string, type: HlAccountType): Promise<string> {
    const found = await this.accounts().where("nameLower", "==", name.toLowerCase()).limit(1).get();
    if (!found.empty) return found.docs[0].id;
    const ref = this.accounts().doc();
    await ref.set({name, nameLower: name.toLowerCase(), type, isTaxAccount: false, isActive: true} satisfies StoredAccount);
    return ref.id;
  }

  /** Posts a balanced transaction once per (appId, sourceId). */
  private async post(t: Omit<StoredTxn, "accountIds" | "seq" | "appId">): Promise<{txnId: string; idempotent: boolean}> {
    if (!t.sourceId || !t.date) throw new HlError("sourceId and date are required", 400, false);
    const replay = await this.txnRef(t.sourceId).get();
    if (replay.exists) return {txnId: replay.id, idempotent: true};
    const co = await this.company();
    if (co.archived) throw new HlError("This company is archived", 409, false, "COMPANY_ARCHIVED");
    if (co.booksBeginFrom && t.date < co.booksBeginFrom) throw new HlError(`Books begin on ${co.booksBeginFrom}`, 409, false, "BEFORE_BOOKS_BEGIN");
    if (co.lockedThrough && t.date <= co.lockedThrough) throw new HlError(`Books are locked through ${co.lockedThrough}`, 409, false, "BOOKS_LOCKED");
    if (t.legs.length < 2) throw new HlError("A transaction needs at least two entries", 400, false);
    let debit = 0;
    let credit = 0;
    for (const l of t.legs) {
      if (!Number.isInteger(l.amountPaise) || l.amountPaise <= 0) throw new HlError("Entry amounts must be above 0", 400, false);
      if (l.type === "DEBIT") debit += l.amountPaise;
      else credit += l.amountPaise;
    }
    if (Math.abs(debit - credit) > 1) throw new HlError(`Unbalanced: debits ${toAmount(debit)} ≠ credits ${toAmount(credit)}`, 422, false, "ACCOUNTING_RULE_VIOLATION");
    const ids = [...new Set(t.legs.map((l) => l.accountId))];
    for (const id of ids) {
      const a = (await this.accounts().doc(id).get()).data() as StoredAccount | undefined;
      if (!a) throw new HlError(`Account ${id} not found`, 400, false, "ACCOUNT_NOT_FOUND");
      if (!a.isActive) throw new HlError(`Account ${a.name} is archived`, 422, false, "ACCOUNT_ARCHIVED");
    }
    const ref = this.txnRef(t.sourceId);
    try {
      await ref.create({...t, appId: HL_APP_ID, accountIds: ids, seq: Date.now()} satisfies StoredTxn);
      return {txnId: ref.id, idempotent: false};
    } catch (e) {
      if ((e as {code?: number}).code === 6) return {txnId: ref.id, idempotent: true}; // ALREADY_EXISTS
      throw e;
    }
  }

  // ─── Customers ───────────────────────────────────────────────────────────────

  async createCustomer(p: HlProfilePayload & {externalId: string}) {
    const {omitBalance} = await this.gate("createCustomer", p.externalId);
    const fields = FakeHlClient.clean(p);
    const existing = await this.customers().where("externalId", "==", p.externalId).limit(1).get();
    if (!existing.empty) {
      const d = existing.docs[0];
      return {customer: await this.view(d.id, d.data() as StoredCustomer, omitBalance), idempotent: true};
    }
    const ref = this.customers().doc();
    const accountId = `acc_${ref.id}`;
    await this.accounts().doc(accountId).set({
      name: `Receivable · ${fields.name} · ${ref.id}`,
      nameLower: `receivable · ${fields.name} · ${ref.id}`.toLowerCase(),
      type: "ASSET",
      isTaxAccount: false,
      isActive: true,
    } satisfies StoredAccount);
    const stored: StoredCustomer = {...fields, externalId: p.externalId, accountId, archived: false};
    await ref.set(stored);
    return {customer: await this.view(ref.id, stored, omitBalance), idempotent: false};
  }

  async updateCustomer(id: string, p: HlProfilePayload) {
    const {omitBalance} = await this.gate("updateCustomer", id);
    const c = await this.load(id);
    const next = {...c, ...FakeHlClient.clean(p)};
    await this.customers().doc(id).set(next);
    return this.view(id, next, omitBalance);
  }

  async archiveCustomer(id: string) {
    await this.gate("archiveCustomer", id);
    const c = await this.load(id);
    const bal = await this.balanceOf(c.accountId);
    if (bal !== 0) throw new HlError(`Customer has a non-zero balance (${toAmount(bal)})`, 422, false, "CUSTOMER_HAS_BALANCE");
    await this.customers().doc(id).set({archived: true}, {merge: true});
  }

  async unarchiveCustomer(id: string) {
    await this.gate("unarchiveCustomer", id);
    await this.load(id);
    await this.customers().doc(id).set({archived: false}, {merge: true});
  }

  async postOpeningBalance(
    customerId: string,
    p: {amountPaise: number; direction: "RECEIVABLE" | "PAYABLE"; date: string; sourceId: string; actorRef: string},
  ) {
    await this.gate("postOpeningBalance", customerId);
    const c = await this.load(customerId);
    const equity = await this.systemAccount(EQUITY_OPENING, "EQUITY");
    const receivable = p.direction === "RECEIVABLE";
    return this.post({
      postingType: "JOURNAL",
      sourceId: p.sourceId,
      date: p.date,
      description: "Opening balance",
      actorRef: p.actorRef,
      legs: [
        {accountId: c.accountId, type: receivable ? "DEBIT" : "CREDIT", amountPaise: p.amountPaise},
        {accountId: equity, type: receivable ? "CREDIT" : "DEBIT", amountPaise: p.amountPaise},
      ],
    });
  }

  async listCustomers(p: {page: number; limit: number}) {
    const {omitBalance} = await this.gate("listCustomers", "");
    if (p.limit > HL_MAX_PAGE) throw new HlError(`limit must be at most ${HL_MAX_PAGE}`, 400, false);
    const all = (await this.customers().get()).docs.sort((a, b) => a.id.localeCompare(b.id));
    const page = all.slice((p.page - 1) * p.limit, p.page * p.limit);
    const data = await Promise.all(page.map((d) => this.view(d.id, d.data() as StoredCustomer, omitBalance)));
    return {data, hasMore: p.page * p.limit < all.length};
  }

  async getCustomer(id: string) {
    const {omitBalance} = await this.gate("getCustomer", id);
    return this.view(id, await this.load(id), omitBalance);
  }

  // ─── Ledger & reports ─────────────────────────────────────────────────────────

  async getLedger(p: {accountId: string; from: string; to: string; page: number; limit: number}) {
    await this.gate("getLedger", p.accountId);
    if (p.limit > HL_MAX_PAGE) throw new HlError(`limit must be at most ${HL_MAX_PAGE}`, 400, false);
    if (!(await this.accounts().doc(p.accountId).get()).exists) throw new HlError(`Account ${p.accountId} not found`, 404, false);
    const all = (await this.txns().where("accountIds", "array-contains", p.accountId).get()).docs
      .map((d) => ({id: d.id, ...(d.data() as StoredTxn)}))
      .sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq);
    const net = (t: StoredTxn) => t.legs.filter((l) => l.accountId === p.accountId).reduce((s, l) => s + (l.type === "DEBIT" ? l.amountPaise : -l.amountPaise), 0);
    let running = all.filter((t) => t.date < p.from).reduce((s, t) => s + net(t), 0);
    const openingBalance = toAmount(running);
    const rows: HlLedgerRow[] = all
      .filter((t) => t.date >= p.from && t.date <= p.to)
      .map((t) => {
        const amount = net(t);
        running += amount;
        return {
          txnId: t.id,
          date: t.date,
          description: t.description,
          sourceId: null, // like live HL: ledger rows don't say which sourceId they came from
          postingType: t.postingType,
          debit: toAmount(Math.max(amount, 0)),
          credit: toAmount(Math.max(-amount, 0)),
          balance: toAmount(running),
        };
      });
    const page = rows.slice((p.page - 1) * p.limit, p.page * p.limit);
    return {openingBalance, rows: page, hasMore: p.page * p.limit < rows.length};
  }

  async getBalanceSheet(date: string) {
    await this.gate("getBalanceSheet", date);
    const accounts = await this.accounts().get();
    const out: Record<string, string> = {};
    for (const a of accounts.docs) out[a.id] = toAmount(await this.balanceOf(a.id, date));
    return out;
  }

  // ─── Accounts & postings ──────────────────────────────────────────────────────

  async listAccounts(p: {type?: HlAccountType; search?: string; page: number; limit: number}) {
    await this.gate("listAccounts", p.search ?? "");
    if (p.limit > HL_MAX_PAGE) throw new HlError(`limit must be at most ${HL_MAX_PAGE}`, 400, false);
    const all = (await this.accounts().get()).docs
      .map((d) => ({id: d.id, ...(d.data() as StoredAccount)}))
      .filter((a) => (!p.type || a.type === p.type) && (!p.search || a.nameLower.includes(p.search.toLowerCase())))
      .sort((a, b) => a.id.localeCompare(b.id));
    const page = all.slice((p.page - 1) * p.limit, p.page * p.limit);
    return {
      data: page.map((a): HlAccount => ({id: a.id, name: a.name, type: a.type, isActive: a.isActive, isTaxAccount: a.isTaxAccount})),
      hasMore: p.page * p.limit < all.length,
    };
  }

  async createAccount(p: {name: string; type: HlAccountType; isTaxAccount?: boolean}) {
    await this.gate("createAccount", p.name);
    const nameLower = p.name.trim().toLowerCase();
    if (!nameLower) throw new HlError("name is required", 400, false);
    const dup = await this.accounts().where("nameLower", "==", nameLower).limit(1).get();
    if (!dup.empty) throw new HlError("Account name already exists in this company", 409, false, "ACCOUNT_EXISTS");
    const ref = this.accounts().doc();
    const a: StoredAccount = {name: p.name.trim(), nameLower, type: p.type, isTaxAccount: p.isTaxAccount === true, isActive: true};
    await ref.set(a);
    return {id: ref.id, name: a.name, type: a.type, isActive: true, isTaxAccount: a.isTaxAccount};
  }

  async postTransaction(p: {postingType: HlPostingType; description: string; date: string; sourceId: string; actorRef: string; legs: HlLeg[]}) {
    await this.gate("postTransaction", p.sourceId);
    if (!p.description?.trim()) throw new HlError("description is required", 400, false);
    return this.post(p);
  }

  private async move(kind: "PAYMENT" | "PAYOUT", p: HlMoneyMove) {
    await this.gate(kind === "PAYMENT" ? "postPayment" : "postPayout", p.sourceId);
    const c = await this.load(p.customerId);
    const into = kind === "PAYMENT";
    if (into && p.invoiceId) {
      // A replay is answered before the invoice is touched again.
      if ((await this.txnRef(p.sourceId).get()).exists) return {txnId: this.txnRef(p.sourceId).id, idempotent: true};
      const invRef = this.invoices().doc(p.invoiceId);
      const inv = (await invRef.get()).data() as StoredInvoice | undefined;
      if (!inv) throw new HlError(`Invoice ${p.invoiceId} not found`, 404, false);
      if (inv.customerId !== p.customerId) throw new HlError("That invoice belongs to another customer", 422, false, "INVOICE_CUSTOMER_MISMATCH");
      if (inv.status === "CANCELLED") throw new HlError("That invoice is cancelled", 422, false, "INVOICE_CANCELLED");
      const paid = inv.amountPaidPaise + p.amountPaise;
      if (paid > inv.totalPaise) throw new HlError(`Over-payment: ${toAmount(p.amountPaise)} > outstanding ${toAmount(inv.totalPaise - inv.amountPaidPaise)}`, 422, false, "OVERPAYMENT");
      const r = await this.post({
        postingType: "PAYMENT",
        sourceId: p.sourceId,
        date: p.date,
        description: p.description || "Payment received",
        actorRef: p.actorRef,
        legs: [
          {accountId: p.paymentAccountId, type: "DEBIT", amountPaise: p.amountPaise},
          {accountId: c.accountId, type: "CREDIT", amountPaise: p.amountPaise},
        ],
      });
      if (!r.idempotent) await invRef.set({amountPaidPaise: paid, status: paid >= inv.totalPaise ? "PAID" : "PARTIAL"}, {merge: true});
      return r;
    }
    if (!into && p.billId) {
      if ((await this.txnRef(p.sourceId).get()).exists) return {txnId: this.txnRef(p.sourceId).id, idempotent: true};
      const billRef = this.bills().doc(p.billId);
      const bill = (await billRef.get()).data() as StoredBill | undefined;
      if (!bill) throw new HlError(`Bill ${p.billId} not found`, 404, false);
      if (bill.customerId !== p.customerId) throw new HlError("That bill belongs to another party", 422, false, "BILL_VENDOR_MISMATCH");
      if (bill.status === "CANCELLED") throw new HlError("That bill is cancelled", 422, false, "BILL_CANCELLED");
      const paid = bill.amountPaidPaise + p.amountPaise;
      if (paid > bill.totalPaise) throw new HlError("More than the bill still owes", 422, false, "OVERPAYMENT");
      const r = await this.post({
        postingType: "PAYOUT", sourceId: p.sourceId, date: p.date, description: p.description || "Payment made", actorRef: p.actorRef,
        legs: [
          {accountId: p.paymentAccountId, type: "CREDIT", amountPaise: p.amountPaise},
          {accountId: c.accountId, type: "DEBIT", amountPaise: p.amountPaise},
        ],
      });
      if (!r.idempotent) await billRef.set({amountPaidPaise: paid, status: paid >= bill.totalPaise ? "PAID" : "PARTIALLY_PAID"}, {merge: true});
      return r;
    }
    return this.post({
      postingType: kind,
      sourceId: p.sourceId,
      date: p.date,
      description: p.description || (into ? "Payment received" : "Payment made"),
      actorRef: p.actorRef,
      legs: [
        {accountId: p.paymentAccountId, type: into ? "DEBIT" : "CREDIT", amountPaise: p.amountPaise},
        {accountId: c.accountId, type: into ? "CREDIT" : "DEBIT", amountPaise: p.amountPaise},
      ],
    });
  }

  postPayment(p: HlMoneyMove) {
    return this.move("PAYMENT", p);
  }

  postPayout(p: HlMoneyMove) {
    return this.move("PAYOUT", p);
  }

  // ─── Sales & invoices ─────────────────────────────────────────────────────────

  async postSale(p: HlSale) {
    await this.gate("postSale", p.sourceId);
    const c = await this.load(p.customerId);
    if (!p.invoiceNumber) throw new HlError("invoiceNumber is required here", 400, false);
    const tax = p.taxLines.reduce((s, l) => s + l.amountPaise, 0);
    const total = p.amountPaise + tax;
    const legs: HlLeg[] = [
      {accountId: c.accountId, type: "DEBIT", amountPaise: total},
      {accountId: p.revenueAccountId, type: "CREDIT", amountPaise: p.amountPaise},
      ...p.taxLines.filter((l) => l.amountPaise > 0).map((l): HlLeg => ({accountId: l.accountId, type: "CREDIT", amountPaise: l.amountPaise})),
    ];
    const r = await this.post({postingType: "SALE", sourceId: p.sourceId, date: p.date, description: p.description, actorRef: p.actorRef, legs});
    const invRef = this.invoices().doc(`inv_${r.txnId}`);
    if (!r.idempotent || !(await invRef.get()).exists) {
      await invRef.set({
        invoiceNumber: p.invoiceNumber,
        customerId: p.customerId,
        saleTxnId: r.txnId,
        issueDate: p.date,
        totalPaise: total,
        amountPaidPaise: 0,
        status: "PENDING",
      } satisfies StoredInvoice);
    }
    return {txnId: r.txnId, invoiceId: invRef.id, idempotent: r.idempotent};
  }

  // ─── Purchases (a supplier's bill against the same customer — netting) ─────────

  async postCustomerPurchase(p: HlPurchase) {
    await this.gate("postCustomerPurchase", p.sourceId);
    const c = await this.load(p.customerId);
    if (!p.description?.trim()) throw new HlError("description is required", 400, false);
    if (!p.expenseAccountId) throw new HlError("expenseAccountId is required", 400, false);
    if (p.taxLines.length > 4) throw new HlError("At most 4 tax lines", 400, false);
    const tax = p.taxLines.reduce((s, l) => s + l.amountPaise, 0);
    const legs: HlLeg[] = [
      {accountId: p.expenseAccountId, type: "DEBIT", amountPaise: p.amountPaise},
      ...p.taxLines.filter((l) => l.amountPaise > 0).map((l): HlLeg => ({accountId: l.accountId, type: "DEBIT", amountPaise: l.amountPaise})),
      {accountId: c.accountId, type: "CREDIT", amountPaise: p.amountPaise + tax},
    ];
    const replay = await this.txnRef(p.sourceId).get();
    if (replay.exists) {
      const b = await this.bills().doc(`bill_${replay.id}`).get();
      return {txnId: replay.id, idempotent: true, billId: b.exists ? b.id : null};
    }
    if (p.billNumber) {
      const dup = await this.bills().where("customerId", "==", p.customerId).where("billNumber", "==", p.billNumber).limit(1).get();
      if (!dup.empty) throw new HlError(`Bill number ${p.billNumber} already exists for this party`, 409, false, "DUPLICATE_BILL_NUMBER");
    }
    const r = await this.post({postingType: "PURCHASE", sourceId: p.sourceId, date: p.date, description: p.description, actorRef: p.actorRef, legs});
    let billId: string | null = null;
    if (p.billNumber) {
      const ref = this.bills().doc(`bill_${r.txnId}`);
      await ref.set({customerId: p.customerId, billNumber: p.billNumber, reference: p.reference ?? null, billDate: p.date, totalPaise: p.amountPaise + tax, amountPaidPaise: 0, status: "OPEN", purchaseTxnId: r.txnId} satisfies StoredBill);
      billId = ref.id;
    }
    return {...r, billId};
  }

  async getPayableBills(customerId: string) {
    await this.gate("getPayableBills", customerId);
    await this.load(customerId);
    return (await this.bills().where("customerId", "==", customerId).get()).docs
      .map((d) => ({id: d.id, ...(d.data() as StoredBill)}))
      .filter((b) => b.status !== "CANCELLED" && b.totalPaise > b.amountPaidPaise)
      .map((b) => ({id: b.id, billNumber: b.billNumber, outstanding: toAmount(b.totalPaise - b.amountPaidPaise)}));
  }

  async cancelSupplierBill(id: string, p: {reason: string; date: string}) {
    await this.gate("cancelSupplierBill", id);
    const ref = this.bills().doc(id);
    const b = (await ref.get()).data() as StoredBill | undefined;
    if (!b) throw new HlError(`Bill ${id} not found`, 404, false);
    if (b.status === "CANCELLED") return {txnId: (await this.txnRef(`billcancel_${id}`).get()).exists ? this.txnRef(`billcancel_${id}`).id : null};
    const txn = (await this.txns().doc(b.purchaseTxnId).get()).data() as StoredTxn | undefined;
    let txnId: string | null = null;
    if (txn) {
      txnId = (await this.post({
        postingType: "REVERSAL", sourceId: `billcancel_${id}`, date: p.date < b.billDate ? b.billDate : p.date,
        description: `Cancelled bill ${b.billNumber}: ${p.reason}`, actorRef: "hl",
        legs: txn.legs.map((l) => ({...l, type: l.type === "DEBIT" ? "CREDIT" : "DEBIT"})),
      })).txnId;
    }
    await ref.set({status: "CANCELLED"}, {merge: true});
    return {txnId};
  }

  async getInvoice(id: string): Promise<HlInvoice> {
    await this.gate("getInvoice", id);
    const inv = (await this.invoices().doc(id).get()).data() as StoredInvoice | undefined;
    if (!inv) throw new HlError(`Invoice ${id} not found`, 404, false);
    return {id, invoiceNumber: inv.invoiceNumber, status: inv.status, total: toAmount(inv.totalPaise), amountPaid: toAmount(inv.amountPaidPaise)};
  }

  async cancelInvoice(id: string, p: {reason: string; date: string}) {
    await this.gate("cancelInvoice", id);
    if (!p.reason?.trim()) throw new HlError("reason is required", 400, false);
    const invRef = this.invoices().doc(id);
    const inv = (await invRef.get()).data() as StoredInvoice | undefined;
    if (!inv) throw new HlError(`Invoice ${id} not found`, 404, false);
    if (inv.status === "CANCELLED") throw new HlError("Invoice is already cancelled", 422, false, "INVOICE_ALREADY_CANCELLED");
    if (p.date < inv.issueDate) throw new HlError("The cancellation can't be dated before the invoice", 400, false, "DATE_BEFORE_ORIGINAL");
    const sale = (await this.txns().doc(inv.saleTxnId).get()).data() as StoredTxn;
    await this.post({
      postingType: "REVERSAL",
      sourceId: `reversal_${inv.saleTxnId}`,
      date: p.date,
      description: `Cancelled ${inv.invoiceNumber}: ${p.reason}`,
      actorRef: "hl",
      legs: sale.legs.map((l) => ({...l, type: l.type === "DEBIT" ? "CREDIT" : "DEBIT"})),
    });
    await invRef.set({status: "CANCELLED"}, {merge: true});
  }

  // ─── Bill matching (customer side) ────────────────────────────────────────────

  async getCustomerCredits(customerId: string) {
    await this.gate("getCustomerCredits", customerId);
    const c = await this.load(customerId);
    const invoices = (await this.invoices().where("customerId", "==", customerId).get()).docs
      .map((d) => ({id: d.id, ...(d.data() as StoredInvoice)}))
      .filter((i) => i.status !== "CANCELLED" && i.totalPaise > i.amountPaidPaise);
    const owedByBills = invoices.reduce((s, i) => s + i.totalPaise - i.amountPaidPaise, 0);
    const balance = await this.balanceOf(c.accountId);
    return {
      availableCredit: toAmount(Math.max(owedByBills - balance, 0)),
      openInvoices: invoices.map((i) => ({id: i.id, invoiceNumber: i.invoiceNumber, outstanding: toAmount(i.totalPaise - i.amountPaidPaise)})),
    };
  }

  async allocateCustomerCredit(p: {customerId: string; sourceTransactionId: string; allocations: {invoiceId: string; amountPaise: number}[]; date: string; sourceId: string; actorRef: string; note?: string}) {
    await this.gate("allocateCustomerCredit", p.sourceId);
    const ref = this.db.collection(`${this.books}/allocations`).doc(`${HL_APP_ID}~${p.sourceId}`.replace(/\//g, "_"));
    if ((await ref.get()).exists) return {batchId: ref.id, idempotent: true};
    const src = (await this.txns().doc(p.sourceTransactionId).get()).data() as StoredTxn | undefined;
    const c = await this.load(p.customerId);
    const credit = src?.legs.filter((l) => l.accountId === c.accountId && l.type === "CREDIT").reduce((s, l) => s + l.amountPaise, 0) ?? 0;
    if (!credit) throw new HlError("That transaction puts no money on this customer's account", 422, false, "NOT_A_CREDIT");
    const total = p.allocations.reduce((s, a) => s + a.amountPaise, 0);
    if (total > credit) throw new HlError("More than that payment has left", 422, false, "EXCEEDS_PAYMENT");
    const updates: [admin.firestore.DocumentReference, number, number][] = [];
    for (const a of p.allocations) {
      const invRef = this.invoices().doc(a.invoiceId);
      const inv = (await invRef.get()).data() as StoredInvoice | undefined;
      if (!inv) throw new HlError(`Invoice ${a.invoiceId} not found`, 404, false);
      if (inv.customerId !== p.customerId) throw new HlError("That invoice belongs to another customer", 422, false, "INVOICE_CUSTOMER_MISMATCH");
      if (inv.status === "CANCELLED") throw new HlError("That invoice is cancelled", 422, false, "INVOICE_CANCELLED");
      if (inv.amountPaidPaise + a.amountPaise > inv.totalPaise) throw new HlError("More than the bill still owes", 422, false, "OVERPAYMENT");
      updates.push([invRef, inv.amountPaidPaise + a.amountPaise, inv.totalPaise]);
    }
    for (const [invRef, paid, totalPaise] of updates) await invRef.set({amountPaidPaise: paid, status: paid >= totalPaise ? "PAID" : "PARTIAL"}, {merge: true});
    await ref.set({customerId: p.customerId, sourceTransactionId: p.sourceTransactionId, allocations: p.allocations, date: p.date, at: Date.now()});
    return {batchId: ref.id, idempotent: false};
  }

  // ─── Companies ────────────────────────────────────────────────────────────────

  /** The registry entry of a company (the home one is made on first use). */
  private async companyOf(id: string): Promise<StoredCompany> {
    const ref = this.db.collection(REGISTRY).doc(id);
    const snap = await ref.get();
    if (snap.exists) return snap.data() as StoredCompany;
    if (id !== FAKE_HOME_COMPANY_ID) throw new HlError("You don't have access to that company", 403, false, "COMPANY_ACCESS_REVOKED");
    const home: StoredCompany = {
      name: "Technofluid Lubricants",
      currency: "INR",
      fyStartMonth: 4,
      booksBeginFrom: null,
      lockedThrough: null,
      lockHistory: [],
      archived: false,
      details: {},
      carriedFrom: null,
      createdAt: 0,
    };
    await ref.set(home);
    return home;
  }

  private company() {
    return this.companyOf(this.companyId);
  }

  private static summary(id: string, c: StoredCompany): HlCompanySummary {
    return {
      id,
      name: c.name,
      currency: c.currency,
      fyStartMonth: c.fyStartMonth,
      booksBeginFrom: c.booksBeginFrom,
      lockedThrough: c.lockedThrough,
      archived: c.archived,
      role: c.appRole ?? "ACCOUNTANT",
      isHome: id === FAKE_HOME_COMPANY_ID,
    };
  }

  private async asOwner(): Promise<void> {
    const c = (await this.db.doc(`${ROOT}/control`).get()).data() ?? {};
    if (c.owner === true || (await this.company()).appRole === "OWNER") return;
    throw new HlError("Only the company's OWNER can do this", 403, false, "FORBIDDEN");
  }

  async listCompanies() {
    await this.gate("listCompanies", "");
    await this.companyOf(FAKE_HOME_COMPANY_ID);
    const snap = await this.db.collection(REGISTRY).get();
    return snap.docs.map((d) => FakeHlClient.summary(d.id, d.data() as StoredCompany)).sort((a, b) => a.name.localeCompare(b.name));
  }

  async createCompany(p: HlCreateCompany): Promise<{company: HlCompanySummary; copied: HlCopied; idempotent: boolean}> {
    await this.gate("createCompany", p.requestId);
    if (!p.requestId) throw new HlError("requestId is required", 400, false);
    const name = p.name?.trim();
    if (!name) throw new HlError("name is required", 400, false);
    const zero: HlCopied = {accounts: 0, customers: 0, vendors: 0, members: 0, openingBalanceLines: 0, pendingBills: 0, pendingSupplierBills: 0};
    const reqRef = this.db.collection(REQUESTS).doc(p.requestId);
    const prior = (await reqRef.get()).data();
    if (prior) {
      return {company: FakeHlClient.summary(prior.companyId, await this.companyOf(prior.companyId)), copied: prior.copied as HlCopied, idempotent: true};
    }
    const carry = p.copyFrom?.openingBalances;
    const sourceId = p.copyFrom?.companyId ?? this.companyId;
    const source = p.copyFrom ? await this.companyOf(sourceId) : null;
    if (carry) {
      if (!p.booksBeginFrom) throw new HlError("booksBeginFrom is required to carry balances", 400, false, "BOOKS_BEGIN_REQUIRED");
      if (p.booksBeginFrom <= carry.asOf) throw new HlError("booksBeginFrom must be after asOf", 400, false, "BOOKS_BEGIN_NOT_AFTER_AS_OF");
      if (!source?.lockedThrough || source.lockedThrough < carry.asOf) throw new HlError("Close the source year first: its books must be locked through asOf", 409, false, "SOURCE_NOT_LOCKED");
    }
    const ref = this.db.collection(REGISTRY).doc();
    await ref.set({
      name,
      currency: "INR",
      fyStartMonth: p.fyStartMonth ?? 4,
      booksBeginFrom: p.booksBeginFrom ?? null,
      lockedThrough: null,
      lockHistory: [],
      archived: false,
      details: Object.fromEntries(Object.entries(p.details ?? {}).filter(([, v]) => typeof v === "string" && v)),
      carriedFrom: carry ? {companyId: sourceId, asOf: carry.asOf} : null,
      appRole: p.creatorIsOwner ? "OWNER" : "ACCOUNTANT",
      createdAt: Date.now(),
    } satisfies StoredCompany);
    const copied = {...zero};
    if (p.copyFrom && source) {
      const from = new FakeHlClient(this.db, sourceId);
      const to = new FakeHlClient(this.db, ref.id);
      const accountMap = new Map<string, string>();
      const customerMap = new Map<string, {id: string; accountId: string}>();
      const receivableMap = new Map<string, string>();
      const receivables = new Set<string>();
      const fromCustomers = await from.customers().get();
      fromCustomers.docs.forEach((d) => receivables.add((d.data() as StoredCustomer).accountId));
      if (p.copyFrom.accounts || carry) {
        for (const a of (await from.accounts().get()).docs) {
          if (receivables.has(a.id)) continue;
          const acc = a.data() as StoredAccount;
          const id = await to.systemAccount(acc.name, acc.type);
          accountMap.set(a.id, id);
          copied.accounts++;
        }
      }
      if (p.copyFrom.customers || carry) {
        for (const d of fromCustomers.docs) {
          const c = d.data() as StoredCustomer;
          const made = await to.createCustomer({name: c.name, externalId: c.externalId ?? `copied-${d.id}`, ...(c.phone ? {phone: c.phone} : {}), ...(c.email ? {email: c.email} : {}), ...(c.gstin ? {gstin: c.gstin} : {})});
          customerMap.set(d.id, {id: made.customer.id, accountId: made.customer.accountId});
          receivableMap.set(c.accountId, made.customer.accountId);
          copied.customers++;
        }
      }
      if (carry) {
        const legs: HlLeg[] = [];
        let profit = 0; // income + expense balances, debit-positive
        for (const a of (await from.accounts().get()).docs) {
          const acc = a.data() as StoredAccount;
          const bal = await from.balanceOf(a.id, carry.asOf);
          if (bal === 0) continue;
          if (acc.type === "INCOME" || acc.type === "EXPENSE") {
            profit += bal;
            continue;
          }
          const target = receivables.has(a.id) ? receivableMap.get(a.id) : accountMap.get(a.id);
          if (!target) continue;
          legs.push({accountId: target, type: bal > 0 ? "DEBIT" : "CREDIT", amountPaise: Math.abs(bal)});
        }
        if (profit !== 0) {
          const retained = await to.systemAccount(RETAINED, "EQUITY");
          legs.push({accountId: retained, type: profit > 0 ? "DEBIT" : "CREDIT", amountPaise: Math.abs(profit)});
        }
        if (legs.length >= 2) {
          await to.post({postingType: "JOURNAL", sourceId: `carry_${ref.id}`, date: p.booksBeginFrom as string, description: `Opening balances carried from ${source.name} (as of ${carry.asOf})`, actorRef: "hl", legs});
          copied.openingBalanceLines = legs.length;
        }
        if (carry.pendingBills === "ITEMIZED") {
          for (const inv of (await from.invoices().get()).docs) {
            const i = inv.data() as StoredInvoice;
            const owed = i.totalPaise - i.amountPaidPaise;
            const cust = customerMap.get(i.customerId);
            if (i.status === "CANCELLED" || owed <= 0 || i.issueDate > carry.asOf || !cust) continue;
            await to.invoices().doc(`carried_${inv.id}`).set({...i, customerId: cust.id, saleTxnId: `carry_${ref.id}`, totalPaise: owed, amountPaidPaise: 0, status: "PENDING"} satisfies StoredInvoice);
            copied.pendingBills++;
          }
          for (const bd of (await from.bills().get()).docs) {
            const b = bd.data() as StoredBill;
            const owed = b.totalPaise - b.amountPaidPaise;
            const cust = customerMap.get(b.customerId);
            if (b.status === "CANCELLED" || owed <= 0 || b.billDate > carry.asOf || !cust) continue;
            await to.bills().doc(`carried_${bd.id}`).set({...b, customerId: cust.id, purchaseTxnId: `carry_${ref.id}`, totalPaise: owed, amountPaidPaise: 0, status: "OPEN"} satisfies StoredBill);
            copied.pendingSupplierBills++;
          }
        }
      }
    }
    await reqRef.set({companyId: ref.id, copied});
    return {company: FakeHlClient.summary(ref.id, await this.companyOf(ref.id)), copied, idempotent: false};
  }

  async getCompany(): Promise<HlCompanyInfo> {
    await this.gate("getCompany", this.companyId);
    const c = await this.company();
    const txns = (await this.txns().get()).docs.map((d) => (d.data() as StoredTxn).date).sort();
    return {
      ...FakeHlClient.summary(this.companyId, c),
      details: c.details,
      transactionCount: txns.length,
      firstEntryDate: txns[0] ?? null,
      lastEntryDate: txns[txns.length - 1] ?? null,
      carriedForwardAsOf: c.carriedFrom?.asOf ?? null,
    };
  }

  async updateCompany(p: HlCompanyPatch) {
    await this.gate("updateCompany", this.companyId);
    await this.asOwner();
    const patch: Partial<StoredCompany> = {};
    if (p.name?.trim()) patch.name = p.name.trim();
    if (p.fyStartMonth) patch.fyStartMonth = p.fyStartMonth;
    if (p.booksBeginFrom) {
      const first = (await this.txns().get()).docs.map((d) => (d.data() as StoredTxn).date).sort()[0];
      if (first && first < p.booksBeginFrom) throw new HlError("There are entries before that date", 409, false, "ENTRIES_BEFORE_DATE");
      patch.booksBeginFrom = p.booksBeginFrom;
    }
    if (p.details) patch.details = Object.fromEntries(Object.entries(p.details).filter(([, v]) => typeof v === "string" && v));
    await this.db.collection(REGISTRY).doc(this.companyId).set(patch, {merge: true});
    return this.getCompany();
  }

  async deleteCompany(hlCompanyId: string) {
    await this.gate("deleteCompany", hlCompanyId);
    if (hlCompanyId === FAKE_HOME_COMPANY_ID) throw new HlError("A home company can't be deleted", 409, false, "HOME_COMPANY");
    if (hlCompanyId === this.companyId) throw new HlError("Switch to another company first", 409, false, "SWITCH_AWAY_FIRST");
    const c = await this.companyOf(hlCompanyId);
    const books = new FakeHlClient(this.db, hlCompanyId);
    if (!(await books.txns().limit(1).get()).empty) throw new HlError(`${c.name} has entries — archive it instead`, 409, false, "COMPANY_HAS_ENTRIES");
    if (c.appRole !== "OWNER" && (await this.db.doc(`${ROOT}/control`).get()).data()?.owner !== true) {
      throw new HlError("Only the company's OWNER can do this", 403, false, "FORBIDDEN");
    }
    await this.db.collection(REGISTRY).doc(hlCompanyId).delete();
  }

  async setCompanyArchived(archived: boolean) {
    await this.gate("setCompanyArchived", this.companyId);
    await this.asOwner();
    await this.company();
    await this.db.collection(REGISTRY).doc(this.companyId).set({archived}, {merge: true});
  }

  async getBooksLock(): Promise<HlBooksLock> {
    await this.gate("getBooksLock", this.companyId);
    const c = await this.company();
    return {lockedThrough: c.lockedThrough, history: c.lockHistory ?? []};
  }

  async setBooksLock(p: {lockedThrough: string}): Promise<HlBooksLock> {
    await this.gate("setBooksLock", p.lockedThrough);
    const c = await this.company();
    const today = new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Kolkata"}).format(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.lockedThrough)) throw new HlError("lockedThrough must be YYYY-MM-DD", 400, false);
    if (p.lockedThrough > today) throw new HlError("The lock date can't be in the future", 400, false, "LOCK_DATE_IN_FUTURE");
    if (c.lockedThrough && p.lockedThrough < c.lockedThrough) await this.asOwner();
    const history = [
      {previousDate: c.lockedThrough, newDate: p.lockedThrough, changedByRole: "ACCOUNTANT", reason: null, createdAt: new Date().toISOString()},
      ...(c.lockHistory ?? []),
    ].slice(0, 20);
    await this.db.collection(REGISTRY).doc(this.companyId).set({lockedThrough: p.lockedThrough, lockHistory: history}, {merge: true});
    return {lockedThrough: p.lockedThrough, history};
  }

  async getGroupReport(p: {kind: HlGroupReportKind; hlCompanyIds: string[]; from?: string; to?: string; date?: string}): Promise<HlGroupReport> {
    await this.gate("getGroupReport", p.kind);
    const ids = [...new Set(p.hlCompanyIds)];
    if (ids.length < 2 || ids.length > 20) throw new HlError("Pick 2 to 20 companies", 400, false);
    const companies = new Map<string, StoredCompany>();
    for (const id of ids) companies.set(id, await this.companyOf(id));
    if (p.kind !== "pnl") {
      for (const [id, c] of companies) {
        let up = c.carriedFrom;
        while (up) {
          if (companies.has(up.companyId)) throw new HlError("A year and the year it was carried from can't be added together", 422, false, "CARRIED_FORWARD_PAIR");
          up = (await this.companyOf(up.companyId)).carriedFrom;
        }
        void id;
      }
    }
    // name → type → per-company debit-positive balance
    const rows = new Map<string, {type: HlAccountType; by: Record<string, number>}>();
    for (const id of ids) {
      const books = new FakeHlClient(this.db, id);
      for (const a of (await books.accounts().get()).docs) {
        const acc = a.data() as StoredAccount;
        let bal: number;
        if (p.kind === "pnl") {
          const snap = await books.txns().where("accountIds", "array-contains", a.id).get();
          bal = 0;
          for (const d of snap.docs) {
            const t = d.data() as StoredTxn;
            if ((p.from && t.date < p.from) || (p.to && t.date > p.to)) continue;
            for (const l of t.legs) if (l.accountId === a.id) bal += l.type === "DEBIT" ? l.amountPaise : -l.amountPaise;
          }
        } else {
          bal = await books.balanceOf(a.id, p.date);
        }
        if (bal === 0) continue;
        if (p.kind === "pnl" && acc.type !== "INCOME" && acc.type !== "EXPENSE") continue;
        const row = rows.get(acc.name) ?? {type: acc.type, by: {}};
        row.by[id] = (row.by[id] ?? 0) + bal;
        rows.set(acc.name, row);
      }
    }
    const line = (name: string, by: Record<string, number>, sign: 1 | -1) => ({
      name,
      total: toAmount(sign * Object.values(by).reduce((x, y) => x + y, 0)),
      byCompany: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, toAmount(sign * v)])),
    });
    const section = (key: string, types: HlAccountType[], sign: 1 | -1) => ({
      key,
      lines: [...rows.entries()].filter(([, r]) => types.includes(r.type)).sort(([a], [b]) => a.localeCompare(b)).map(([n, r]) => line(n, r.by, sign)),
    });
    if (p.kind === "trial-balance") return {sections: [section("accounts", ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"], 1)], totals: []};
    if (p.kind === "balance-sheet") return {sections: [section("assets", ["ASSET"], 1), section("liabilities", ["LIABILITY"], -1), section("equity", ["EQUITY"], -1)], totals: []};
    const income = section("income", ["INCOME"], -1);
    const expenses = section("expenses", ["EXPENSE"], 1);
    const net: Record<string, number> = {};
    for (const [, r] of rows) for (const [k, v] of Object.entries(r.by)) net[k] = (net[k] ?? 0) - v;
    return {sections: [income, expenses], totals: [line("netProfit", net, 1)].map((l) => ({key: l.name, total: l.total, byCompany: l.byCompany}))};
  }
}
