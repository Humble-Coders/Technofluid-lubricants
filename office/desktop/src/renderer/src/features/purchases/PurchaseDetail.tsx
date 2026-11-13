import clsx from "clsx";
import { ArrowLeft, Ban, IndianRupee } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { formatINR, formatQuantity, formatRate, GST_STATES, indiaDate, rupeesToPaise } from "@technofluid/core";
import { Badge, Button, EmptyState, Field, Input, Select, Spinner } from "@/components/ui";
import { Modal } from "@/features/entities/EntityDetail";
import { PaidBadge } from "@/features/sales/saleBadges";
import { useRegisters } from "@/hooks/useMoney";
import { usePurchase, usePurchasesPaid } from "@/hooks/usePurchases";
import { recordMoneyEntry } from "@/services/moneyService";
import { newRequestId } from "@/services/stockService";
import { cancelPurchase, type PurchaseRow } from "@/services/purchaseService";
import { PurchaseBooksStatus } from "./purchaseBadges";

const perUnit = (u: string) => (u === "piece" ? "piece" : u);

/**
 * One supplier bill as recorded: supplier, bill no. and date, lines with GST, totals;
 * what's been paid, its state in the books, and the two things you can do — pay against
 * it, or cancel it (with a reason; stock goes back out and the books reverse).
 */
