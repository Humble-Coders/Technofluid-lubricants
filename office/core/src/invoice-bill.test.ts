import { describe, expect, it } from "vitest";
import { ddmmyyyy, hbeCreationDate, inr, packUnitWord, priceSale, ratePct, saleToHbeBill, type InvoiceSale, type SaleProduct } from "./index";

const drum = (sku: string, name: string, hsn: string, pricePaise: number): SaleProduct => ({
  sku,
  name,
  grade: "",
  packLabel: "205 Liter Drum",
  productKey: sku.toLowerCase(),
  packQty: 205,
  baseUnit: "L",
  pricePer: "per barrel",
  dealerPricePaise: pricePaise,
  distributorPricePaise: pricePaise,
  gstPct: 18,
  hsnCode: hsn,
  active: true,
});

// Gaurav's invoice 869 (11-06-2026, Haryana): 4 drum lines, CGST + SGST 9 %, round-off +0.40.
const products = {
  HYD: drum("HYD", "Champion Hyd-68", "27101980", 1_999_000),
  ENG: drum("ENG", "Champion 20w40", "27101990", 1_981_000),
  CUT: drum("CUT", "Champion Cutting Oil", "34039900", 2_932_000),
  LUB: drum("LUB", "Lubricating Oil", "27101980", 1_810_000),
};
const priced = priceSale({
  products,
  lines: [
    { sku: "HYD", packs: 4, discountBp: 0 },
    { sku: "ENG", packs: 4, discountBp: 0 },
    { sku: "CUT", packs: 1, discountBp: 0 },
    { sku: "LUB", packs: 2, discountBp: 0 },
  ],
  tier: "Dealer",
  sellerStateCode: "06",
  placeOfSupplyStateCode: "06",
  freightPaise: 0,
});
if (!priced.ok) throw new Error("test sale didn't price");

const seller: InvoiceSale["seller"] = {
  legalName: "Lube Chem Industries",
  gstin: "06AAACL1234M1ZO",
  stateCode: "06",
  address: { line1: "Near Gaushala Road", line2: "Adjoining Central Warehouse, Matak Majri", city: "Karnal", pincode: "132001" },
  phone: "90000 00001",
  email: null,
};
const sale: InvoiceSale = {
  invoiceNo: "TF/2026-27/0869",
  invoiceDate: "2026-06-11",
  placeOfSupply: "06",
  customer: { name: "Sample Agencies", gstin: "06AAACL1234M1ZO", address: { line1: "12 Sample Market", line2: "", city: "Jagadhri", district: "", pincode: "135003", stateCode: "06" }, isWalkIn: false },
  seller,
  lines: priced.lines,
  freight: null,
  totals: priced.totals,
  note: null,
};
const printedAt = new Date("2026-06-11T06:12:00Z");

describe("formatting for HBE (no locale)", () => {
  it("Indian grouping from paise", () => {
    expect(inr(25_600_000)).toBe("2,56,000.00");
    expect(inr(12_345_678_950)).toBe("12,34,56,789.50");
    expect(inr(-50)).toBe("-0.50");
    expect(inr(0)).toBe("0.00");
    expect(inr(99_999)).toBe("999.99");
    expect(() => inr(1.5)).toThrow();
  });
  it("dates, rates, units, creation time in India", () => {
    expect(ddmmyyyy("2026-11-06")).toBe("06-11-2026");
    expect(ratePct(1800)).toBe("18%");
    expect(ratePct(250)).toBe("2.5%");
    expect(packUnitWord("210 L barrel (drum)")).toBe("Drum");
    expect(packUnitWord("20x1 liter case")).toBe("Case");
    expect(packUnitWord("4 x 5 kg")).toBe("Case");
    expect(packUnitWord("26 Ltr Can")).toBe("Can");
    expect(packUnitWord("18 kg bucket")).toBe("Bkt");
    expect(packUnitWord("1 litre bottle")).toBe("Pcs");
    expect(hbeCreationDate(printedAt)).toEqual({ year: 2026, month: 6, day: 11, hour: 11, minute: 42, second: 0, utcOffsetMinutes: 330 });
  });
});

