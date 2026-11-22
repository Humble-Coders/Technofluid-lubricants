/**
 * Reports (brief: docs/office/reports-brief.md) — pure builders, read-only figures:
 *
 *  - documentDue: THE paid rule for an invoice or a supplier's bill (one copy, used by the
 *    report, the sales and purchase screens and — mirrored line for line — the Cloud
 *    Functions' "still due" check; both run reports.cases.json).
 *  - ageing: days since the document date, in 0–30 / 31–60 / 61–90 / 90+ buckets.
 *  - moneyOwed: HL balance per party + our open invoices / bills + what isn't matched.
 *  - salesByProduct: frozen sale lines grouped by pack, product or customer.
 *  - stockValue: weighted average purchase price × what's on hand.
 *
 * Money in integer paise, quantities in milli base units, never floats.
 */
import type { BaseUnit } from "./units";

// ─── The paid rule ───────────────────────────────────────────────────────────────

/** A money entry linked to an invoice / bill (saleId / purchaseId), with its reversal's status when it has one. */
export interface LinkedPaymentState {
  amountPaise: number;
  deleted?: boolean;
  /** Set on a reversal's mirror — a mirror never counts as a payment itself. */
  reversesEntryId?: string | null;
  /** Set on an entry that was reversed. */
  reversedByEntryId?: string | null;
  /** The mirror's sync status: the payment stops counting only once this is SYNCED. */
  mirrorStatus?: string | null;
}

/**
 * Whether a linked entry still counts as paid. A deleted entry and a mirror never do; a
 * reversed entry stops counting only once its reversal is in the books (SYNCED) — while
 * the reversal is pending or failed, the money is still in the books as paid.
 */
export function countsAsPaid(e: LinkedPaymentState): boolean {
  return e.deleted !== true && !e.reversesEntryId && !(e.reversedByEntryId && e.mirrorStatus === "SYNCED");
}

/** Money paid against a document after it was saved. */
export function paidLaterPaise(linked: readonly LinkedPaymentState[]): number {
  return linked.filter(countsAsPaid).reduce((sum, e) => sum + e.amountPaise, 0);
}

export interface DocumentDue {
  /** At billing + linked money still counting. */
  paidPaise: number;
  /** Never below zero. */
  duePaise: number;
}

/** What is paid and still due on one invoice / bill — the single rule for every screen and the report. */
export function documentDue(d: { totalPaise: number; paidAtCreationPaise: number; linked: readonly LinkedPaymentState[] }): DocumentDue {
  const paidPaise = d.paidAtCreationPaise + paidLaterPaise(d.linked);
  return { paidPaise, duePaise: Math.max(d.totalPaise - paidPaise, 0) };
}

// ─── Ageing ──────────────────────────────────────────────────────────────────────

export type AgeBucket = "0-30" | "31-60" | "61-90" | "90+";
export const AGE_BUCKETS: readonly AgeBucket[] = ["0-30", "31-60", "61-90", "90+"];
export const AGE_BUCKET_LABEL: Record<AgeBucket, string> = { "0-30": "0–30 days", "31-60": "31–60 days", "61-90": "61–90 days", "90+": "Over 90 days" };

const dayNumber = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10))) / 86_400_000;

/** Whole days from a document date to today (both "YYYY-MM-DD", India dates); a future date counts as 0. */
export function ageDays(documentDate: string, today: string): number {
  return Math.max(Math.round(dayNumber(today) - dayNumber(documentDate)), 0);
}

export function ageBucket(days: number): AgeBucket {
  return days <= 30 ? "0-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+";
}

/** 1 April of the financial year before the one `today` is in — the earliest document date the money-owed report scans. */
export function openDocumentsFrom(today: string): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const fyStart = m >= 4 ? y : y - 1;
  return `${fyStart - 1}-04-01`;
}

// ─── Money owed ──────────────────────────────────────────────────────────────────

export interface OpenDocumentInput {
  kind: "INVOICE" | "BILL";
  id: string;
  /** TF/2026-27/0001 or PB/2026-27/0001. */
  ref: string;
  /** The supplier's own bill number (bills only). */
  partyRef: string | null;
  entityId: string;
  partyName: string;
  date: string;
  totalPaise: number;
  paidPaise: number;
}

