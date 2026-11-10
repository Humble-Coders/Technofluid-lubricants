import { Undo2, X } from "lucide-react";
import { useState } from "react";
import { canReverse, formatINR, formatRate, GST_STATES, isCancelled, type MoneyAccountRef } from "@technofluid/core";
import { Badge, Button } from "@/components/ui";
import type { MoneyEntryRow } from "@/services/moneyService";
import { ReverseDialog, ReversedBadge, StatusCell } from "./MoneyScreen";

const accountName = (r: MoneyAccountRef) => ("name" in r && r.name ? r.name : "—");

/**
 * One expense, in full (Expenses screen side panel): what, from where, how much, the GST
 * bill, who entered it, whether it's in the books, and its reversal. Read-only apart from
 * Reverse — an expense is never edited.
 */
export function ExpenseDetail({ entry: e, isAdmin, original, onClose }: { entry: MoneyEntryRow; isAdmin: boolean; original: MoneyEntryRow | null; onClose: () => void }) {
  const [reversing, setReversing] = useState(false);
  const isReversal = Boolean(e.reversesEntryId);
  // A reversal runs the other way: the money comes back from the category to the account.
  const category = isReversal ? e.from : e.to;
  const account = isReversal ? e.to : e.from;
  const cancelled = isCancelled(e, e.mirrorStatus);
  const g = e.gst;

  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-l border-line bg-surface" aria-label="Expense details">
      <header className="flex items-start gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">{accountName(category)}</p>
          <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-muted">
            {isReversal ? <Badge>Reversal</Badge> : <Badge tone="danger">Expense</Badge>}
            {e.reversedByEntryId ? <ReversedBadge entry={e} /> : null}
            {g ? <Badge tone="info">GST bill</Badge> : null}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="px-1.5" aria-label="Close" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 text-[13px]">
        <section>
          <p className="text-2xs font-medium tracking-wide text-ink-muted uppercase">Amount</p>
          <p className={`num text-[22px] font-semibold ${cancelled || isReversal ? "text-ink-faint" : "text-danger"}`}>{formatINR(e.amountPaise)}</p>
          {cancelled ? <p className="text-[12px] text-ink-muted">Reversed — no longer counted in the totals.</p> : null}
        </section>

        <section className="space-y-1.5">
          <Row label="Category">{accountName(category)}</Row>
          <Row label={isReversal ? "Paid back to" : "Paid from"}>{accountName(account)}</Row>
          <Row label="Day">{e.businessDay}</Row>
          <Row label="Note">{e.note ?? "—"}</Row>
          <Row label="Entered by">
            {e.createdBy}
            {e.createdAt ? <span className="text-ink-muted"> · {e.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span> : null}
          </Row>
          <Row label="Books">
            <StatusCell entry={e} />
          </Row>
          {isReversal ? (
            <Row label="Undoes">{original ? `${accountName(original.to)} of ${original.businessDay}, ${formatINR(original.amountPaise)}` : "An earlier expense"}</Row>
          ) : null}
        </section>

        {g ? (
          <section className="space-y-1.5 rounded-lg bg-canvas px-3 py-3">
            <p className="text-2xs font-medium tracking-wide text-ink-muted uppercase">GST bill</p>
            <Row label="Supplier">{g.supplier.name}</Row>
            <Row label="GSTIN">
              <span className="font-mono text-[12px]">{g.supplier.gstin}</span>
            </Row>
            <Row label="State">
              {GST_STATES[g.supplier.stateCode] ?? g.supplier.stateCode} ({g.supplier.stateCode})
            </Row>
            <Row label="Bill no.">{g.billNo}</Row>
            <Row label="Bill date">{g.billDate}</Row>
            <Row label="GST rate">{formatRate(g.rateBp)}</Row>
            <Row label="Taxable value">
              <span className="num">{formatINR(g.taxablePaise)}</span>
            </Row>
            {g.igstPaise ? (
              <Row label="IGST">
                <span className="num">{formatINR(g.igstPaise)}</span>
              </Row>
            ) : (
              <>
                <Row label="CGST">
                  <span className="num">{formatINR(g.cgstPaise)}</span>
                </Row>
                <Row label="SGST">
                  <span className="num">{formatINR(g.sgstPaise)}</span>
                </Row>
              </>
            )}
            <Row label="Input credit">
              <span className="num">{formatINR(g.cgstPaise + g.sgstPaise + g.igstPaise)}</span>
            </Row>
          </section>
        ) : null}

        {canReverse(e) && (!e.isCorrection || isAdmin) ? (
          <Button icon={<Undo2 className="size-3.5" />} onClick={() => setReversing(true)}>
            Reverse this expense
          </Button>
        ) : null}
      </div>
      {reversing ? <ReverseDialog entry={e} onClose={() => setReversing(false)} /> : null}
    </aside>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2">
      <span className="text-[12px] text-ink-muted">{label}</span>
      <span className="min-w-0 text-ink">{children}</span>
    </div>
  );
}
