import { useState } from "react";
import { Badge, Button } from "@/components/ui";
import { retryPurchaseSync, type PurchaseRow } from "@/services/purchaseService";

/**
 * The bill's state in the books, shown only when it needs saying: "Saving to books…" /
 * "Not posted · Retry" — for the bill and its cancellation. A bill that is in the books
 * (or a cancelled one whose reversal is) shows nothing.
 */
export function PurchaseBooksStatus({ purchase: p }: { purchase: PurchaseRow }) {
  const [busy, setBusy] = useState(false);
  const retry = (
    <Button
      size="sm"
      loading={busy}
      onClick={(e) => {
        e.stopPropagation();
        setBusy(true);
        void retryPurchaseSync(p.id).finally(() => setBusy(false));
      }}
    >
      Retry
    </Button>
  );
  if (p.syncStatus === "FAILED" && p.billInBooks) {
    // The bill went in; a payment made with it didn't. A cancellation still reverses the bill.
    const cancelNote = p.status === "CANCELLED" ? (p.cancelSyncStatus === "SYNCED" ? " · bill reversed" : p.cancelSyncStatus === "FAILED" ? " · reversal not posted" : " · reversing bill…") : "";
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1" title={p.hlSyncError ?? undefined}>
        <Badge tone="danger">Payment not saved</Badge>
        <span className="text-label font-normal text-ink-muted">
          Bill in the books{cancelNote} · {p.hlSyncError ?? "error"}
        </span>
        {retry}
      </span>
    );
  }
  if (p.syncStatus === "FAILED") {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1" title={p.hlSyncError ?? undefined}>
        <Badge tone="danger">Not posted</Badge>
        <span className="text-label font-normal text-ink-muted">{p.hlSyncError ?? "error"}</span>
        {retry}
      </span>
    );
  }
  if (p.syncStatus === "PENDING") return <Badge>Saving to books…</Badge>;
  if (p.status === "CANCELLED") {
    if (p.cancelSyncStatus === "FAILED") {
      return (
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1" title={p.cancelSyncError ?? undefined}>
          <Badge tone="danger">Cancellation not posted</Badge>
          {retry}
        </span>
      );
    }
    if (p.cancelSyncStatus !== "SYNCED") return <Badge>Reversing in books…</Badge>;
    return null;
  }
  return null;
}