export interface OpenDocument extends OpenDocumentInput {
  duePaise: number;
  ageDays: number;
  bucket: AgeBucket;
}

export type BucketTotals = Record<AgeBucket, number>;

export interface PartyOwed {
  entityId: string;
  name: string;
  /** HL's balance: + they owe us, − we owe them. Null when the books have no balance for them. */
  balancePaise: number | null;
  /** Oldest first. */
  documents: OpenDocument[];
  openInvoicesPaise: number;
  openBillsPaise: number;
  /** HL balance − (open invoices − open bills). Shown, never forced to zero. */
  notMatchedPaise: number;
  /** Where that difference comes from, found in our own records (date order). */
  items: BalanceItem[];
  /** notMatched − Σ items: what our records don't explain (older documents, entries made directly in the books). */
  unexplainedPaise: number;
}

export interface MoneyOwedReport {
  /** Balance > 0, largest first. */
  owedToUs: PartyOwed[];
  /** Balance < 0, largest (most owed) first. */
  weOwe: PartyOwed[];
  /** Balance 0 or not in the books — hidden unless asked for. */
  settled: PartyOwed[];
  owedToUsPaise: number;
  weOwePaise: number;
  /** Due on open invoices by age (positive paise). */
  invoiceAgeing: BucketTotals;
  /** Due on open bills by age (positive paise). */
  billAgeing: BucketTotals;
}

const emptyBuckets = (): BucketTotals => ({ "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 });

/**
 * Who owes whom: one row per party in the books (or with an open document), its open
 * invoices and bills with their age, and the part of the balance no open document
 * explains. Documents with nothing due are left out.
 */
export function moneyOwed(input: {
  /** entityId → signed paise, from HL. */
  balances: Readonly<Record<string, number>>;
  /** entityId → name (our entities). */
  names: Readonly<Record<string, string>>;
  documents: readonly OpenDocumentInput[];
  today: string;
  /** entityId → what makes up the balance besides the open documents (balanceItems). */
  items?: Readonly<Record<string, readonly BalanceItem[]>>;
}): MoneyOwedReport {
  const parties = new Map<string, PartyOwed>();
  const party = (entityId: string, fallbackName: string) => {
    let p = parties.get(entityId);
    if (!p) {
      const bal = input.balances[entityId];
      p = {
        entityId,
        name: input.names[entityId] ?? fallbackName,
        balancePaise: typeof bal === "number" ? bal : null,
        documents: [],
        openInvoicesPaise: 0,
        openBillsPaise: 0,
        notMatchedPaise: 0,
        items: [...(input.items?.[entityId] ?? [])],
        unexplainedPaise: 0,
      };
      parties.set(entityId, p);
    }
    return p;
  };
  for (const id of Object.keys(input.balances)) party(id, id);
  for (const id of Object.keys(input.items ?? {})) if ((input.items?.[id] ?? []).length) party(id, input.names[id] ?? id);

  const invoiceAgeing = emptyBuckets();
  const billAgeing = emptyBuckets();
  for (const d of input.documents) {
    const duePaise = Math.max(d.totalPaise - d.paidPaise, 0);
    if (duePaise === 0) continue;
    const days = ageDays(d.date, input.today);
    const doc: OpenDocument = { ...d, duePaise, ageDays: days, bucket: ageBucket(days) };
    const p = party(d.entityId, d.partyName);
    p.documents.push(doc);
    if (d.kind === "INVOICE") {
      p.openInvoicesPaise += duePaise;
      invoiceAgeing[doc.bucket] += duePaise;
    } else {
      p.openBillsPaise += duePaise;
      billAgeing[doc.bucket] += duePaise;
    }
  }

  const owedToUs: PartyOwed[] = [];
  const weOwe: PartyOwed[] = [];
  const settled: PartyOwed[] = [];
  for (const p of parties.values()) {
    p.documents.sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref, undefined, { numeric: true }));
    p.notMatchedPaise = (p.balancePaise ?? 0) - (p.openInvoicesPaise - p.openBillsPaise);
    p.unexplainedPaise = p.notMatchedPaise - p.items.reduce((sum, i) => sum + i.amountPaise, 0);
    const bal = p.balancePaise ?? 0;
    (bal > 0 ? owedToUs : bal < 0 ? weOwe : settled).push(p);
  }
  const byName = (a: PartyOwed, b: PartyOwed) => a.name.localeCompare(b.name, undefined, { numeric: true });
  owedToUs.sort((a, b) => (b.balancePaise ?? 0) - (a.balancePaise ?? 0) || byName(a, b));
  weOwe.sort((a, b) => (a.balancePaise ?? 0) - (b.balancePaise ?? 0) || byName(a, b));
  settled.sort(byName);
  return {
    owedToUs,
    weOwe,
    settled,
    owedToUsPaise: owedToUs.reduce((s, p) => s + (p.balancePaise ?? 0), 0),
    weOwePaise: -weOwe.reduce((s, p) => s + (p.balancePaise ?? 0), 0),
    invoiceAgeing,
    billAgeing,
  };
}

