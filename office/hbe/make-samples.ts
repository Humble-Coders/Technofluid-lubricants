/**
 * Writes the sample bills for the technofluid-tax-invoice template (office/hbe/samples/),
 * from the same mapping the app uses (office/core/src/invoice-bill.ts), so samples and app
 * can't drift. Buyers are made up; the seller's bank details are placeholders (the real
 * ones go into Settings → Company details).
 *
 *   cd office/core && npx vite-node ../hbe/make-samples.ts
 *
 * Use them in the HBE Console (Samples tab) and as the Probe bill for template sync.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { priceSale, saleToHbeBill, type InvoiceExtras, type InvoiceSale, type SaleLineInput, type SaleProduct } from "../core/src/index";

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "samples");

const product = (sku: string, name: string, grade: string, packLabel: string, packQty: number, pricePer: string, pricePaise: number, hsn: string | null): SaleProduct => ({
  sku, name, grade, packLabel, productKey: sku.toLowerCase(), packQty, baseUnit: "L", pricePer,
  dealerPricePaise: pricePaise, distributorPricePaise: pricePaise, gstPct: 18, hsnCode: hsn, active: true,
});

const P: Record<string, SaleProduct> = {
  HYD205: product("HYD205", "Champion Hyd", "68", "205 Liter Drum", 205, "per barrel", 1_999_000, "27101980"),
  ENG205: product("ENG205", "Champion", "20W-40", "205 Liter Drum", 205, "per barrel", 1_981_000, "27101990"),
  CUT205: product("CUT205", "Champion Cutting Oil", "", "205 Liter Drum", 205, "per barrel", 2_932_000, "34039900"),
  GEAR26: product("GEAR26", "Gear Oil", "320", "26 Ltr Can", 26, "per litre", 11_077, "27101980"),
  HYD26: product("HYD26", "Hydraulic Oil", "AW-68", "26 Ltr Can", 26, "per litre", 10_538, "27101980"),
  GRS18: product("GRS18", "Grease", "GGR Red", "18 kg bucket", 18, "per bucket", 173_000, "27101980"),
  MC4T: product("MC4T", "4T Engine Oil", "20W-40", "20x900 ml case", 18, "per piece", 5_455, "27101990"),
  LONGNAME: product("LONGNAME", "Premium Synthetic Heavy Duty Diesel Engine Oil for Construction and Mining Equipment", "15W-40 CI-4 Plus", "210 L barrel (drum)", 210, "per barrel", 4_550_000, null),
};

const seller: InvoiceSale["seller"] = {
  legalName: "Lube Chem Industries",
  gstin: "06AAAFS1234K1ZF",
  stateCode: "06",
  address: { line1: "Near Gaushala Road Adjoining Central", line2: "Ware House Matak Majri", city: "Karnal", pincode: "132001" },
  phone: "90000 00000, 90000 00001",
  email: "accounts@example.com",
};
const extras: InvoiceExtras = {
  copyLabel: "Triplicate Copy",
  buyerPhones: ["98000 00001"],
  bank: { name: "HDFC BANK", branch: "INDRI", accountType: "CA", accountNo: "00000000000000", ifsc: "HDFC0000000" },
  terms: ["E.& O.E.", "1. Goods once sold will not be taken back.", "2. Interest @ 18% p.a. will be charged if the payment is not made within the stipulated time.", "3. Subject to 'Haryana' Jurisdiction only."],
  printedAt: new Date("2026-06-11T06:12:00Z"),
};
const haryanaBuyer = { name: "Sample Agencies", gstin: "06AAACL1234M1ZO", address: { line1: "12 Sample Market", line2: "", city: "Jagadhri", district: "", pincode: "135003", stateCode: "06" }, isWalkIn: false };
const raipurBuyer = { name: "Sample Trading Company", gstin: "22AAACL1234M1ZU", address: { line1: "Plot 9, Sample Industrial Area", line2: "", city: "Raipur", district: "", pincode: "492099", stateCode: "22" }, isWalkIn: false };

function sale(no: string, customer: InvoiceSale["customer"], lines: SaleLineInput[], opts: { freightPaise?: number; note?: string | null; dispatch?: InvoiceSale["dispatch"]; shipTo?: InvoiceSale["shipTo"] } = {}): InvoiceSale {
  const pos = customer.isWalkIn ? "06" : customer.address!.stateCode!;
  const p = priceSale({ products: P, lines, tier: "Dealer", sellerStateCode: "06", placeOfSupplyStateCode: pos, freightPaise: opts.freightPaise ?? 0 });
  if (!p.ok) throw new Error(`${no}: ${JSON.stringify(p.errors)}`);
  return {
    invoiceNo: no, invoiceDate: "2026-06-11", placeOfSupply: pos, customer, seller, lines: p.lines, freight: p.freight, totals: p.totals, note: opts.note ?? null,
    dispatch: opts.dispatch === undefined ? { transport: "NONE", vehicleNo: "HR45X0000", station: "JAGADHRI", ewayBillNo: null } : opts.dispatch,
    shipTo: opts.shipTo ?? null,
  };
}

const samples: Record<string, ReturnType<typeof saleToHbeBill>> = {
  // Like invoice 869: four drums, Haryana, CGST + SGST, round-off, an e-invoice. Also the Probe bill.
  typical: saleToHbeBill(sale("TF/2026-27/0869", haryanaBuyer, [
    { sku: "HYD205", packs: 4, discountBp: 0 }, { sku: "ENG205", packs: 4, discountBp: 0 }, { sku: "CUT205", packs: 1, discountBp: 0 }, { sku: "GRS18", packs: 10, discountBp: 0 },
  ]), { ...extras, eInvoice: { irn: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", ackNo: "100000000000001", ackDate: "2026-06-11" } }),
  // Like invoice 704: inter-state (IGST), a discount, freight, a note, an e-invoice.
  "igst-einvoice": saleToHbeBill(sale("TF/2026-27/0704", raipurBuyer, [
    { sku: "GEAR26", packs: 2, discountBp: 0 }, { sku: "HYD26", packs: 20, discountBp: 500 }, { sku: "MC4T", packs: 2, discountBp: 0 },
  ], {
    freightPaise: 120_000, note: "2 EMPTY DRUMS RETURNABLE",
    dispatch: { transport: "SAMPLE CARGO", vehicleNo: null, station: "Raipur", ewayBillNo: "300000000003" },
    shipTo: { name: "Sample Trading Company Godown", address: "Plot 7, Transport Nagar", city: "Raipur", pincode: "492001", stateCode: "22", gstin: null },
  }), {
    ...extras, copyLabel: "Original Copy",
    eInvoice: { irn: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210", ackNo: "100000000000002", ackDate: "2026-06-11" },
  }),
  // Like invoice 863: walk-in, no GSTIN, no e-invoice.
  "walk-in": saleToHbeBill(sale("TF/2026-27/0863", { name: "Walk-in / cash customer", gstin: null, address: null, isWalkIn: true, buyer: { name: "Ravi Kumar", phone: "98765 43210", address: "Shop 4, Sample Bazaar, Charki Dadri" } }, [
    { sku: "MC4T", packs: 5, discountBp: 0 },
  ], { dispatch: { transport: "SAMPLE TRANSPORT", vehicleNo: null, station: null, ewayBillNo: null } }), { ...extras, buyerPhones: [] }),
  // 42 lines — runs onto further pages (header and footer repeat, "Page 2 of 3").
  long: saleToHbeBill(sale("TF/2026-27/0900", haryanaBuyer, Array.from({ length: 42 }, (_, i) => ({ sku: ["HYD26", "GEAR26", "MC4T", "GRS18", "HYD205", "ENG205"][i % 6]!, packs: 1 + (i % 4), discountBp: i % 5 === 0 ? 250 : 0 })), { note: "Long sample: 42 lines" }), extras),
  // Longest name, no HSN, a big amount (crores).
  "long-values-big-amount": saleToHbeBill(sale("TF/2026-27/9999", raipurBuyer, [
    { sku: "LONGNAME", packs: 300, discountBp: 0 }, { sku: "CUT205", packs: 150, discountBp: 1250 },
  ], { freightPaise: 9_999_900 }), extras),
};

for (const [name, bill] of Object.entries(samples)) {
  writeFileSync(path.join(out, `${name}.json`), `${JSON.stringify(bill, null, 2)}\n`);
  console.log(`${name}: ${bill.rows.length} rows, ${bill.fields.grandTotal}`);
}