export function PurchaseDetail() {
  const { purchaseId } = useParams();
  const purchase = usePurchase(purchaseId);
  const p = purchase.status === "ready" ? purchase.data : null;
  const list = useMemo(() => (p ? [p] : []), [p]);
  const paid = usePurchasesPaid(list).get(purchaseId ?? "");
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  if (purchase.status === "loading") return <Spinner className="m-6" />;
  if (purchase.status === "error") return <p className="m-6 text-[12px] text-danger">{purchase.message}</p>;
  if (!p) return <EmptyState title="That purchase doesn't exist" />;

  const cancelled = p.status === "CANCELLED";
  const t = p.totals;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-4 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/purchases" className="inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink">
            <ArrowLeft className="size-3.5" /> Purchases
          </Link>
          <h2 className="text-[16px] font-semibold text-ink">{p.ref}</h2>
          {paid ? <PaidBadge paid={paid} /> : null}
          <PurchaseBooksStatus purchase={p} />
          <span className="flex-1" />
          {!cancelled && paid && paid.duePaise > 0 ? (
            <Button icon={<IndianRupee className="size-3.5" />} onClick={() => setPaying(true)}>
              Pay
            </Button>
          ) : null}
          {!cancelled ? (
            <Button variant="ghost" icon={<Ban className="size-3.5" />} onClick={() => setCancelling(true)}>
              Cancel purchase
            </Button>
          ) : null}
        </div>

        {cancelled && p.cancel ? (
          <p className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">
            Cancelled on {p.cancel.day} by {p.cancel.by}: {p.cancel.reason}. {p.stockAlreadyCounted ? "" : "The stock went back out; "}the books were reversed.
          </p>
        ) : null}
        {p.stockAlreadyCounted ? <p className="rounded-md bg-info-soft px-3 py-2 text-[12px] text-info">The goods were already counted in stock — this bill changed the books only.</p> : null}

        <article className={clsx("rounded-lg border border-line bg-surface p-6 text-[12px]", cancelled && "opacity-70")} aria-label="Supplier bill">
          <header className="flex items-start justify-between gap-6 border-b border-line pb-4">
            <div>
              <p className="text-2xs tracking-wide text-ink-muted uppercase">Supplier</p>
              <p className="text-[15px] font-semibold text-ink">{p.supplier.name}</p>
              <p className="text-ink-muted">
                {p.supplier.gstin ? `GSTIN ${p.supplier.gstin}` : "Unregistered (no GSTIN) — no GST"}
                {p.supplier.stateCode ? ` · ${GST_STATES[p.supplier.stateCode] ?? p.supplier.stateCode}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-ink">
                Bill no. <span className="font-medium">{p.billNo}</span>
              </p>
              <p className="text-ink">Bill date {p.billDate}</p>
              <p className="text-ink-muted">
                Our ref. <span className="num">{p.ref}</span>
              </p>
            </div>
          </header>

          <table className="mt-3 w-full border-collapse">
            <thead className="text-left text-2xs tracking-wide text-ink-muted uppercase">
              <tr className="border-b border-line">
                <th className="py-1.5 pr-2 font-medium">#</th>
                <th className="py-1.5 pr-2 font-medium">Item</th>
                <th className="py-1.5 pr-2 text-right font-medium">Quantity</th>
                <th className="py-1.5 pr-2 text-right font-medium">Value before GST</th>
                <th className="py-1.5 pr-2 text-right font-medium">GST</th>
                <th className="py-1.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {p.lines.map((l, i) => (
                <tr key={i} className="border-b border-line/60 align-top">
                  <td className="py-1.5 pr-2 text-ink-muted">{i + 1}</td>
                  <td className="py-1.5 pr-2 text-ink">{l.itemName}</td>
                  <td className="num py-1.5 pr-2 text-right">{formatQuantity(l.qtyMilli, l.baseUnit)}</td>
                  <td className="num py-1.5 pr-2 text-right">
                    {formatINR(l.taxablePaise)}
                    <span className="block text-2xs text-ink-muted">
                      {formatINR(l.unitCostPaise)} / {perUnit(l.baseUnit)}
                    </span>
                  </td>
                  <td className="num py-1.5 pr-2 text-right">
                    {formatRate(l.gstRateBp)}
                    <span className="block text-2xs text-ink-muted">{formatINR(l.cgstPaise + l.sgstPaise + l.igstPaise)}</span>
                  </td>
                  <td className="num py-1.5 text-right">{formatINR(l.totalPaise)}</td>
                </tr>
              ))}
              {p.freight ? (
                <tr className="border-b border-line/60">
                  <td />
                  <td className="py-1.5 pr-2 text-ink" colSpan={2}>
                    Freight
                  </td>
                  <td className="num py-1.5 pr-2 text-right">{formatINR(p.freight.taxablePaise)}</td>
                  <td className="num py-1.5 pr-2 text-right">{formatRate(p.freight.gstRateBp)}</td>
                  <td className="num py-1.5 text-right">{formatINR(p.freight.totalPaise)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <section className="mt-4 grid grid-cols-[1fr_280px] gap-6">
            <div>{p.note ? <p className="text-ink-muted">Note: {p.note}</p> : null}</div>
            <div className="space-y-1 text-[12px]">
              <Line label="Value before GST (incl. freight)" value={formatINR(t.taxablePaise)} />
              {t.supplyType === "INTRA" ? (
                <>
                  <Line label="Input CGST" value={formatINR(t.cgstPaise)} />
                  <Line label="Input SGST" value={formatINR(t.sgstPaise)} />
                </>
              ) : t.supplyType === "INTER" ? (
                <Line label="Input IGST" value={formatINR(t.igstPaise)} />
              ) : (
                <Line label="GST" value="none" />
              )}
              {t.roundOffPaise ? <Line label="Round off" value={`${t.roundOffPaise > 0 ? "+" : "−"}${formatINR(Math.abs(t.roundOffPaise))}`} /> : null}
              <div className="flex items-baseline justify-between border-t border-line pt-1.5">
                <span className="font-semibold text-ink">Bill total</span>
                <span className="num text-[16px] font-semibold text-ink">{formatINR(p.billTotalPaise)}</span>
              </div>
            </div>
          </section>
        </article>

        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold text-ink">Payments</h3>
          {p.payments.length === 0 && (paid?.later.length ?? 0) === 0 ? <p className="text-[12px] text-ink-muted">Nothing paid yet — on credit.</p> : null}
          <ul className="space-y-1 text-[12px]">
            {p.payments.map((x, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="num w-28 text-right">{formatINR(x.amountPaise)}</span>
                <span className="text-ink">
                  from {x.name}, with the bill ({p.billDate})
                </span>
              </li>
            ))}
            {paid?.later.map((e) => (
              <li key={e.id} className={clsx("flex items-center gap-2", e.reversedByEntryId && "text-ink-faint")}>
                <span className={clsx("num w-28 text-right", e.reversedByEntryId && "line-through")}>{formatINR(e.amountPaise)}</span>
                <span>
                  from {e.from.kind === "ADJUSTMENT" ? "—" : e.from.name}, {e.businessDay}
                  {e.note ? ` · ${e.note}` : ""}
                </span>
                {e.reversedByEntryId ? <Badge>Reversed</Badge> : e.syncStatus !== "SYNCED" ? <Badge tone={e.syncStatus === "FAILED" ? "danger" : "neutral"}>{e.syncStatus === "FAILED" ? "Not posted" : "Saving to books…"}</Badge> : null}
              </li>
            ))}
          </ul>
          {paid && !cancelled ? (
            <p className="text-[12px] text-ink">
              Paid {formatINR(paid.paidPaise)} of {formatINR(p.billTotalPaise)}
              {paid.duePaise > 0 ? ` · ${formatINR(paid.duePaise)} still to pay` : ""}
            </p>
          ) : null}
        </section>

        <p className="text-2xs text-ink-faint">
          Recorded by {p.createdBy}
          {p.createdAt ? ` on ${p.createdAt.toLocaleString("en-IN")}` : ""}.
        </p>
      </div>

      {paying && paid ? <PayDialog purchase={p} duePaise={paid.duePaise} onClose={() => setPaying(false)} /> : null}
      {cancelling ? <CancelDialog purchase={p} onClose={() => setCancelling(false)} /> : null}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-ink-muted">{label}</span>
      <span className="num text-ink">{value}</span>
    </div>
  );
}

function PayDialog({ purchase: p, duePaise, onClose }: { purchase: PurchaseRow; duePaise: number; onClose: () => void }) {
  const registers = useRegisters();
  const regs = registers.status === "ready" ? registers.data.filter((r) => r.isActive && !r.placeholder) : [];
  const [registerId, setRegisterId] = useState("");
  const reg = regs.find((r) => r.id === (registerId || regs[0]?.id));
  const [amount, setAmount] = useState(String(duePaise / 100));
  const [day, setDay] = useState(indiaDate());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One request id for as long as the dialog is open: a retry after a timeout is the same payment.
  const [requestId] = useState(newRequestId);
  let paise = NaN;
  try {
    paise = rupeesToPaise(amount);
  } catch {
    paise = NaN;
  }
  const problem = !reg ? "Choose where the money came from." : !Number.isInteger(paise) || paise <= 0 ? "Give the amount." : paise > duePaise ? `Only ${formatINR(duePaise)} is still to pay — record any extra separately in Money in & out.` : null;
  return (
    <Modal title={`Payment for ${p.ref}`} onClose={onClose} busy={busy}>
      <p className="text-[12px] text-ink-muted">
        To {p.supplier.name} · bill {p.billNo} · {formatINR(duePaise)} still to pay
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" htmlFor="pp-from">
          <Select id="pp-from" value={reg?.id ?? ""} onChange={(e) => setRegisterId(e.target.value)}>
            {regs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount (₹)" htmlFor="pp-amount">
          <Input id="pp-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="num" autoFocus />
        </Field>
        <Field label="Day" htmlFor="pp-day">
          <Input id="pp-day" type="date" value={day} max={indiaDate()} min={p.billDate} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </Field>
        <Field label="Note" htmlFor="pp-note">
          <Input id="pp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. cheque no., UTR" maxLength={500} />
        </Field>
      </div>
      {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</p> : null}
      <div className="flex items-center justify-end gap-2">
        {problem ? <span className="mr-auto text-[12px] text-ink-muted">{problem}</span> : null}
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="primary"
          loading={busy}
          disabled={Boolean(problem)}
          onClick={async () => {
            if (!reg) return;
            setBusy(true);
            setError(null);
            try {
              await recordMoneyEntry({
                from: { kind: reg.kind, registerId: reg.id, name: reg.name },
                to: { kind: "PARTY", entityId: p.supplier.entityId, name: p.supplier.name },
                amountPaise: paise,
                businessDay: day,
                note: note.trim() || null,
                purchaseId: p.id,
                requestId,
              });
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
              setBusy(false);
            }
          }}
        >
          Save payment
        </Button>
      </div>
    </Modal>
  );
}

function CancelDialog({ purchase: p, onClose }: { purchase: PurchaseRow; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={`Cancel ${p.ref}`} onClose={onClose} busy={busy}>
      <p className="text-[13px] text-ink">
        {p.supplier.name} · bill {p.billNo} · {formatINR(p.billTotalPaise)} · {p.billDate}
      </p>
      <ul className="list-disc space-y-0.5 pl-5 text-[12px] text-ink-muted">
        {p.stockAlreadyCounted ? <li>Stock isn't touched (the goods were counted separately).</li> : <li>The stock goes back out today.</li>}
        <li>The books reverse the bill. Anything already paid stays — the supplier then owes it back (record a refund as money received).</li>
        <li>Enter the bill again with New purchase if it was a mistake in the details.</li>
      </ul>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" autoFocus maxLength={300} aria-label="Reason" />
      {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Keep it
        </Button>
        <Button
          variant="danger"
          loading={busy}
          disabled={!reason.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await cancelPurchase(p.id, reason);
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
              setBusy(false);
            }
          }}
        >
          Cancel purchase
        </Button>
      </div>
    </Modal>
  );
}
