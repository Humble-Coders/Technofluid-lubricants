import { saleToHbeBill, type CompanyProfile, type InvoiceExtras } from "@technofluid/core";
import type { InvoicePdfResult } from "../../../shared/ipc";
import type { SaleRow } from "./saleService";

/**
 * Invoice PDFs: builds the bill data from a saved sale (office/core saleToHbeBill — the
 * figures are the sale's own, frozen at billing) and asks the desktop app's PDF maker
 * (Humble Bill Engine) for the PDF. Only works inside the desktop app.
 */

export const pdfAvailable = () => typeof window !== "undefined" && Boolean(window.office?.invoicePdf);

/** Whether this copy of the app can make PDFs (the PDF maker is installed), with the reason when not. */
export async function pdfReady(): Promise<{ ready: boolean; reason: string | null }> {
  if (!window.office?.invoicePdfReady) return { ready: false, reason: "PDFs are made by the desktop app." };
  return window.office.invoicePdfReady();
}

/**
 * The bank details and terms to print: those frozen on the sale when it was billed. Sales
 * made before they were frozen have neither key, and use the current Settings instead.
 */
export function needsLiveCompany(sale: SaleRow): boolean {
  return !("bank" in sale.seller) && !("invoiceTerms" in sale.seller);
}

export interface InvoicePdfOptions {
  copyLabel: string;
  action: "save" | "open";
  /** The current company settings — used only for an older sale with no bank/terms frozen on it. */
  company: CompanyProfile | null;
  /** The buyer's phones, from their customer record. */
  buyerPhones: string[];
}

export async function invoicePdf(sale: SaleRow, o: InvoicePdfOptions): Promise<InvoicePdfResult> {
  if (!window.office?.invoicePdf) return { ok: false, type: "NotDesktop", message: "PDFs are made by the desktop app." };
  const extras: InvoiceExtras = {
    copyLabel: o.copyLabel,
    buyerPhones: o.buyerPhones,
    bank: needsLiveCompany(sale) ? (o.company?.bank ?? null) : (sale.seller.bank ?? null),
    terms: needsLiveCompany(sale) ? (o.company?.invoiceTerms ?? []) : (sale.seller.invoiceTerms ?? []),
    printedAt: new Date(),
  };
  const bill = saleToHbeBill(
    {
      invoiceNo: sale.invoiceNo,
      invoiceDate: sale.invoiceDate,
      placeOfSupply: sale.placeOfSupply,
      customer: sale.customer,
      seller: sale.seller,
      lines: sale.lines,
      freight: sale.freight,
      totals: sale.totals,
      note: sale.note,
      dispatch: sale.dispatch,
      shipTo: sale.shipTo,
    },
    extras,
  );
  return window.office.invoicePdf({ bill, fileName: `${sale.invoiceNo} ${o.copyLabel}`, action: o.action });
}

/** What to tell the person when the PDF maker refuses (first line only; HBE's guide). */
export function pdfProblemText(r: Extract<InvoicePdfResult, { ok: false }>): string {
  switch (r.type) {
    case "MissingRequiredField":
      return `Can't make the PDF: "${r.field ?? "a required field"}" is empty on this invoice.`;
    case "UnrenderableText":
      return `Can't make the PDF: some text can't be printed (only English letters work) — ${r.message}`;
    case "HelperMissing":
      return "The PDF maker isn't installed with this copy of the app.";
    case "TemplateUnavailable":
      return "The invoice layout isn't installed with this copy of the app.";
    default:
      return `Couldn't make the PDF: ${r.message}`;
  }
}
