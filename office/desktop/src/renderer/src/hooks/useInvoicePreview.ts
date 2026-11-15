import { useEffect, useState } from "react";
import { useEntities } from "@/hooks/useEntities";
import { useCompany } from "@/hooks/useSales";
import { invoicePdf, needsLiveCompany, pdfAvailable, pdfProblemText, pdfReady } from "@/services/invoicePdfService";
import type { SaleRow } from "@/services/saleService";

export type InvoicePreview = { status: "off" } | { status: "loading" } | { status: "error"; message: string } | { status: "ready"; url: string; pages: number };

/** Whether this copy of the app can make PDFs (null while asking). */
export function usePdfReady(): { ready: boolean; reason: string | null } | null {
  const [ready, setReady] = useState<{ ready: boolean; reason: string | null } | null>(null);
  useEffect(() => {
    if (!pdfAvailable()) return void setReady({ ready: false, reason: "PDFs are made by the desktop app." });
    let live = true;
    void pdfReady().then((r) => live && setReady(r));
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

/**
 * The invoice exactly as it prints: the same PDF the Print button makes (Humble Bill
 * Engine, this copy label), made in memory and shown on screen. "off" when this copy of
 * the app can't make PDFs — the screen then shows its own layout instead.
 */
export function useInvoicePreview(sale: SaleRow | null, copy: string, ready: { ready: boolean } | null): InvoicePreview {
  const company = useCompany();
  const entities = useEntities();
  const [state, setState] = useState<InvoicePreview>({ status: "loading" });
  const companyReady = company.status !== "loading";
  const entityPhones = entities.status === "ready" && sale ? (entities.data.find((e) => e.id === sale.customer.entityId)?.phones ?? []) : null;
  const phonesKey = entityPhones ? entityPhones.join(",") : null;
  const companyData = company.status === "ready" ? company.data : null;

  useEffect(() => {
    if (!sale || sale.status === "CANCELLED" || (ready && !ready.ready)) return void setState({ status: "off" });
    // Wait until we know the PDF maker is there, the buyer's phones, and (older sales) today's Settings.
    if (!ready || phonesKey === null || (needsLiveCompany(sale) && !companyReady)) return void setState({ status: "loading" });
    let live = true;
    let url: string | null = null;
    setState({ status: "loading" });
    invoicePdf(sale, { copyLabel: copy, action: "preview", company: companyData, buyerPhones: sale.customer.isWalkIn ? [] : phonesKey ? phonesKey.split(",") : [] })
      .then((r) => {
        if (!live) return;
        if (!r.ok) return setState({ status: "error", message: pdfProblemText(r) });
        if (r.cancelled || !r.pdf) return setState({ status: "error", message: "The PDF maker returned no PDF." });
        url = URL.createObjectURL(new Blob([r.pdf as BlobPart], { type: "application/pdf" }));
        setState({ status: "ready", url, pages: r.pages });
      })
      .catch((e) => live && setState({ status: "error", message: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [sale, copy, ready, phonesKey, companyReady, companyData]);

  return state;
}
