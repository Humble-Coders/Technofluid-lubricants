import { useState } from "react";
import { formatINR } from "@technofluid/core";
import { Badge } from "@/components/ui";
import type { SalePaid } from "@/hooks/useSales";
import { retrySaleSync, type SaleRow } from "@/services/saleService";

/** Unpaid / Part paid (₹ due) / Paid / Cancelled — from our own records. */
export function PaidBadge({ paid }: { paid: SalePaid }) {
  if (paid.state === "CANCELLED") return <Badge tone="danger">Cancelled</Badge>;
  if (paid.state === "PAID") return <Badge tone="success">Paid</Badge>;
  if (paid.state === "PART_PAID") return <Badge tone="warning">Part paid · {formatINR(paid.duePaise)} due</Badge>;
  return <Badge tone="warning">Unpaid</Badge>;
}

/** "In the books" / "Saving to books…" / "Not posted · Retry" — for the sale and its cancellation. */
export function BooksStatus({ sale: s }: { sale: SaleRow }) {
  const [busy, setBusy] = useState(false);
  const retry = (
    <button
      type="button"
      className="font-medium text-info hover:underline disabled:opacity-50"
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
  if (s.syncStatus === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-danger" title={s.hlSyncError ?? undefined}>
        Not posted: {s.hlSyncError ?? "error"} {retry}
      </span>
    );
  }
  if (s.syncStatus === "PENDING") return <span className="text-[12px] text-ink-muted">Saving to books…</span>;
  if (s.status === "CANCELLED") {
    if (s.cancelSyncStatus === "FAILED") {
      return (
        <span className="inline-flex items-center gap-1 text-[12px] text-danger" title={s.cancelSyncError ?? undefined}>
          Cancellation not posted {retry}
        </span>
      );
    }
    if (s.cancelSyncStatus !== "SYNCED") return <span className="text-[12px] text-ink-muted">Cancelling in books…</span>;
    return <span className="text-[12px] text-ink-muted">Cancelled in the books</span>;
  }
  return <span className="text-[12px] text-success">In the books</span>;
}
