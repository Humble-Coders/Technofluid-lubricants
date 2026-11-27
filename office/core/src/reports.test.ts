import { describe, expect, it } from "vitest";
import cases from "./reports.cases.json";
import {
  ageBucket,
  ageDays,
  documentDue,
  milliCsv,
  moneyOwed,
  moneyOwedFromRecords,
  mulDivRound,
  openDocumentsFrom,
  paidLaterPaise,
  paiseCsv,
  salesByProduct,
  stockValue,
  toCsv,
  type OpenDocumentInput,
  type DocumentForReport,
  type EntityForReport,
  type MoneyEntryForReport,
  type PartyOwed,
  type SaleForReport,
  type SalesGroupBy,
  type SalesRow,
  type StockItemForValue,
  type PurchaseForValue,
} from "./index";

// The `due` table also runs against the Cloud Functions' filter (office/emulator/tests/money.test.mjs).
describe("the paid rule (reports.cases.json → due)", () => {
  for (const c of cases.due) {
    it(c.case, () => {
      const due = documentDue(c.input);
      expect({ paidLaterPaise: paidLaterPaise(c.input.linked), ...due }).toEqual(c.expect);
    });
  }
});

describe("ageing", () => {
  for (const c of cases.ageing) {
    it(`${c.date} → ${c.today}: ${c.days} days, ${c.bucket}`, () => {
      expect(ageDays(c.date, c.today)).toBe(c.days);
      expect(ageBucket(ageDays(c.date, c.today))).toBe(c.bucket);
    });
  }
  for (const c of cases.openFrom) it(`open documents scanned from ${c.from} on ${c.today}`, () => expect(openDocumentsFrom(c.today)).toBe(c.from));
});

describe("money owed", () => {
  const m = cases.moneyOwed;
  const r = moneyOwed({ balances: m.balances, names: m.names, documents: m.documents as OpenDocumentInput[], today: m.today });
  const project = (ps: PartyOwed[]) =>
    ps.map((p) => ({
      entityId: p.entityId,
      balancePaise: p.balancePaise,
      openInvoicesPaise: p.openInvoicesPaise,
      openBillsPaise: p.openBillsPaise,
      notMatchedPaise: p.notMatchedPaise,
      documents: p.documents.map((d) => [d.ref, d.duePaise, d.ageDays, d.bucket]),
    }));
  it("splits parties by HL balance, nets a customer-and-supplier to one figure, shows what isn't matched", () => {
    expect(project(r.owedToUs)).toEqual(m.expect.owedToUs);
    expect(project(r.weOwe)).toEqual(m.expect.weOwe);
    expect(project(r.settled)).toEqual(m.expect.settled);
  });
  it("totals and ageing", () => {
    expect(r.owedToUsPaise).toBe(m.expect.owedToUsPaise);
    expect(r.weOwePaise).toBe(m.expect.weOwePaise);
    expect(r.invoiceAgeing).toEqual(m.expect.invoiceAgeing);
    expect(r.billAgeing).toEqual(m.expect.billAgeing);
  });
});

describe("sales by product", () => {
  const list = cases.sales.list as SaleForReport[];
  const row = (r: SalesRow) => [r.key, r.label, r.detail, r.packs, r.qtyMilli, r.taxablePaise, r.gstPaise, r.totalPaise];
  for (const c of cases.sales.cases) {
    it(c.case, () => {
      const r = salesByProduct(list, { groupBy: c.groupBy as SalesGroupBy, customerEntityId: c.customer });
      const { rows, ...rest } = c.expect;
      expect(r.rows.map(row)).toEqual(rows);
      expect({ freight: r.freight, roundOffPaise: r.roundOffPaise, totals: r.totals, invoiceCount: r.invoiceCount, cancelledCount: r.cancelledCount, invoicesTotalPaise: r.invoicesTotalPaise, matches: r.matches }).toEqual(rest);
    });
  }
  it(cases.sales.mismatch.case, () => {
    const r = salesByProduct(cases.sales.mismatch.list as SaleForReport[], { groupBy: "pack" });
    expect({ totalPaise: r.totals.totalPaise, invoicesTotalPaise: r.invoicesTotalPaise, matches: r.matches }).toEqual(cases.sales.mismatch.expect);
  });
});

describe("stock value", () => {
  const s = cases.stock;
  const r = stockValue(s.items as StockItemForValue[], s.purchases as PurchaseForValue[]);
  it("weighted average over active bills, rounded once per row; no cost and below zero left out of the total", () => {
    expect(r.rows.map((x) => [x.id, x.state, x.avgPricePaise, x.valuePaise])).toEqual(s.expect.rows);
    expect(r.totalPaise).toBe(s.expect.totalPaise);
    expect(r.noCostCount).toBe(s.expect.noCostCount);
    expect(r.belowZeroCount).toBe(s.expect.belowZeroCount);
  });
  it("mulDivRound is exact beyond 2^53 and rounds half up", () => {
    expect(mulDivRound(10_000_000_001, 10_000_000_001, 10_000_000_001)).toBe(10_000_000_001);
    expect(mulDivRound(3, 5, 2)).toBe(8);
    expect(mulDivRound(1, 1, 2)).toBe(1);
    expect(mulDivRound(1, 1, 3)).toBe(0);
    expect(() => mulDivRound(1, 1, 0)).toThrow();
  });
});