describe("a sale → bill data (Gaurav's invoice 869)", () => {
  const bill = saleToHbeBill(sale, { copyLabel: "Triplicate Copy", buyerPhones: ["90000 00000"], printedAt, terms: ["E.& O.E.", "1. Goods once sold will not be taken back."], bank: { name: "HDFC BANK", branch: "INDRI", accountType: "CA", accountNo: "0000000000", ifsc: "HDFC0000001" } });
  const f = bill.fields;

  it("totals match the printed invoice to the paisa", () => {
    expect(f.taxableValue).toBe("2,24,720.00");
    expect([f["tax1.label"], f["tax1.rate"], f["tax1.amount"]]).toEqual(["Add : CGST", "@ 9.00 %", "20,224.80"]);
    expect([f["tax2.label"], f["tax2.rate"], f["tax2.amount"]]).toEqual(["Add : SGST", "@ 9.00 %", "20,224.80"]);
    expect([f["roundOff.label"], f["roundOff.amount"]]).toEqual(["Add : Rounded Off (+)", "0.40"]);
    expect(f.grandTotal).toBe("₹ 2,65,170.00");
    expect(f.totalQty).toBe("11.00 Drum");
    expect(f.amountInWords).toBe("Rupees Two Lakh Sixty Five Thousand One Hundred Seventy Only");
    expect([f["taxSummary.rate"], f["taxSummary.taxable"], f["taxSummary.cgst"], f["taxSummary.sgst"], f["taxSummary.total"]]).toEqual(["18%", "2,24,720.00", "20,224.80", "20,224.80", "40,449.60"]);
  });

  it("lines, header and parties as printed", () => {
    expect(bill.rows).toHaveLength(4);
    expect(bill.rows[0]!.cells).toMatchObject({ slNo: "1.", hsn: "27101980", qty: "4.00", unit: "Drum", rate: "19,990.00", amount: "79,960.00" });
    expect(f.invoiceDate).toBe("11-06-2026");
    expect(f.placeOfSupply).toBe("Haryana (06)");
    expect(f["seller.panLine"]).toBe("PAN : AAACL1234M");
    expect(f["buyer.statePin"]).toBe("HARYANA-135003");
    expect(f["buyer.mobile"]).toBe("90000 00000");
    expect(f["shipTo.name"]).toBe("Sample Agencies");
    expect(f.terms).toBe("E.& O.E.\n1. Goods once sold will not be taken back.");
    expect(f["bank.line2"]).toBe("Account No: 0000000000, IFSC Code: HDFC0000001");
    expect(bill.flags).toEqual({ isInterState: false, hasIrn: false, hasNotes: false, hasBank: true });
  });

  it("every field is a string (HBE refuses numbers and booleans in fields)", () => {
    for (const [k, v] of Object.entries(f)) expect(typeof v, k).toBe("string");
  });
});

