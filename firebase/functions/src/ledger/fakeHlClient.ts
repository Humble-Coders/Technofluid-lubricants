import * as admin from "firebase-admin";

import {HL_APP_ID, HL_MAX_PAGE, HlError, type HlClient, type HlCustomer, type HlLedgerRow, type HlProfilePayload} from "./hlClient";

/**
 * A stand-in for Humble Ledger in the emulator (and only there): a real little ledger
 * kept in Firestore under _fakeHl/*, so balances and statements are real. It behaves
 * like HL where it matters:
 *  - idempotent on externalId (customers) and on (appId, sourceId) (transactions);
 *  - 404 for unknown ids; archive refuses a non-zero balance; pages > 100 are a 400;
 *  - amounts come back as decimal strings.
 * Test hook: _fakeHl/control {failNext: n} fails the next n calls with a 503;
 * {down: true} fails every call (to try the "books unreachable" screens);
 * {omitBalance: true} returns `outstanding` without `balance`. Every call is logged in
 * _fakeHl/log {op, key} so tests can tell whether an edit reached "the books".
 * Rules deny all client access to _fakeHl.
 */

const ROOT = "_fakeHl";
const toAmount = (paise: number) => {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
};

interface StoredCustomer {
  externalId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  accountId: string;
  archived: boolean;
}
interface StoredTxn {
  customerId: string;
  accountId: string;
  appId: string;
  sourceId: string;
  date: string;
  /** + they owe us (debit), − we owe them (credit). */
  amountPaise: number;
  description: string;
  actorRef: string;
  seq: number;
}

export class FakeHlClient implements HlClient {
  readonly mode = "fake" as const;
  constructor(private readonly db: admin.firestore.Firestore) {}

  private customers() {
    return this.db.collection(`${ROOT}/books/customers`);
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

  private async balancePaise(customerId: string): Promise<number> {
    const snap = await this.txns().where("customerId", "==", customerId).get();
    return snap.docs.reduce((sum, d) => sum + (d.data() as StoredTxn).amountPaise, 0);
  }

  private async view(id: string, c: StoredCustomer, omitBalance: boolean): Promise<HlCustomer> {
    const bal = toAmount(await this.balancePaise(id));
    return {
      id,
      accountId: c.accountId,
      externalId: c.externalId,
      name: c.name,
      archived: c.archived,
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

  async createCustomer(p: HlProfilePayload & {externalId: string}) {
    const {omitBalance} = await this.gate("createCustomer", p.externalId);
    const fields = FakeHlClient.clean(p);
    const existing = await this.customers().where("externalId", "==", p.externalId).limit(1).get();
    if (!existing.empty) {
      const d = existing.docs[0];
      return {customer: await this.view(d.id, d.data() as StoredCustomer, omitBalance), idempotent: true};
    }
    const ref = this.customers().doc();
    const stored: StoredCustomer = {...fields, externalId: p.externalId, accountId: `acc_${ref.id}`, archived: false};
    await ref.set(stored);
    return {customer: await this.view(ref.id, stored, omitBalance), idempotent: false};
  }

  async updateCustomer(id: string, p: HlProfilePayload) {
    const {omitBalance} = await this.gate("updateCustomer", id);
    const c = await this.load(id);
    const fields = FakeHlClient.clean(p);
    const next = {...c, ...fields};
    await this.customers().doc(id).set(next);
    return this.view(id, next, omitBalance);
  }

  async archiveCustomer(id: string) {
    await this.gate("archiveCustomer", id);
    await this.load(id);
    const bal = await this.balancePaise(id);
    if (bal !== 0) throw new HlError(`Customer has a non-zero balance (${toAmount(bal)})`, 409, false);
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
    if (!p.sourceId || !p.date) throw new HlError("sourceId and date are required", 400, false);
    const c = await this.load(customerId);
    const replay = await this.txns().where("appId", "==", HL_APP_ID).where("sourceId", "==", p.sourceId).limit(1).get();
    if (!replay.empty) return {txnId: replay.docs[0].id, idempotent: true};
    const ref = this.txns().doc();
    const txn: StoredTxn = {
      customerId,
      accountId: c.accountId,
      appId: HL_APP_ID,
      sourceId: p.sourceId,
      date: p.date,
      amountPaise: p.direction === "RECEIVABLE" ? p.amountPaise : -p.amountPaise,
      description: "Opening balance",
      actorRef: p.actorRef,
      seq: Date.now(),
    };
    await ref.set(txn);
    return {txnId: ref.id, idempotent: false};
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

  async getLedger(p: {accountId: string; from: string; to: string; page: number; limit: number}) {
    await this.gate("getLedger", p.accountId);
    if (p.limit > HL_MAX_PAGE) throw new HlError(`limit must be at most ${HL_MAX_PAGE}`, 400, false);
    const owner = await this.customers().where("accountId", "==", p.accountId).limit(1).get();
    if (owner.empty) throw new HlError(`Account ${p.accountId} not found`, 404, false);
    const all = (await this.txns().where("accountId", "==", p.accountId).get()).docs
      .map((d) => ({id: d.id, ...(d.data() as StoredTxn)}))
      .sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq);
    let running = all.filter((t) => t.date < p.from).reduce((s, t) => s + t.amountPaise, 0);
    const openingBalance = toAmount(running);
    const inRange = all.filter((t) => t.date >= p.from && t.date <= p.to);
    const rows: HlLedgerRow[] = inRange.map((t) => {
      running += t.amountPaise;
      return {
        txnId: t.id,
        date: t.date,
        description: t.description,
        sourceId: t.sourceId,
        debit: toAmount(Math.max(t.amountPaise, 0)),
        credit: toAmount(Math.max(-t.amountPaise, 0)),
        balance: toAmount(running),
      };
    });
    const page = rows.slice((p.page - 1) * p.limit, p.page * p.limit);
    return {openingBalance, rows: page, hasMore: p.page * p.limit < rows.length};
  }
}
