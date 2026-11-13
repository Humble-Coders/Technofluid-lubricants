import { describe, expect, it } from "vitest";
import cases from "./sale.cases.json";
import {
  amountInWords,
  companyError,
  financialYear,
  gstRateBp,
  invoiceNumber,
  paidState,
  priceSale,
  saleError,
  salePaymentError,
  SELLER_STATE_CODE,
  type PricedSale,
  type SaleHeaderInput,
  type SaleProduct,
  cleanWalkInBuyer,
  cleanDispatch,
  cleanShipTo,
  dispatchError,
  walkInBuyerError,
} from "./index";

const products = cases.products as unknown as Record<string, SaleProduct>;

/** The fields the cases pin (the rest are copied from the product). */
function project(r: PricedSale) {
  if (!r.ok) return { errors: r.errors };
  const pick = <T extends object>(o: T, keys: (keyof T)[]) => Object.fromEntries(keys.map((k) => [k, o[k]]));
  return {
    lines: r.lines.map((l) => pick(l, ["sku", "qtyMilli", "packPricePaise", "manualPrice", "grossPaise", "discountPaise", "taxablePaise", "gstRateBp", "cgstPaise", "sgstPaise", "igstPaise", "totalPaise"])),
    freight: r.freight,
    totals: pick(r.totals, ["supplyType", "grossPaise", "discountPaise", "taxablePaise", "cgstPaise", "sgstPaise", "igstPaise", "taxPaise", "roundOffPaise", "grandTotalPaise"]),
    missingHsn: r.missingHsn,
  };
}

// The same table runs against the Cloud Functions mirror (office/emulator/tests/sales.test.mjs).
describe("sales rules (sale.cases.json)", () => {
  for (const c of cases.price) {
    it(`price: ${c.case}`, () => {
      const r = priceSale({
        products,
        lines: c.input.lines,
        tier: c.input.tier as "Dealer" | "Distributor",
        sellerStateCode: SELLER_STATE_CODE,
        placeOfSupplyStateCode: c.input.placeOfSupply,
        freightPaise: c.input.freightPaise,
      });
      expect(project(r)).toEqual(c.expect);
    });
  }
  for (const c of cases.header) {
    it(`header: ${c.case}`, () => {
      expect(saleError({ ...cases.headerBase, ...c.input } as SaleHeaderInput, cases.today)).toBe(c.expect);
    });
  }
  for (const c of cases.payment) {
    it(`paid at billing: ${c.case}`, () => {
      expect(salePaymentError(c.customer, c.grand, c.payments)).toBe(c.expect);
    });
  }
  for (const c of cases.dispatch) {
    it(`dispatch: ${c.case}`, () => {
      const d = cleanDispatch(c.dispatch);
      const t = cleanShipTo(c.shipTo);
      expect(dispatchError(d, t, c.isWalkIn === true)).toBe(c.expect);
      if ("cleaned" in c && c.cleaned) expect({ dispatch: d, shipTo: t }).toEqual(c.cleaned);
    });
  }
  for (const c of cases.walkInBuyer) {
    it(`walk-in buyer: ${c.case}`, () => {
      expect(walkInBuyerError(c.walkIn, cleanWalkInBuyer(c.buyer), c.taxable)).toBe(c.expect);
    });
  }
  for (const c of cases.financialYear) {
    it(`financial year of ${c.date}`, () => expect(financialYear(c.date)).toBe(c.expect));
  }
  for (const c of cases.invoiceNumber) {
    it(`invoice number ${c.prefix} ${c.fy} #${c.seq}`, () => {
      if (c.expect === "THROWS") expect(() => invoiceNumber(c.prefix, c.fy, c.seq)).toThrow();
      else expect(invoiceNumber(c.prefix, c.fy, c.seq)).toBe(c.expect);
    });
  }
  for (const c of cases.paid) {
    it(`paid state ${c.paid} of ${c.grand}`, () => expect(paidState(c.grand, c.paid)).toBe(c.expect));
  }
  for (const c of cases.gstRate) {
    it(`GST rate ${c.pct}`, () => expect(gstRateBp(c.pct)).toBe(c.expect));
  }
  for (const c of cases.company) {
    it(`company: ${c.case}`, () => expect(companyError({ ...cases.companyBase, ...c.input })).toBe(c.expect));
  }
  for (const c of cases.words) {
    it(`in words: ${c.paise}`, () => expect(amountInWords(c.paise)).toBe(c.expect));
  }
});

describe("sales rules (extra)", () => {
  it("a 301-character note is too long", () => {
    expect(saleError({ ...(cases.headerBase as SaleHeaderInput), note: "x".repeat(301) }, cases.today)).toBe("NOTE_TOO_LONG");
  });
  it("freight is taxed at the highest goods rate", () => {
    const p = { ...products["HYD-68-26L"]!, sku: "LOW", gstPct: 12 };
    const r = priceSale({
      products: { ...products, LOW: p },
      lines: [{ sku: "LOW", packs: 1, discountBp: 0 }, { sku: "GREASE-MP3-18KG", packs: 1, discountBp: 0 }],
      tier: "Dealer",
      sellerStateCode: SELLER_STATE_CODE,
      placeOfSupplyStateCode: "06",
      freightPaise: 10000,
    });
    expect(r.ok && r.freight?.gstRateBp).toBe(1800);
  });
});