describe("CSV", () => {
  for (const [p, t] of cases.csv.paise) it(`paise ${p} → ${t}`, () => expect(paiseCsv(p as number)).toBe(t));
  for (const [m, t] of cases.csv.milli) it(`milli ${m} → ${t}`, () => expect(milliCsv(m as number)).toBe(t));
  it("quotes, escapes and defuses formulas", () => expect(toCsv(cases.csv.rows as (string | number | null)[][])).toBe(cases.csv.text));
});

describe("where a balance comes from (moneyOwedFromRecords)", () => {
  const c = cases.fromRecords;
  const r = moneyOwedFromRecords({
    balances: c.balances,
    entities: c.entities as EntityForReport[],
    documents: c.documents as DocumentForReport[],
    entries: c.entries as MoneyEntryForReport[],
    today: c.today,
  });
  const all = [...r.owedToUs, ...r.weOwe, ...r.settled];
  for (const id of ["p1", "p2"] as const) {
    it(`${id}: opening, money with no document, transfers, cancelled credit, not-in-books items; the rest is unexplained`, () => {
      const p = all.find((x) => x.entityId === id)!;
      const want = c.expect[id];
      expect({
        openInvoicesPaise: p.openInvoicesPaise,
        openBillsPaise: p.openBillsPaise,
        notMatchedPaise: p.notMatchedPaise,
        unexplainedPaise: p.unexplainedPaise,
        documents: p.documents.map((d) => [d.ref, d.duePaise]),
        items: p.items.map((i) => [i.kind, i.date, i.amountPaise]),
      }).toEqual(want);
      expect(p.items.map((i) => i.label)).toEqual(c.labels[id]);
    });
  }
  it("an opening not posted to the books yet isn't counted", () => {
    expect(all.find((x) => x.entityId === "p3")).toBeUndefined();
  });
});

describe("open ledger (money not against an invoice or bill)", () => {
  const c = cases.fromRecords;
  const r = moneyOwedFromRecords({ balances: c.balances, entities: c.entities as EntityForReport[], documents: c.documents as DocumentForReport[], entries: c.entries as MoneyEntryForReport[], today: c.today });
  const all = [...r.owedToUs, ...r.weOwe, ...r.settled];
  const sync = new Set(["NOT_IN_BOOKS", "PAYMENT_NOT_IN_BOOKS", "CANCEL_NOT_IN_BOOKS"]);
  it("is what isn't matched to an open document, less what the books are still catching up on", () => {
    for (const p of all) {
      const want = p.balancePaise === null ? 0 : p.notMatchedPaise - p.items.filter((i) => sync.has(i.kind)).reduce((s, i) => s + i.amountPaise, 0);
      expect(p.openLedgerPaise).toBe(want);
      expect(p.openLedger.reduce((t, l) => t + l.amountPaise, 0)).toBe(want);
    }
  });
  it("its ageing adds up to every party's open ledger", () => {
    const total = Object.values(r.ledgerAgeing).reduce((s, v) => s + v, 0);
    expect(total).toBe(all.reduce((s, p) => s + p.openLedgerPaise, 0));
  });
  it("a customer paying more, or paying without choosing an invoice, shows as their advance; a supplier's opening as what we owe", () => {
    const today = "2026-11-25";
    const party = (entityId: string, name: string) => ({ kind: "PARTY", entityId, name });
    const bank = { kind: "BANK", name: "Bank" };
    const entry = (id: string, from: MoneySideForReportLike, to: MoneySideForReportLike, amountPaise: number, businessDay: string, saleId: string | null = null): MoneyEntryForReport => ({ id, from, to, amountPaise, businessDay, note: null, isCorrection: false, saleId, purchaseId: null, reversesEntryId: null, reversedByEntryId: null, syncStatus: "SYNCED", inBooks: true });
    type MoneySideForReportLike = { kind: string; entityId?: string; name?: string };
    const invoice: DocumentForReport = { kind: "INVOICE", id: "s1", ref: "TF/2026-27/0001", partyRef: null, entityId: "c1", partyName: "Cust", date: "2026-11-01", status: "ACTIVE", totalPaise: 100_000, paidAtCreation: [], inBooks: true, cancelInBooks: false };
    const x = moneyOwedFromRecords({
      // c1: invoiced 1000, paid 600 on it and 500 more with no invoice → owes 1000 − 600 − 500 = −100 (advance).
      // v1: opening 300 we owed them, dated long ago.
      balances: { c1: -10_000, v1: -30_000 },
      entities: [
        { id: "c1", name: "Cust", opening: null },
        { id: "v1", name: "Vend", opening: { amountPaise: 30_000, direction: "payable", asOf: "2025-04-01", posted: true } },
      ],
      documents: [invoice],
      entries: [entry("e1", party("c1", "Cust"), bank, 60_000, "2026-11-10", "s1"), entry("e2", party("c1", "Cust"), bank, 50_000, "2026-11-20")],
      today,
    });
    const c1 = [...x.owedToUs, ...x.weOwe, ...x.settled].find((p) => p.entityId === "c1")!;
    expect(c1.documents.map((d) => [d.ref, d.duePaise])).toEqual([["TF/2026-27/0001", 40_000]]);
    expect(c1.openLedgerPaise).toBe(-50_000);
    expect(c1.openLedger.map((l) => [l.date, l.amountPaise, l.ageDays, l.bucket])).toEqual([["2026-11-20", -50_000, 5, "0-30"]]);
    expect(c1.unexplainedPaise).toBe(0);
    expect(x.invoiceAgeing["0-30"]).toBe(40_000);
    expect(x.ledgerAgeing).toEqual({ "0-30": -50_000, "31-60": 0, "61-90": 0, "90+": -30_000 });
  });
});
