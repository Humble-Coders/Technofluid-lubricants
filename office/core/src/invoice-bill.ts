/**
 * A saved sale → the bill data the Humble Bill Engine (HBE) prints with the
 * `technofluid-tax-invoice` template (contract 1). The layout is Gaurav's current tax
 * invoice; the field list is office/hbe/DATA-CONTRACT.md.
 *
 * HBE only places text: every value here is a finished string, formatted exactly as it
 * prints, from integer paise (never floats, never the machine's locale — HBE refuses a
 * number in `fields`, and a locale format would differ between computers). The invoice
 * number and date come from the sale record, never from the clock.
 *
 * Pure — no Firebase, no UI. Tested in invoice-bill.test.ts.
 */
import { GST_STATES, type SupplyType } from "./gst";
import { amountInWords, type PricedSaleLine, type SaleDispatch, type SaleFreight, type SaleShipTo, type SaleTotals, type WalkInBuyer } from "./sale";
import type { EntityAddress } from "./entity";

export const HBE_INVOICE_TEMPLATE = { name: "technofluid-tax-invoice", contract: 1 } as const;

/** The three copies Gaurav prints, each rendered once with its label. */
export const INVOICE_COPIES = ["Original Copy", "Duplicate Copy", "Triplicate Copy"] as const;

// ─── Formatting (no locale anywhere) ─────────────────────────────────────────────

/** 25600000 → "2,56,000.00" (Indian grouping, 2 decimals, no symbol); negative → "-0.50". */
export function inr(paise: number): string {
  if (!Number.isInteger(paise)) throw new RangeError(`Paise must be a whole number, was ${paise}`);
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const rupees = String(Math.floor(abs / 100));
  const p = String(abs % 100).padStart(2, "0");
  const last3 = rupees.slice(-3);
  const rest = rupees.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return `${neg ? "-" : ""}${grouped}.${p}`;
}