// ─── Where a balance comes from ──────────────────────────────────────────────────

/**
 * One piece of a party's balance that isn't an open invoice or bill, found in our own
 * records. Signed like the balance: + they owe us more / we owe them less, − the other way.
 */
export interface BalanceItem {
  kind: "OPENING" | "MONEY" | "CORRECTION" | "TRANSFER" | "CANCELLED_CREDIT" | "CANCEL_NOT_IN_BOOKS" | "NOT_IN_BOOKS" | "PAYMENT_NOT_IN_BOOKS";
  date: string | null;
  label: string;
  /** The note typed with it, the cash/bank account… */
  detail: string | null;
  amountPaise: number;
  /** The invoice / bill it belongs to, when it does. */
  document: { kind: "INVOICE" | "BILL"; id: string; ref: string } | null;
}

/** A side of a money entry, as stored (MoneyAccountRef). */
export interface MoneySideForReport {
  kind: string;
  entityId?: string;
  name?: string;
}

/** A money entry with a party on at least one side (a MoneyEntryRow fits, plus inBooks). */
export interface MoneyEntryForReport {
  id: string;
  from: MoneySideForReport;
  to: MoneySideForReport;
  amountPaise: number;
  businessDay: string;
  note: string | null;
  isCorrection: boolean;
  saleId: string | null;
  purchaseId: string | null;
  deleted?: boolean;
  reversesEntryId: string | null;
  reversedByEntryId: string | null;
  syncStatus: string;
  /** Posted to the books (SYNCED, or it has its HL transaction). */
  inBooks: boolean;
}

/** An invoice or a supplier's bill dated inside the report's window (active or cancelled). */
export interface DocumentForReport {
  kind: "INVOICE" | "BILL";
  id: string;
  ref: string;
  partyRef: string | null;
  entityId: string;
  partyName: string;
  date: string;
  status: "ACTIVE" | "CANCELLED";
  totalPaise: number;
  /** Paid with the invoice / bill, each with whether it's in the books. */
  paidAtCreation: readonly { amountPaise: number; name: string; inBooks: boolean }[];
  /** The invoice / bill itself is in the books. */
  inBooks: boolean;
  /** Its cancellation is in the books. */
  cancelInBooks: boolean;
}

export interface EntityForReport {
  id: string;
  name: string;
  opening: { amountPaise: number; direction: "receivable" | "payable"; asOf: string; posted: boolean } | null;
}

/** What one side of an entry does to that party's balance: money to them +, from them −. */
const effectOn = (e: MoneyEntryForReport, entityId: string) => (e.to.kind === "PARTY" && e.to.entityId === entityId ? e.amountPaise : 0) - (e.from.kind === "PARTY" && e.from.entityId === entityId ? e.amountPaise : 0);
const sideName = (s: MoneySideForReport) => (s.kind === "ADJUSTMENT" ? "Adjustment" : (s.name ?? s.kind));
const docLabel = (d: DocumentForReport) => (d.kind === "INVOICE" ? d.ref : `${d.ref}${d.partyRef ? ` (their bill ${d.partyRef})` : ""}`);