describe("other cases", () => {
  it("inter-state: IGST only, SGST line blank; a discount shows under the product; freight is a row", () => {
    const p = priceSale({ products, lines: [{ sku: "HYD", packs: 2, discountBp: 500 }], tier: "Dealer", sellerStateCode: "06", placeOfSupplyStateCode: "22", freightPaise: 120_000 });
    if (!p.ok) throw new Error("no");
    const b = saleToHbeBill({ ...sale, placeOfSupply: "22", lines: p.lines, freight: p.freight, totals: p.totals, note: "2 EMPTY DRUMS RETURNABLE" }, { copyLabel: "Original Copy", printedAt });
    expect(b.fields["tax1.label"]).toBe("Add : IGST");
    expect(b.fields["tax1.rate"]).toBe("@ 18.00 %");
    expect(b.fields["tax2.label"]).toBe("");
    expect(b.fields.placeOfSupply).toBe("Chhattisgarh (22)");
    expect(b.rows[1]!.cells).toMatchObject({ description: "Freight charges", amount: "1,200.00" });
    const d = b.rows[0]!.cells.description;
    expect(typeof d === "object" && d.runs[1]!.text).toBe("\n205 Liter Drum · Less 5% discount (1,999.00)");
    expect(b.rows[0]!.cells.amount).toBe("37,981.00");
    expect(b.flags).toMatchObject({ isInterState: true, hasNotes: true, hasBank: false });
  });

  it("a walk-in prints the buyer typed at billing; a negative round-off prints as Less", () => {
    const b = saleToHbeBill(
      { ...sale, customer: { name: "Walk-in / cash customer", gstin: null, address: null, isWalkIn: true, buyer: { name: "Ravi Kumar", phone: "98765 43210", address: "Sector 12, Panipat" } }, totals: { ...sale.totals, roundOffPaise: -6 } },
      { copyLabel: "Original Copy", printedAt },
    );
    expect(b.fields["buyer.name"]).toBe("Ravi Kumar");
    expect(b.fields["buyer.address"]).toBe("Sector 12, Panipat");
    expect(b.fields["buyer.mobile"]).toBe("98765 43210");
    expect(b.fields["buyer.gstin"]).toBe("");
    expect(b.fields["buyer.pan"]).toBe("");
    expect([b.fields["roundOff.label"], b.fields["roundOff.amount"]]).toEqual(["Less : Rounded Off (-)", "0.06"]);
  });

  it("dispatch details and a ship-to address print from the sale", () => {
    const b = saleToHbeBill(
      { ...sale, dispatch: { transport: "Sample Cargo", vehicleNo: "HR99X0001", station: "Raipur", ewayBillNo: "300000000002" }, shipTo: { name: "Sample Godown", address: "Sample Road", city: "Raipur", pincode: "492099", stateCode: "22", gstin: "22AAACL1234M1ZU" } },
      { copyLabel: "Original Copy", printedAt, buyerPhones: ["90000 00000"] },
    );
    expect([b.fields.transport, b.fields.vehicleNo, b.fields.station, b.fields.ewayBillNo]).toEqual(["Sample Cargo", "HR99X0001", "Raipur", "300000000002"]);
    expect([b.fields["shipTo.name"], b.fields["shipTo.address"], b.fields["shipTo.statePin"], b.fields["shipTo.gstin"], b.fields["shipTo.pan"], b.fields["shipTo.mobile"]]).toEqual(["Sample Godown", "Sample Road, Raipur", "CHHATTISGARH-492099", "22AAACL1234M1ZU", "AAACL1234M", ""]);
    // The billed-to side and the GST are unchanged.
    expect(b.fields["buyer.name"]).toBe("Sample Agencies");
    expect(b.fields.placeOfSupply).toBe("Haryana (06)");
    expect(b.fields["tax1.label"]).toBe("Add : CGST");
  });

  it("an older sale with no dispatch details prints those lines blank; ship-to is the buyer", () => {
    const b = saleToHbeBill(sale, { copyLabel: "Original Copy", printedAt });
    expect([b.fields.transport, b.fields.vehicleNo, b.fields.station, b.fields.ewayBillNo]).toEqual(["", "", "", ""]);
    expect(b.fields["shipTo.name"]).toBe("Sample Agencies");
  });

  it("e-invoice details, once connected, fill the IRN line", () => {
    const b = saleToHbeBill(sale, { copyLabel: "Original Copy", printedAt, eInvoice: { irn: "abc123", ackNo: "100000000000001", ackDate: "2026-06-11" } });
    expect(b.fields.irnLine).toBe("IRN : abc123");
    expect(b.fields.ackLine).toBe("Ack.No. : 100000000000001  ·  Ack. Date : 11-06-2026");
    expect(b.flags.hasIrn).toBe(true);
  });
});
