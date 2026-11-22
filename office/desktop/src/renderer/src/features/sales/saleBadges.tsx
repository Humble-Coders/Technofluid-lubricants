import { CircleAlert } from "lucide-react";
import { useState } from "react";
import { formatINR } from "@technofluid/core";
import { Badge } from "@/components/ui";
import type { SalePaid } from "@/hooks/useSales";
import { retrySaleSync, type SaleRow } from "@/services/saleService";

/** Unpaid / Part paid (₹ due) / Cancelled as a badge; fully paid is plain text — from our own records. */
/** `stacked` (list tables): "Part paid" with the amount due on a line under it, so the column stays narrow. */
export function PaidBadge({ paid, stacked }: { paid: SalePaid; stacked?: boolean }) {
  if (paid.state === "CANCELLED") return <Badge tone="danger">Cancelled</Badge>;
  if (paid.state === "PAID") return <span className="text-label font-normal whitespace-nowrap text-ink-muted">Paid</span>;
  if (paid.state === "PART_PAID")
    return stacked ? (
      <span className="inline-flex flex-col items-start gap-0.5">
        <Badge tone="warning">Part paid</Badge>
        <span className="num text-caption whitespace-nowrap text-warning">{formatINR(paid.duePaise)} due</span>
      </span>
    ) : (
      <Badge tone="warning">Part paid · {formatINR(paid.duePaise)} due</Badge>
    );
  return <Badge tone="warning">Unpaid</Badge>;
}

/** Nothing when it's in the books / "Saving to books…" / "Not posted · Retry" — for the sale and its cancellation. */
export function BooksStatus({ sale: s }: { sale: SaleRow }) {
  const [busy, setBusy] = useState(false);
  const retry = (
    <button
      type="button"
      className="rounded font-medium text-accent hover:underline disabled:opacity-50"
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        setBusy(true);
        void retrySaleSync(s.id).finally(() => setBusy(false));
      }}
    >
      Retry
    </button>
  );
  if (s.syncStatus === "FAILED" && s.invoiceInBooks) {
    // The invoice went in; a payment received with it didn't. A cancellation still cancels the invoice.
    const cancelNote = s.status === "CANCELLED" ? (s.cancelSyncStatus === "SYNCED" ? " · invoice cancelled" : s.cancelSyncStatus === "FAILED" ? " · cancellation not posted" : " · cancelling invoice…") : "";
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-label font-normal text-danger" title={s.hlSyncError ?? undefined}>
        <Badge tone="danger">
          <CircleAlert aria-hidden />
          Payment not saved
        </Badge>
        <span>
          Invoice in the books{cancelNote} · a payment wasn't saved: {s.hlSyncError ?? "error"}
        </span>
        {retry}
      </span>
    );
  }
  if (s.syncStatus === "FAILED") {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-label font-normal text-danger" title={s.hlSyncError ?? undefined}>
        <Badge tone="danger">
          <CircleAlert aria-hidden />
          Not posted
        </Badge>
        <span>{s.hlSyncError ?? "error"}</span>
        {retry}
      </span>
    );
  }
  if (s.syncStatus === "PENDING") return <Badge>Saving to books…</Badge>;
  if (s.status === "CANCELLED") {
    if (s.cancelSyncStatus === "FAILED") {
      return (
        <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-label font-normal text-danger" title={s.cancelSyncError ?? undefined}>
          <Badge tone="danger">
            <CircleAlert aria-hidden />
            Cancellation not posted
          </Badge>
          {retry}
        </span>
      );
    }
    if (s.cancelSyncStatus !== "SYNCED") return <Badge>Cancelling in books…</Badge>;
    return <span className="text-label font-normal whitespace-nowrap text-ink-muted">Cancelled in the books</span>;
  }
  return null;
}