/**
 * Money owed, built from the records: open invoices / bills with what's due (the one paid
 * rule), and — per party — every piece of the books' balance that isn't an open document:
 * the opening balance, money in / out with no invoice or bill chosen, corrections, money
 * moved between parties, payments left as credit by a cancelled invoice / bill, and
 * anything not saved to the books yet. What's still left is `unexplainedPaise`.
 */
export function moneyOwedFromRecords(input: {
  balances: Readonly<Record<string, number>>;
  entities: readonly EntityForReport[];
  documents: readonly DocumentForReport[];
  entries: readonly MoneyEntryForReport[];
  today: string;
}): MoneyOwedReport {
  const names: Record<string, string> = Object.fromEntries(input.entities.map((e) => [e.id, e.name]));
  const items: Record<string, BalanceItem[]> = {};
  const add = (entityId: string, item: BalanceItem) => {
    if (item.amountPaise !== 0) (items[entityId] ??= []).push(item);
  };

  for (const e of input.entities) {
    const o = e.opening;
    if (o && o.posted && o.amountPaise > 0) add(e.id, { kind: "OPENING", date: o.asOf, label: "Opening balance", detail: o.direction === "receivable" ? "They owed us when the books started" : "We owed them when the books started", amountPaise: o.direction === "receivable" ? o.amountPaise : -o.amountPaise, document: null });
  }

  const status = new Map(input.entries.map((e) => [e.id, e.syncStatus]));
  const counting = input.entries.filter((e) => countsAsPaid({ ...e, mirrorStatus: e.reversedByEntryId ? (status.get(e.reversedByEntryId) ?? null) : null }));
  const docs = new Map(input.documents.map((d) => [d.id, d]));
  const linked = new Map<string, MoneyEntryForReport[]>();
  for (const e of counting) {
    const docId = e.saleId ?? e.purchaseId;
    if (docId) linked.set(docId, [...(linked.get(docId) ?? []), e]);
  }

  // Money not tied to an invoice or bill (advances, refunds, corrections, transfers).
  for (const e of counting) {
    if (e.saleId || e.purchaseId || !e.inBooks) continue;
    for (const side of [e.from, e.to]) {
      if (side.kind !== "PARTY" || !side.entityId) continue;
      const id = side.entityId;
      const amount = effectOn(e, id);
      const other = side === e.from ? e.to : e.from;
      const [kind, label]: [BalanceItem["kind"], string] =
        other.kind === "ADJUSTMENT"
          ? ["CORRECTION", "Balance correction"]
          : other.kind === "PARTY"
            ? ["TRANSFER", side === e.from ? `Moved to ${sideName(other)}` : `Moved from ${sideName(other)}`]
            : ["MONEY", side === e.from ? "Money received, no invoice chosen" : "Money paid, no bill chosen"];
      const detail = [other.kind === "CASH" || other.kind === "BANK" ? sideName(other) : null, e.note].filter(Boolean).join(" · ") || null;
      add(id, { kind: e.isCorrection ? "CORRECTION" : kind, date: e.businessDay, label: e.isCorrection && kind === "MONEY" ? "Balance correction" : label, detail, amountPaise: amount, document: null });
    }
  }

  // Invoices and bills: what the books hold for each besides what's open on it.
  const openDocs: OpenDocumentInput[] = [];
  for (const d of input.documents) {
    const sign = d.kind === "INVOICE" ? 1 : -1; // an invoice adds to what they owe us; a bill to what we owe
    const later = linked.get(d.id) ?? [];
    const ref = { kind: d.kind, id: d.id, ref: d.ref };
    if (d.status === "ACTIVE") {
      const paid = documentDue({ totalPaise: d.totalPaise, paidAtCreationPaise: d.paidAtCreation.reduce((s, p) => s + p.amountPaise, 0), linked: later }).paidPaise;
      openDocs.push({ kind: d.kind, id: d.id, ref: d.ref, partyRef: d.partyRef, entityId: d.entityId, partyName: d.partyName, date: d.date, totalPaise: d.totalPaise, paidPaise: paid });
      if (!d.inBooks) {
        add(d.entityId, { kind: "NOT_IN_BOOKS", date: d.date, label: `${docLabel(d)} isn't in the books yet`, detail: "Still being saved, so the balance doesn't include it", amountPaise: -sign * Math.max(d.totalPaise - paid, 0), document: ref });
        continue;
      }
      for (const p of d.paidAtCreation) if (!p.inBooks) add(d.entityId, { kind: "PAYMENT_NOT_IN_BOOKS", date: d.date, label: `Payment with ${d.ref} isn't in the books yet`, detail: p.name, amountPaise: sign * p.amountPaise, document: ref });
      for (const e of later) if (!e.inBooks) add(d.entityId, { kind: "PAYMENT_NOT_IN_BOOKS", date: e.businessDay, label: `Payment on ${d.ref} isn't in the books yet`, detail: e.note, amountPaise: -effectOn(e, d.entityId), document: ref });
    } else {
      if (d.inBooks && !d.cancelInBooks) add(d.entityId, { kind: "CANCEL_NOT_IN_BOOKS", date: d.date, label: `${docLabel(d)} was cancelled, not in the books yet`, detail: "The books still count it until the cancellation is saved", amountPaise: sign * d.totalPaise, document: ref });
      const credit = d.kind === "INVOICE" ? "Paid on cancelled invoice" : "Paid on cancelled bill";
      for (const p of d.paidAtCreation) if (p.inBooks) add(d.entityId, { kind: "CANCELLED_CREDIT", date: d.date, label: `${credit} ${docLabel(d)}`, detail: `${p.name} · kept as ${d.kind === "INVOICE" ? "their credit" : "money they owe back"}`, amountPaise: -sign * p.amountPaise, document: ref });
      for (const e of later) if (e.inBooks) add(d.entityId, { kind: "CANCELLED_CREDIT", date: e.businessDay, label: `${credit} ${docLabel(d)}`, detail: [e.note, d.kind === "INVOICE" ? "kept as their credit" : "money they owe back"].filter(Boolean).join(" · "), amountPaise: effectOn(e, d.entityId), document: ref });
    }
  }

  for (const list of Object.values(items)) list.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  for (const d of input.documents) if (!(d.entityId in names)) names[d.entityId] = d.partyName;
  return moneyOwed({ balances: input.balances, names, documents: openDocs, today: input.today, items });
}

