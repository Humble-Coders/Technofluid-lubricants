import { Download, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { INVOICE_COPIES } from "@technofluid/core";
import { Button, Select } from "@/components/ui";
import { useEntities } from "@/hooks/useEntities";
import { useCompany } from "@/hooks/useSales";
import { invoicePdf, needsLiveCompany, pdfAvailable, pdfProblemText, pdfReady } from "@/services/invoicePdfService";
import type { SaleRow } from "@/services/saleService";

/**
 * The invoice as a PDF (Humble Bill Engine, Gaurav's layout): choose the copy (Original /
 * Duplicate / Triplicate), then save it, or open it in the computer's PDF app to print.
 */
export function InvoicePdfButtons({ sale }: { sale: SaleRow }) {
  const company = useCompany();
  const entities = useEntities();
  const [copy, setCopy] = useState<string>(INVOICE_COPIES[0]);
  const [busy, setBusy] = useState<"save" | "open" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [ready, setReady] = useState<{ ready: boolean; reason: string | null } | null>(null);

  useEffect(() => {
    let live = true;
    void pdfReady().then((r) => live && setReady(r));
    return () => {
      live = false;
    };
  }, []);

  if (!pdfAvailable()) return null;
  if (ready && !ready.ready) return <span className="text-[12px] text-ink-muted">Print / Save PDF: {ready.reason}</span>;
  // An older sale prints today's bank details and terms, so wait until Settings have loaded.
  const waitingForCompany = needsLiveCompany(sale) && company.status === "loading";
  const disabled = busy !== null || ready === null || waitingForCompany;

  const run = async (action: "save" | "open") => {
    setBusy(action);
    setMessage(null);
    try {
      const entity = entities.status === "ready" ? entities.data.find((e) => e.id === sale.customer.entityId) : undefined;
      const r = await invoicePdf(sale, {
        copyLabel: copy,
        action,
        company: company.status === "ready" ? company.data : null,
        buyerPhones: sale.customer.isWalkIn ? [] : (entity?.phones ?? []),
      });
      if (!r.ok) setMessage({ tone: "error", text: pdfProblemText(r) });
      else if (!r.cancelled) setMessage({ tone: "ok", text: action === "save" ? `Saved — ${r.pages} page${r.pages === 1 ? "" : "s"}.` : "Opened in your PDF app — print from there." });
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={copy} onChange={(e) => setCopy(e.target.value)} aria-label="Which copy" className="w-40">
        {INVOICE_COPIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
      <Button icon={<Printer className="size-3.5" />} onClick={() => void run("open")} loading={busy === "open"} disabled={disabled}>
        Print
      </Button>
      <Button variant="ghost" icon={<Download className="size-3.5" />} onClick={() => void run("save")} loading={busy === "save"} disabled={disabled}>
        Save PDF
      </Button>
      {message ? <span className={message.tone === "error" ? "text-[12px] text-danger" : "text-[12px] text-success"}>{message.text}</span> : null}
    </div>
  );
}
