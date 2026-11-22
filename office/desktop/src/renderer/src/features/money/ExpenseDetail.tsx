import { Undo2, X } from "lucide-react";
import { useState } from "react";
import { canReverse, formatINR, formatRate, GST_STATES, isCancelled, type MoneyAccountRef } from "@technofluid/core";
import { Badge, Button, Detail, Details, IconButton, SidePanel } from "@/components/ui";
import type { MoneyEntryRow } from "@/services/moneyService";
import { ReverseDialog, ReversedBadge, StatusCell } from "./MoneyScreen";

const accountName = (r: MoneyAccountRef) => ("name" in r && r.name ? r.name : "-");

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
  const reversible = canReverse(e) && (!e.isCorrection || isAdmin);

  return (
    <SidePanel label="Expense details" onClose={onClose}>
      <div className="flex shrink-0 items-start gap-2 px-6 pt-6 pb-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-title font-semibold text-ink">{accountName(category)}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-label text-ink-muted">
            {isReversal ? <Badge>Reversal</Badge> : <span>Expense</span>}
            {g ? <span>· GST bill</span> : null}
            {e.reversedByEntryId ? <ReversedBadge entry={e} /> : null}
          </div>
        </div>
        <IconButton label="Close" size="sm" onClick={onClose}>
          <X />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6">
        <div>
          <p className="text-label text-ink-muted">Amount</p>
          <p className={`num mt-0.5 text-headline font-semibold ${cancelled || isReversal ? "text-ink-subtle" : "text-ink"}`}>{formatINR(e.amountPaise)}</p>
          {cancelled ? <p className="mt-0.5 text-label text-ink-muted">Reversed. No longer counted in the totals.</p> : null}
        </div>

        <Details columns={2}>
          <Detail label="Category">{accountName(category)}</Detail>
          <Detail label={isReversal ? "Paid back to" : "Paid from"}>{accountName(account)}</Detail>
          <Detail label="Day">{e.businessDay}</Detail>
          <Detail label="Books">
            <StatusCell entry={e} />
          </Detail>
          <Detail label="Note" className="col-span-2">
            {e.note ?? "-"}
          </Detail>
          <Detail label="Entered by" className="col-span-2">
            {e.createdBy}
            {e.createdAt ? <span className="text-ink-muted"> · {e.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span> : null}
          </Detail>
          {isReversal ? (
            <Detail label="Undoes" className="col-span-2">
              {original ? `${accountName(original.to)} of ${original.businessDay}, ${formatINR(original.amountPaise)}` : "An earlier expense"}
            </Detail>
          ) : null}
        </Details>

        {g ? (
          <div className="border-t border-line-row pt-4">
            <h3 className="mb-3 text-label font-semibold text-ink">GST bill</h3>
            <Details columns={2}>
              <Detail label="Supplier" className="col-span-2">
                {g.supplier.name}
              </Detail>
              <Detail label="GSTIN">
                <span className="font-mono text-label">{g.supplier.gstin}</span>
              </Detail>
              <Detail label="State">
                {GST_STATES[g.supplier.stateCode] ?? g.supplier.stateCode} ({g.supplier.stateCode})
              </Detail>
              <Detail label="Bill no.">{g.billNo}</Detail>
              <Detail label="Bill date">{g.billDate}</Detail>
              <Detail label="GST rate">{formatRate(g.rateBp)}</Detail>
              <Detail label="Taxable value">
                <span className="num">{formatINR(g.taxablePaise)}</span>
              </Detail>
              {g.igstPaise ? (
                <Detail label="IGST">
                  <span className="num">{formatINR(g.igstPaise)}</span>
                </Detail>
              ) : (
                <>
                  <Detail label="CGST">
                    <span className="num">{formatINR(g.cgstPaise)}</span>
                  </Detail>
                  <Detail label="SGST">
                    <span className="num">{formatINR(g.sgstPaise)}</span>
                  </Detail>
                </>
              )}
              <Detail label="Input credit">
                <span className="num">{formatINR(g.cgstPaise + g.sgstPaise + g.igstPaise)}</span>
              </Detail>
            </Details>
          </div>
        ) : null}
      </div>
      {reversible ? (
        <div className="shrink-0 space-y-3 border-t border-line px-6 py-4">
          <Button icon={<Undo2 />} onClick={() => setReversing(true)}>
            Reverse this expense
          </Button>
        </div>
      ) : null}
      {reversing ? <ReverseDialog entry={e} onClose={() => setReversing(false)} /> : null}
    </SidePanel>
  );
}