// ─── Sales by product ────────────────────────────────────────────────────────────

/** The frozen figures of one sale the report reads (a SaleRow fits). */
export interface SaleForReport {
  status: "ACTIVE" | "CANCELLED";
  customer: { entityId: string; name: string };
  lines: readonly {
    sku: string;
    productName: string;
    packLabel: string;
    productKey: string;
    baseUnit: BaseUnit;
    packs: number;
    qtyMilli: number;
    taxablePaise: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
    totalPaise: number;
  }[];
  freight: { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number } | null;
  totals: { roundOffPaise: number; grandTotalPaise: number };
}

export type SalesGroupBy = "pack" | "product" | "customer";

export interface SalesRow {
  key: string;
  label: string;
  /** Pack label (by pack), number of packs sizes (by product) or invoices (by customer). */
  detail: string;
  /** Packs sold; null when the row mixes pack sizes (by product / customer). */
  packs: number | null;
  /** Quantity per base unit (a customer row can mix L, kg and pieces). */
  qtyMilli: Partial<Record<BaseUnit, number>>;
  taxablePaise: number;
  gstPaise: number;
  totalPaise: number;
}

export interface SalesByProductReport {
  rows: SalesRow[];
  freight: { taxablePaise: number; gstPaise: number; totalPaise: number };
  roundOffPaise: number;
  totals: { taxablePaise: number; gstPaise: number; totalPaise: number };
  invoiceCount: number;
  cancelledCount: number;
  /** Σ grandTotalPaise of the ACTIVE invoices — the report total must equal it. */
  invoicesTotalPaise: number;
  matches: boolean;
}

const gstOf = (l: { cgstPaise: number; sgstPaise: number; igstPaise: number }) => l.cgstPaise + l.sgstPaise + l.igstPaise;

