import { Download, Printer } from "lucide-react";
import { useState } from "react";
import { INVOICE_COPIES } from "@technofluid/core";
import { Button, FilterSelect } from "@/components/ui";
import { useEntities } from "@/hooks/useEntities";
import { useCompany } from "@/hooks/useSales";
import { invoicePdf, needsLiveCompany, pdfAvailable, pdfProblemText } from "@/services/invoicePdfService";
import type { SaleRow } from "@/services/saleService";

/**
 * The invoice as a PDF (Humble Bill Engine, Gaurav's layout): choose the copy (Original /
 * Duplicate / Triplicate — the preview below follows it), then save it, or open it in the
 * computer's PDF app to print.
 */
export function InvoicePdfButtons({ sale, copy, onCopy, ready }: { sale: SaleRow; copy: string; onCopy: (copy: string) => void; ready: { ready: boolean; reason: string | null } | null }) {
  const company = useCompany();
  const entities = useEntities();
  const [busy, setBusy] = useState<"save" | "open" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  if (!pdfAvailable()) return null;
  if (ready && !ready.ready) return <p className="text-label text-ink-muted">Print / Save PDF: {ready.reason}</p>;
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
      else if (!r.cancelled) setMessage({ tone: "ok", text: action === "save" ? `Saved: ${r.pages} page${r.pages === 1 ? "" : "s"}.` : "Opened in your PDF app. Print from there." });
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterSelect label="Copy" value={copy} onChange={onCopy} options={INVOICE_COPIES.map((c) => [c, c.replace(/ Copy$/, "")])} active={false} />
      <Button icon={<Printer />} onClick={() => void run("open")} loading={busy === "open"} disabled={disabled}>
        Print
      </Button>
      <Button variant="ghost" icon={<Download />} onClick={() => void run("save")} loading={busy === "save"} disabled={disabled}>
        Save PDF
      </Button>
      {message ? (
        <span role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-label text-danger" : "text-label text-ink-muted"}>
          {message.text}
        </span>
      ) : null}
    </div>
  );
}
