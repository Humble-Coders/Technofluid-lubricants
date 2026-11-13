import { describe, expect, it } from "vitest";
import cases from "./purchase.cases.json";
import {
  billNoKey,
  pricePurchase,
  purchaseError,
  purchaseFinancialYear,
  purchaseRef,
  purchaseTotalsError,
  suggestRoundOff,
  supplierGstState,
  type PricedPurchase,
  type PurchaseHeaderInput,
  type PurchaseItem,
  type PurchaseTotals,
} from "./index";

const items = cases.items as unknown as Record<string, PurchaseItem>;

/** The fields the cases pin (byRate only where a case gives it). */
function project(r: PricedPurchase, withByRate: boolean) {
  if (!r.ok) return { errors: r.errors };
  const { byRate, ...totals } = r.totals;
  return {
    lines: r.lines.map(({ itemName: _n, itemKind: _k, baseUnit: _u, ...l }) => l),
    freight: r.freight,
    totals,
    ...(withByRate ? { byRate } : {}),
  };
}

// The same table runs against the Cloud Functions mirror (office/emulator/tests/purchases.test.mjs).
describe("purchase rules (purchase.cases.json)", () => {
  for (const c of cases.price) {
    it(`price: ${c.case}`, () => {
      const r = pricePurchase({
        items,
        lines: c.input.lines,
        freightPaise: c.input.freightPaise,
        supplierStateCode: c.input.supplierState,
        sellerStateCode: cases.seller,
        roundOffPaise: c.input.roundOffPaise,
      });
      expect(project(r, "byRate" in c.expect)).toEqual(c.expect);
    });
  }
  for (const c of cases.header) {
    it(`header: ${c.case}`, () => {
      expect(purchaseError({ ...cases.headerBase, ...c.input } as PurchaseHeaderInput, cases.today)).toBe(c.expect);
    });
  }
  for (const c of cases.totals) {
    it(`totals: ${c.case}`, () => {
      expect(purchaseTotalsError(c.totals as PurchaseTotals, c.supplierTotal, c.payments)).toBe(c.expect);
    });
  }
  it("references, bill-number keys, round-off, financial year", () => {
    for (const c of cases.refs) expect(purchaseRef(c.fy, c.seq)).toBe(c.expect);
    for (const c of cases.billNoKeys) expect(billNoKey(c.in)).toBe(c.expect);
    for (const c of cases.roundOff) expect(suggestRoundOff(c.exact)).toBe(c.expect);
    for (const c of cases.fy) expect(purchaseFinancialYear(c.date)).toBe(c.expect);
  });
});

describe("purchase helpers", () => {
  it("a supplier's GST state comes from a valid GSTIN only", () => {
    expect(supplierGstState("06AAACL1234M1ZO")).toBe("06");
    expect(supplierGstState("06AAACL1234M1ZX")).toBeNull();
    expect(supplierGstState(null)).toBeNull();
  });
  it("refuses a bad reference", () => {
    expect(() => purchaseRef("2026", 1)).toThrow();
    expect(() => purchaseRef("2026-27", 0)).toThrow();
  });
  it("the round-off makes the bill total and the books balance", () => {
    const r = pricePurchase({ items, lines: [{ itemId: "rm_base", qtyMilli: 1500, taxablePaise: 12345, gstRateBp: 1800 }], freightPaise: 0, supplierStateCode: "06", sellerStateCode: "06", roundOffPaise: -67 });
    if (!r.ok) throw new Error("should price");
    expect(r.totals.subtotalPaise + r.totals.taxPaise).toBe(r.totals.billTotalPaise);
  });
});