/** What was sold, from the frozen sale lines (never re-priced). Cancelled invoices are only counted. */
export function salesByProduct(sales: readonly SaleForReport[], opts: { groupBy: SalesGroupBy; customerEntityId?: string | null }): SalesByProductReport {
  const rows = new Map<string, SalesRow & { _packs: Set<string>; _invoices: number }>();
  const freight = { taxablePaise: 0, gstPaise: 0, totalPaise: 0 };
  let roundOffPaise = 0;
  let invoiceCount = 0;
  let cancelledCount = 0;
  let invoicesTotalPaise = 0;

  for (const s of sales) {
    if (opts.customerEntityId && s.customer.entityId !== opts.customerEntityId) continue;
    if (s.status !== "ACTIVE") {
      cancelledCount++;
      continue;
    }
    invoiceCount++;
    invoicesTotalPaise += s.totals.grandTotalPaise;
    roundOffPaise += s.totals.roundOffPaise;
    if (s.freight) {
      freight.taxablePaise += s.freight.taxablePaise;
      freight.gstPaise += gstOf(s.freight);
      freight.totalPaise += s.freight.totalPaise;
    }
    const seenCustomer = new Set<string>();
    for (const l of s.lines) {
      const key = opts.groupBy === "pack" ? l.sku : opts.groupBy === "product" ? l.productKey || l.sku : s.customer.entityId;
      let r = rows.get(key);
      if (!r) {
        r = {
          key,
          label: opts.groupBy === "customer" ? s.customer.name : l.productName,
          detail: "",
          packs: 0,
          qtyMilli: {},
          taxablePaise: 0,
          gstPaise: 0,
          totalPaise: 0,
          _packs: new Set(),
          _invoices: 0,
        };
        rows.set(key, r);
      }
      r._packs.add(l.packLabel);
      if (opts.groupBy === "customer" && !seenCustomer.has(key)) {
        seenCustomer.add(key);
        r._invoices++;
      }
      r.packs = (r.packs ?? 0) + l.packs;
      r.qtyMilli[l.baseUnit] = (r.qtyMilli[l.baseUnit] ?? 0) + l.qtyMilli;
      r.taxablePaise += l.taxablePaise;
      r.gstPaise += gstOf(l);
      r.totalPaise += l.totalPaise;
    }
  }

  const out: SalesRow[] = [...rows.values()].map(({ _packs, _invoices, ...r }) => {
    if (opts.groupBy === "pack") return { ...r, detail: [..._packs][0] ?? "" };
    if (opts.groupBy === "product") return { ...r, packs: _packs.size === 1 ? r.packs : null, detail: _packs.size === 1 ? [..._packs][0]! : `${_packs.size} pack sizes` };
    return { ...r, packs: null, detail: `${_invoices} invoice${_invoices === 1 ? "" : "s"}` };
  });
  out.sort((a, b) => b.taxablePaise - a.taxablePaise || a.label.localeCompare(b.label, undefined, { numeric: true }) || a.detail.localeCompare(b.detail));

  const goods = out.reduce((t, r) => ({ taxablePaise: t.taxablePaise + r.taxablePaise, gstPaise: t.gstPaise + r.gstPaise, totalPaise: t.totalPaise + r.totalPaise }), { taxablePaise: 0, gstPaise: 0, totalPaise: 0 });
  const totals = {
    taxablePaise: goods.taxablePaise + freight.taxablePaise,
    gstPaise: goods.gstPaise + freight.gstPaise,
    totalPaise: goods.totalPaise + freight.totalPaise + roundOffPaise,
  };
  return { rows: out, freight, roundOffPaise, totals, invoiceCount, cancelledCount, invoicesTotalPaise, matches: totals.totalPaise === invoicesTotalPaise };
}

// ─── Stock value ─────────────────────────────────────────────────────────────────

export interface StockItemForValue {
  id: string;
  name: string;
  kind: string;
  baseUnit: BaseUnit;
  onHandMilli: number;
}

export interface PurchaseForValue {
  status: "ACTIVE" | "CANCELLED";
  lines: readonly { itemId: string; qtyMilli: number; taxablePaise: number }[];
}

export type StockValueState = "valued" | "noCost" | "belowZero";

