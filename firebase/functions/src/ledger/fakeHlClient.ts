import * as admin from "firebase-admin";

import {
  HL_APP_ID,
  HL_MAX_PAGE,
  HlError,
  type HlAccount,
  type HlAccountType,
  type HlClient,
  type HlCustomer,
  type HlLedgerRow,
  type HlLeg,
  type HlMoneyMove,
  type HlPostingType,
  type HlProfilePayload,
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
 *  - customers look like HL's ({…, isActive, outstanding}); amounts are decimal strings.
 * Test hook: _fakeHl/control {failNext: n} fails the next n calls with a 503;
 * {down: true} fails every call (to try the "books unreachable" screens);
 * {omitBalance: true} returns only `outstanding` (as HL does), not `balance` as well.
 * Every call is logged in _fakeHl/books/log {op, key}. Rules deny all client access.
 */

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
  constructor(private readonly db: admin.firestore.Firestore) {}

  private customers() {
    return this.db.collection(`${ROOT}/books/customers`);
  }
  private accounts() {
    return this.db.collection(`${ROOT}/books/accounts`);
  }
  private txns() {
    return this.db.collection(`${ROOT}/books/txns`);
  }

  /** Every call goes through here first: the test hooks and the call log. */
  private async gate(op: string, key: string): Promise<{omitBalance: boolean}> {
    const ref = this.db.doc(`${ROOT}/control`);
    await this.db.collection(`${ROOT}/books/log`).add({op, key, at: Date.now()});
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
    const ref = this.txns().doc(`${HL_APP_ID}~${t.sourceId}`.replace(/\//g, "_"));
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
          sourceId: t.sourceId,
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
}