/** "2026-11-06" → "06-11-2026" — straight from the calendar date, never through a time zone. */
export function ddmmyyyy(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) throw new RangeError(`Bad date ${ymd}`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** 900 → "9.00" (a GST rate in basis points, two decimals). */
const pct2 = (bp: number) => `${Math.floor(bp / 100)}.${String(bp % 100).padStart(2, "0")}`;
/** 1800 → "18%", 250 → "2.5%". */
export function ratePct(bp: number): string {
  const whole = Math.floor(bp / 100);
  const frac = bp % 100;
  return frac ? `${whole}.${String(frac).replace(/0$/, "")}%` : `${whole}%`;
}

/** The moment of printing, in India time, as HBE's creationDate (HBE has no clock). */
export function hbeCreationDate(at: Date, utcOffsetMinutes = 330) {
  const t = new Date(at.getTime() + utcOffsetMinutes * 60_000);
  return {
    year: t.getUTCFullYear(),
    month: t.getUTCMonth() + 1,
    day: t.getUTCDate(),
    hour: t.getUTCHours(),
    minute: t.getUTCMinutes(),
    second: t.getUTCSeconds(),
    utcOffsetMinutes,
  };
}

/** The word printed in the Unit column for one pack: "26 Ltr Can" → "Can", "210 L barrel (drum)" → "Drum". */
export function packUnitWord(packLabel: string): string {
  const l = packLabel.toLowerCase();
  if (/drum|barrel/.test(l)) return "Drum";
  if (/bucket|bkt|pail/.test(l)) return "Bkt";
  if (/case|carton|box|\d\s*[x×]\s*\d/.test(l)) return "Case";
  if (/\bjar\b/.test(l)) return "Jar";
  if (/\bcan\b|\bcane\b|\btin\b/.test(l)) return "Can";
  return "Pcs";
}

// ─── The input: what the invoice needs from our records ───────────────────────────

/** The saved sale (sales/{id}), as much of it as the invoice prints. */
export interface InvoiceSale {
  invoiceNo: string;
  invoiceDate: string;
  placeOfSupply: string;
  customer: { name: string; gstin: string | null; address: EntityAddress | null; isWalkIn: boolean; buyer?: WalkInBuyer | null };
  seller: { legalName: string; gstin: string; stateCode: string; address: { line1: string; line2: string; city: string; pincode: string }; phone: string | null; email: string | null };
  lines: PricedSaleLine[];
  freight: SaleFreight | null;
  totals: SaleTotals;
  note: string | null;
  /** Transport, vehicle, station, e-way bill — as entered at billing (older sales: none). */
  dispatch?: SaleDispatch | null;
  /** Where the goods went, when not the billing address (older sales: none). */
  shipTo?: SaleShipTo | null;
}

/** What the invoice prints that the sale itself doesn't hold (company settings, phones, e-invoice). */
export interface InvoiceExtras {
  /** "Original Copy" / "Duplicate Copy" / "Triplicate Copy". */
  copyLabel: string;
  /** The buyer's phone numbers (from their customer record). */
  buyerPhones?: string[];
  bank?: { name: string; branch: string; accountType: string; accountNo: string; ifsc: string } | null;
  /** Terms & conditions, one per line, printed as written. */
  terms?: string[];
  /** Filled once e-invoicing is connected; the QR image goes to HBE separately (images.irnQr). */
  eInvoice?: { irn: string; ackNo: string; ackDate: string } | null;
  /** When it is printed (HBE's creationDate). */
  printedAt: Date;
}

export type HbeCell = string | { runs: { text: string; font?: "regular" | "bold" | "italic" | "boldItalic"; sizePt?: number }[]; align?: "left" | "center" | "right" };

export interface HbeBill {
  creationDate: ReturnType<typeof hbeCreationDate>;
  fields: Record<string, string>;
  flags: Record<string, boolean>;
  rows: { style: string; cells: Record<string, HbeCell> }[];
}

// ─── The mapping ──────────────────────────────────────────────────────────────────

const stateName = (code: string | null | undefined) => (code && GST_STATES[code]) || "";
const oneLine = (parts: (string | null | undefined)[]) => parts.map((p) => (p ?? "").trim()).filter(Boolean).join(", ");
/** PAN = characters 3–12 of a GSTIN. */
const panOf = (gstin: string | null | undefined) => (gstin && gstin.length === 15 ? gstin.slice(2, 12) : "");

/** "CHHATTISGARH-492099" (state in capitals, then the PIN), as Gaurav's invoices print it. */
function statePin(a: EntityAddress | null): string {
  if (!a) return "";
  const s = stateName(a.stateCode).toUpperCase();
  return [s, a.pincode?.trim()].filter(Boolean).join("-");
}

function party(prefix: string, name: string, address: EntityAddress | null, gstin: string | null, phones: string[]) {
  return {
    [`${prefix}.name`]: name,
    [`${prefix}.address`]: address ? oneLine([address.line1, address.line2, address.city]) : "",
    [`${prefix}.statePin`]: statePin(address),
    [`${prefix}.pan`]: panOf(gstin),
    [`${prefix}.mobile`]: phones.join(", "),
    [`${prefix}.aadhaar`]: "",
    [`${prefix}.gstin`]: gstin ?? "",
  };
}

/** One tax-summary column: one line per GST rate, joined with "\n" so the columns line up. */
const col = (rows: SaleTotals["byRate"], f: (r: SaleTotals["byRate"][number]) => string) => rows.map(f).join("\n");

/**
 * The bill data for one copy of one invoice. Throws on a sale that can't be printed
 * truthfully (no lines, totals missing) — those are bugs, not something to print around.
 */
export function saleToHbeBill(sale: InvoiceSale, x: InvoiceExtras): HbeBill {
  if (sale.lines.length === 0) throw new RangeError(`${sale.invoiceNo} has no lines`);
  const tot = sale.totals;
  const inter: boolean = (tot.supplyType as SupplyType) === "INTER_STATE";

  // The buyer: a walk-in prints the name and address typed at billing.
  const walkIn = sale.customer.isWalkIn && sale.customer.buyer ? sale.customer.buyer : null;
  const buyerName = walkIn?.name ?? sale.customer.name;
  const buyerAddress: EntityAddress | null = walkIn?.address
    ? { line1: walkIn.address, line2: "", city: "", district: "", pincode: "", stateCode: sale.placeOfSupply }
    : sale.customer.address;
  const phones = walkIn?.phone ? [walkIn.phone] : (x.buyerPhones ?? []);
  const billed = party("buyer", buyerName, buyerAddress, sale.customer.gstin, phones);
  const t = sale.shipTo;
  const ship = t
    ? party("shipTo", t.name, { line1: t.address ?? "", line2: "", city: t.city ?? "", district: "", pincode: t.pincode ?? "", stateCode: t.stateCode }, t.gstin, [])
    : party("shipTo", buyerName, buyerAddress, sale.customer.gstin, phones);

  // Lines: product, pack and any discount underneath; price per pack; amount after discount.
  const rows: HbeBill["rows"] = sale.lines.map((l, i) => {
    const under = [l.packLabel, l.discountPaise > 0 ? `Less ${ratePct(l.discountBp)} discount (${inr(l.discountPaise)})` : ""].filter(Boolean).join(" · ");
    return {
      style: "item",
      cells: {
        slNo: `${i + 1}.`,
        description: { runs: [{ text: l.productName }, ...(under ? [{ text: `\n${under}`, font: "italic" as const, sizePt: 7 }] : [])] },
        hsn: l.hsnCode ?? "",
        qty: `${l.packs}.00`,
        unit: packUnitWord(l.packLabel),
        rate: inr(l.packPricePaise),
        amount: inr(l.taxablePaise),
      },
    };
  });
  if (sale.freight) {
    rows.push({ style: "item", cells: { slNo: `${rows.length + 1}.`, description: "Freight charges", hsn: "", qty: "", unit: "", rate: "", amount: inr(sale.freight.taxablePaise) } });
  }

  // Total quantity with its unit ("11.00 Drum"), or "Units" when the packs differ.
  const units = new Set(sale.lines.map((l) => packUnitWord(l.packLabel)));
  const packs = sale.lines.reduce((s, l) => s + l.packs, 0);
  const totalQty = `${packs}.00 ${units.size === 1 ? [...units][0] : "Units"}`;

  // Tax lines: one rate prints next to the tax ("@ 9.00 %"); several rates are in the summary below.
  const oneRate = tot.byRate.length === 1 ? tot.byRate[0]!.gstRateBp : null;
  const tax = inter
    ? { "tax1.label": "Add : IGST", "tax1.rate": oneRate !== null ? `@ ${pct2(oneRate)} %` : "", "tax1.amount": inr(tot.igstPaise), "tax2.label": "", "tax2.rate": "", "tax2.amount": "" }
    : {
        "tax1.label": "Add : CGST",
        "tax1.rate": oneRate !== null ? `@ ${pct2(oneRate / 2)} %` : "",
        "tax1.amount": inr(tot.cgstPaise),
        "tax2.label": "Add : SGST",
        "tax2.rate": oneRate !== null ? `@ ${pct2(oneRate / 2)} %` : "",
        "tax2.amount": inr(tot.sgstPaise),
      };
  const roundOff =
    tot.roundOffPaise > 0
      ? { "roundOff.label": "Add : Rounded Off (+)", "roundOff.amount": inr(tot.roundOffPaise) }
      : tot.roundOffPaise < 0
        ? { "roundOff.label": "Less : Rounded Off (-)", "roundOff.amount": inr(-tot.roundOffPaise) }
        : { "roundOff.label": "", "roundOff.amount": "" };

  const s = sale.seller;
  const bank = x.bank;
  const e = x.eInvoice ?? null;
  const d = sale.dispatch ?? null;
  const fields: Record<string, string> = {
    copyLabel: x.copyLabel,
    "seller.name": s.legalName,
    "seller.gstin": s.gstin,
    "seller.address": oneLine([s.address.line1, s.address.line2, s.address.city]),
    "seller.panLine": panOf(s.gstin) ? `PAN : ${panOf(s.gstin)}` : "",
    "seller.contactLine": [s.phone ? `Tel. : ${s.phone}` : "", s.email ? `email : ${s.email}` : ""].filter(Boolean).join("  ·  "),
    invoiceNo: sale.invoiceNo,
    invoiceDate: ddmmyyyy(sale.invoiceDate),
    placeOfSupply: `${stateName(sale.placeOfSupply)} (${sale.placeOfSupply})`,
    reverseCharge: "N",
    transport: d?.transport ?? "",
    vehicleNo: d?.vehicleNo ?? "",
    station: d?.station ?? "",
    ewayBillNo: d?.ewayBillNo ?? "",
    ...billed,
    ...ship,
    irnLine: e ? `IRN : ${e.irn}` : "",
    ackLine: e ? `Ack.No. : ${e.ackNo}  ·  Ack. Date : ${ddmmyyyy(e.ackDate)}` : "",
    notes: sale.note ?? "",
    taxableValue: inr(tot.taxablePaise),
    ...tax,
    ...roundOff,
    totalQty,
    grandTotal: `₹ ${inr(tot.grandTotalPaise)}`,
    "taxSummary.rate": col(tot.byRate, (r) => ratePct(r.gstRateBp)),
    "taxSummary.taxable": col(tot.byRate, (r) => inr(r.taxablePaise)),
    "taxSummary.cgst": col(tot.byRate, (r) => inr(r.cgstPaise)),
    "taxSummary.sgst": col(tot.byRate, (r) => inr(r.sgstPaise)),
    "taxSummary.igst": col(tot.byRate, (r) => inr(r.igstPaise)),
    "taxSummary.total": col(tot.byRate, (r) => inr(r.cgstPaise + r.sgstPaise + r.igstPaise)),
    amountInWords: amountInWords(tot.grandTotalPaise),
    "bank.line1": bank ? `Bank Name: ${bank.name}, Branch: ${bank.branch}  ·  Account Type: ${bank.accountType}` : "",
    "bank.line2": bank ? `Account No: ${bank.accountNo}, IFSC Code: ${bank.ifsc}` : "",
    terms: (x.terms ?? []).join("\n"),
    signatoryFor: `For ${s.legalName}`,
  };

  return {
    creationDate: hbeCreationDate(x.printedAt),
    fields,
    flags: { isInterState: inter, hasIrn: Boolean(e), hasNotes: Boolean(sale.note?.trim()), hasBank: Boolean(bank) },
    rows,
  };
}
