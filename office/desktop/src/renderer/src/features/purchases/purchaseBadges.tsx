import { useState } from "react";
import { retryPurchaseSync, type PurchaseRow } from "@/services/purchaseService";

/** "In the books" / "Saving to books…" / "Not posted · Retry" — for the bill and its cancellation. */
export function PurchaseBooksStatus({ purchase: p }: { purchase: PurchaseRow }) {
  const [busy, setBusy] = useState(false);
  const retry = (
    <button
      type="button"
      className="font-medium text-info hover:underline disabled:opacity-50"
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        setBusy(true);
        void retryPurchaseSync(p.id).finally(() => setBusy(false));
      }}
    >
      Retry
    </button>
  );
  if (p.syncStatus === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-danger" title={p.hlSyncError ?? undefined}>
        Not posted: {p.hlSyncError ?? "error"} {retry}
      </span>
    );
  }
  if (p.syncStatus === "PENDING") return <span className="text-[12px] text-ink-muted">Saving to books…</span>;
  if (p.status === "CANCELLED") {
    if (p.cancelSyncStatus === "FAILED") {
      return (
        <span className="inline-flex items-center gap-1 text-[12px] text-danger" title={p.cancelSyncError ?? undefined}>
          Cancellation not posted {retry}
        </span>
      );
    }
    if (p.cancelSyncStatus !== "SYNCED") return <span className="text-[12px] text-ink-muted">Reversing in books…</span>;
    return <span className="text-[12px] text-ink-muted">Reversed in the books</span>;
  }
  return <span className="text-[12px] text-success">In the books</span>;
}