export interface StockValueRow extends StockItemForValue {
  /** Weighted average purchase price of one base unit (₹/L, ₹/kg, ₹/piece) in paise; null with no purchase line. */
  avgPricePaise: number | null;
  /** On hand × average; null when not counted (no cost yet, or below zero). */
  valuePaise: number | null;
  state: StockValueState;
  /** Σ taxable and Σ quantity over the item's active purchase lines. */
  boughtTaxablePaise: number;
  boughtQtyMilli: number;
}

export interface StockValueReport {
  /** Largest value first; then no cost yet / below zero by name. */
  rows: StockValueRow[];
  totalPaise: number;
  noCostCount: number;
  belowZeroCount: number;
}

/** a × b ÷ c rounded half up, exact for non-negative integers of any size (BigInt inside). */
export function mulDivRound(a: number, b: number, c: number): number {
  if (c <= 0) throw new RangeError("Divide by a positive number");
  if (a < 0 || b < 0) throw new RangeError("Non-negative numbers only");
  const n = BigInt(a) * BigInt(b);
  const d = BigInt(c);
  return Number((n * 2n + d) / (d * 2n));
}

/**
 * What the stock we bought is worth: the weighted average purchase price (Σ taxable ÷
 * Σ quantity over every active purchase line of the item, "goods already counted" bills
 * included) × on hand, rounded once per row. No purchase line → "no cost yet"; below
 * zero → flagged; neither is in the total.
 */
export function stockValue(items: readonly StockItemForValue[], purchases: readonly PurchaseForValue[]): StockValueReport {
  const bought = new Map<string, { taxable: number; qty: number }>();
  for (const p of purchases) {
    if (p.status !== "ACTIVE") continue;
    for (const l of p.lines) {
      const b = bought.get(l.itemId) ?? { taxable: 0, qty: 0 };
      b.taxable += l.taxablePaise;
      b.qty += l.qtyMilli;
      bought.set(l.itemId, b);
    }
  }
  const rows: StockValueRow[] = items.map((it) => {
    const b = bought.get(it.id);
    const has = !!b && b.qty > 0;
    const avgPricePaise = has ? mulDivRound(b.taxable, 1000, b.qty) : null;
    const base = { ...it, avgPricePaise, boughtTaxablePaise: b?.taxable ?? 0, boughtQtyMilli: b?.qty ?? 0 };
    if (it.onHandMilli < 0) return { ...base, valuePaise: null, state: "belowZero" as const };
    if (!has) return { ...base, valuePaise: null, state: "noCost" as const };
    return { ...base, valuePaise: mulDivRound(it.onHandMilli, b.taxable, b.qty), state: "valued" as const };
  });
  const order: Record<StockValueState, number> = { valued: 0, belowZero: 1, noCost: 2 };
  rows.sort((a, b) => order[a.state] - order[b.state] || (b.valuePaise ?? 0) - (a.valuePaise ?? 0) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  return {
    rows,
    totalPaise: rows.reduce((s, r) => s + (r.valuePaise ?? 0), 0),
    noCostCount: rows.filter((r) => r.state === "noCost").length,
    belowZeroCount: rows.filter((r) => r.state === "belowZero").length,
  };
}

// ─── CSV ─────────────────────────────────────────────────────────────────────────

/** Paise as a plain decimal for a spreadsheet: 123456 → "1234.56", −5 → "-0.05". */
export function paiseCsv(paise: number): string {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  return `${neg ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Milli as a plain decimal: 1500 → "1.5", 2000 → "2". */
export function milliCsv(milli: number): string {
  const neg = milli < 0;
  const abs = Math.abs(milli);
  const frac = String(abs % 1000).padStart(3, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${Math.floor(abs / 1000)}${frac ? `.${frac}` : ""}`;
}

/**
 * Rows → CSV text (RFC 4180 quoting, CRLF). A cell starting with = + - @ that isn't a
 * number gets a leading apostrophe, so a spreadsheet never runs it as a formula.
 */
export function toCsv(rows: readonly (readonly (string | number | null)[])[]): string {
  const cell = (v: string | number | null) => {
    let s = v === null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
