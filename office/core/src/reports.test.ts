import { describe, expect, it } from "vitest";
import cases from "./reports.cases.json";
import {
  ageBucket,
  ageDays,
  documentDue,
  milliCsv,
  moneyOwed,
  mulDivRound,
  openDocumentsFrom,
  paidLaterPaise,
  paiseCsv,
  salesByProduct,
  stockValue,
  toCsv,
  type OpenDocumentInput,
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
