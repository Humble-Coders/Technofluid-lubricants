import clsx from "clsx";
import { AlertTriangle, ArrowLeft, Ban, IndianRupee } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { amountInWords, formatINR, formatQuantity, formatRate, GST_STATES, indiaDate, rupeesToPaise } from "@technofluid/core";
import { Badge, Button, EmptyState, Field, Input, Select, Spinner } from "@/components/ui";
import { Modal } from "@/features/entities/EntityDetail";
import { useRegisters } from "@/hooks/useMoney";
import { useSale, useSalesPaid } from "@/hooks/useSales";
import { recordMoneyEntry } from "@/services/moneyService";
import { cancelSale, type CreateSaleResult, type SaleRow } from "@/services/saleService";
import { InvoicePdfButtons } from "./InvoicePdfButtons";
import { BooksStatus, PaidBadge } from "./saleBadges";

const PRICE_PER_SHORT: Record<string, string> = { "per litre": "/L", "per liter": "/L", "per kg": "/kg", "per case": "/case", "per bucket": "/bucket", "per barrel": "/barrel", "per piece": "/pc" };

/**
 * One invoice on screen, laid out like the tax invoice, with its PDF (Print / Save PDF,
 * from the Humble Bill Engine): seller, buyer, lines with HSN, GST, total in words; then what's been paid,
 * its state in the books, and the two things you can do — receive a payment against it,
 * or cancel it (with a reason; the number stays used).
 */
export function SaleDetail() {
  const { saleId } = useParams();
  const location = useLocation();
  const justCreated = (location.state as { justCreated?: CreateSaleResult } | null)?.justCreated;
  const sale = useSale(saleId);
  const s = sale.status === "ready" ? sale.data : null;
  const list = useMemo(() => (s ? [s] : []), [s]);
  const paid = useSalesPaid(list).get(saleId ?? "");
  const [receiving, setReceiving] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  if (sale.status === "loading") return <Spinner className="m-6" />;
  if (sale.status === "error") return <p className="m-6 text-[12px] text-danger">{sale.message}</p>;
  if (!s) return <EmptyState title="That invoice doesn't exist" />;

  const intra = s.totals.supplyType === "INTRA_STATE";
  const cancelled = s.status === "CANCELLED";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-4 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/sales" className="inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink">
            <ArrowLeft className="size-3.5" /> Sales
          </Link>
          <h2 className="text-[16px] font-semibold text-ink">{s.invoiceNo}</h2>
          {paid ? <PaidBadge paid={paid} /> : null}
          <BooksStatus sale={s} />
          <span className="flex-1" />
          {!cancelled && paid && paid.duePaise > 0 && !s.customer.isWalkIn ? (
            <Button icon={<IndianRupee className="size-3.5" />} onClick={() => setReceiving(true)}>
              Receive payment
            </Button>
          ) : null}
          {!cancelled ? (
            <Button variant="ghost" icon={<Ban className="size-3.5" />} onClick={() => setCancelling(true)}>
              Cancel invoice
            </Button>
          ) : null}
        </div>

        {!cancelled ? <InvoicePdfButtons sale={s} /> : null}

        {justCreated && justCreated.belowZero.length > 0 && !cancelled ? (
          <p className="flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning">
            <AlertTriangle className="size-3.5" /> Stock is now below zero for {justCreated.belowZero.map((b) => b.name).join(", ")} — record what came in or was made.
          </p>
        ) : null}
        {s.lines.some((l) => l.manualPrice) ? (
          <p className="rounded-md bg-info-soft px-3 py-2 text-[12px] text-info">
            The price of {s.lines.filter((l) => l.manualPrice).map((l) => `${l.productName} · ${l.packLabel}`).join(", ")} was typed by an Admin for this sale (no price on the price list).
          </p>
        ) : null}
        {cancelled && s.cancel ? (
          <p className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">
            Cancelled on {s.cancel.day} by {s.cancel.by}: {s.cancel.reason}. The stock came back; the number stays used.
          </p>
        ) : null}

        <article className={clsx("rounded-lg border border-line bg-surface p-6 text-[12px]", cancelled && "opacity-70")} aria-label="Tax invoice">
          <header className="flex items-start justify-between gap-6 border-b border-line pb-4">
            <div>
              <p className="text-[16px] font-semibold text-ink">{s.seller.tradeName ?? s.seller.legalName}</p>
              {s.seller.tradeName ? <p className="text-ink">{s.seller.legalName}</p> : null}
              <p className="text-ink-muted">
                {[s.seller.address.line1, s.seller.address.line2, s.seller.address.city, s.seller.address.pincode].filter(Boolean).join(", ")}
              </p>
              <p className="text-ink-muted">
                GSTIN {s.seller.gstin} · {GST_STATES[s.seller.stateCode]} ({s.seller.stateCode})
                {s.seller.phone ? ` · ${s.seller.phone}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[14px] font-semibold tracking-wide text-ink uppercase">Tax invoice</p>
              <p className="text-ink">
                No. <span className="num font-medium">{s.invoiceNo}</span>
              </p>
              <p className="text-ink">Date {s.invoiceDate}</p>
            </div>
          </header>

          <section className="grid grid-cols-2 gap-6 border-b border-line py-4">
            <div>
              <p className="text-2xs tracking-wide text-ink-muted uppercase">Billed to</p>
              {s.customer.buyer?.name ? (
                <>
                  <p className="font-medium text-ink">{s.customer.buyer.name}</p>
                  <p className="text-ink-muted">Walk-in / cash customer</p>
                </>
              ) : (
                <p className="font-medium text-ink">{s.customer.name}</p>
              )}
              {s.customer.buyer?.address ? <p className="text-ink-muted">{s.customer.buyer.address}</p> : null}
              {s.customer.buyer?.phone ? <p className="text-ink-muted">Phone {s.customer.buyer.phone}</p> : null}
              {s.customer.address && !s.customer.buyer?.address ? (
                <p className="text-ink-muted">{[s.customer.address.line1, s.customer.address.line2, s.customer.address.city, s.customer.address.pincode].filter(Boolean).join(", ")}</p>
              ) : null}
              <p className="text-ink-muted">{s.customer.gstin ? `GSTIN ${s.customer.gstin}` : "Unregistered (no GSTIN)"}</p>
            </div>
            <div>
              {s.shipTo ? (
                <div className="mb-2">
                  <p className="text-2xs tracking-wide text-ink-muted uppercase">Shipped to</p>
                  <p className="font-medium text-ink">{s.shipTo.name}</p>
                  <p className="text-ink-muted">{[s.shipTo.address, s.shipTo.city, s.shipTo.pincode].filter(Boolean).join(", ")}</p>
                  <p className="text-ink-muted">
                    {GST_STATES[s.shipTo.stateCode] ?? s.shipTo.stateCode} ({s.shipTo.stateCode}){s.shipTo.gstin ? ` · GSTIN ${s.shipTo.gstin}` : ""}
                  </p>
                </div>
              ) : null}
              <p className="text-2xs tracking-wide text-ink-muted uppercase">Place of supply</p>
              <p className="text-ink">
                {GST_STATES[s.placeOfSupply] ?? s.placeOfSupply} ({s.placeOfSupply})
              </p>
              <p className="text-ink-muted">{s.customer.priceTier} price list</p>
              {s.dispatch ? (
                <p className="mt-1 text-ink-muted">
                  {[
                    s.dispatch.transport ? `Transport: ${s.dispatch.transport}` : "",
                    s.dispatch.vehicleNo ? `Vehicle: ${s.dispatch.vehicleNo}` : "",
                    s.dispatch.station ? `Station: ${s.dispatch.station}` : "",
                    s.dispatch.ewayBillNo ? `E-way bill: ${s.dispatch.ewayBillNo}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
            </div>
          </section>

          <table className="mt-3 w-full border-collapse">
            <thead className="text-left text-2xs tracking-wide text-ink-muted uppercase">
              <tr className="border-b border-line">
                <th className="py-1.5 pr-2 font-medium">#</th>
                <th className="py-1.5 pr-2 font-medium">Product</th>
                <th className="py-1.5 pr-2 font-medium">HSN</th>
                <th className="py-1.5 pr-2 text-right font-medium">Qty</th>
                <th className="py-1.5 pr-2 text-right font-medium">Rate</th>
                <th className="py-1.5 pr-2 text-right font-medium">Disc.</th>
                <th className="py-1.5 pr-2 text-right font-medium">Taxable</th>
                <th className="py-1.5 pr-2 text-right font-medium">GST</th>
                <th className="py-1.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {s.lines.map((l, i) => (
                <tr key={i} className="border-b border-line/60 align-top">
                  <td className="py-1.5 pr-2 text-ink-muted">{i + 1}</td>
                  <td className="py-1.5 pr-2">
                    <span className="text-ink">{l.productName}</span>
                    <span className="block text-2xs text-ink-muted">
                      {l.packLabel} · {formatQuantity(l.qtyMilli, l.baseUnit)}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2">{l.hsnCode ?? <span className="text-warning">—</span>}</td>
                  <td className="num py-1.5 pr-2 text-right">{l.packs}</td>
                  <td className="num py-1.5 pr-2 text-right">
                    {formatINR(l.packPricePaise)}
                    <span className="block text-2xs text-ink-muted">
                      {formatINR(l.listPricePaise)}
                      {PRICE_PER_SHORT[l.pricePer] ?? ` ${l.pricePer}`}
                    </span>
                  </td>
                  <td className="num py-1.5 pr-2 text-right">{l.discountBp ? `${formatRate(l.discountBp)} · ${formatINR(l.discountPaise)}` : "—"}</td>
                  <td className="num py-1.5 pr-2 text-right">{formatINR(l.taxablePaise)}</td>
                  <td className="num py-1.5 pr-2 text-right">{formatRate(l.gstRateBp)}</td>
                  <td className="num py-1.5 text-right">{formatINR(l.totalPaise)}</td>
                </tr>
              ))}
              {s.freight ? (
                <tr className="border-b border-line/60">
                  <td />
                  <td className="py-1.5 pr-2 text-ink" colSpan={5}>
                    Freight
                  </td>
                  <td className="num py-1.5 pr-2 text-right">{formatINR(s.freight.taxablePaise)}</td>
                  <td className="num py-1.5 pr-2 text-right">{formatRate(s.freight.gstRateBp)}</td>
                  <td className="num py-1.5 text-right">{formatINR(s.freight.totalPaise)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <section className="mt-4 grid grid-cols-[1fr_280px] gap-6">
            <div className="space-y-2">
              <table className="w-full border-collapse text-2xs">
                <thead className="text-left tracking-wide text-ink-muted uppercase">
                  <tr className="border-b border-line">
                    <th className="py-1 pr-2 font-medium">GST rate</th>
                    <th className="py-1 pr-2 text-right font-medium">Taxable</th>
                    {intra ? (
                      <>
                        <th className="py-1 pr-2 text-right font-medium">CGST</th>
                        <th className="py-1 text-right font-medium">SGST</th>
                      </>
                    ) : (
                      <th className="py-1 text-right font-medium">IGST</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {s.totals.byRate.map((r) => (
                    <tr key={r.gstRateBp} className="border-b border-line/60">
                      <td className="py-1 pr-2">{formatRate(r.gstRateBp)}</td>
                      <td className="num py-1 pr-2 text-right">{formatINR(r.taxablePaise)}</td>
                      {intra ? (
                        <>
                          <td className="num py-1 pr-2 text-right">{formatINR(r.cgstPaise)}</td>
                          <td className="num py-1 text-right">{formatINR(r.sgstPaise)}</td>
                        </>
                      ) : (
                        <td className="num py-1 text-right">{formatINR(r.igstPaise)}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-ink">{amountInWords(s.totals.grandTotalPaise)}</p>
              {s.note ? <p className="text-ink-muted">Note: {s.note}</p> : null}
            </div>
            <div className="space-y-1 text-[12px]">
              <Line label="Taxable value" value={formatINR(s.totals.taxablePaise)} />
              {intra ? (
                <>
                  <Line label="CGST" value={formatINR(s.totals.cgstPaise)} />
                  <Line label="SGST" value={formatINR(s.totals.sgstPaise)} />
                </>
              ) : (
                <Line label="IGST" value={formatINR(s.totals.igstPaise)} />
              )}
              {s.totals.roundOffPaise ? <Line label="Round off" value={`${s.totals.roundOffPaise > 0 ? "+" : "−"}${formatINR(Math.abs(s.totals.roundOffPaise))}`} /> : null}
              <div className="flex items-baseline justify-between border-t border-line pt-1.5">
                <span className="font-semibold text-ink">Total</span>
                <span className="num text-[16px] font-semibold text-ink">{formatINR(s.totals.grandTotalPaise)}</span>
              </div>
            </div>
          </section>
        </article>

        {s.missingHsn.length > 0 ? (
          <p className="text-[12px] text-warning">Billed without an HSN code for {s.missingHsn.length} product(s) — codes are awaited from the CA.</p>
        ) : null}

        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold text-ink">Payments</h3>
          {s.payments.length === 0 && (paid?.later.length ?? 0) === 0 ? <p className="text-[12px] text-ink-muted">Nothing paid yet — on credit.</p> : null}
          <ul className="space-y-1 text-[12px]">
            {s.payments.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="num w-28 text-right">{formatINR(p.amountPaise)}</span>
                <span className="text-ink">
                  into {p.name}, at billing ({s.invoiceDate})
                </span>
              </li>
            ))}
            {paid?.later.map((e) => (
              <li key={e.id} className={clsx("flex items-center gap-2", e.reversedByEntryId && "text-ink-faint")}>
                <span className={clsx("num w-28 text-right", e.reversedByEntryId && "line-through")}>{formatINR(e.amountPaise)}</span>
                <span>
                  into {e.to.kind === "ADJUSTMENT" ? "—" : e.to.name}, {e.businessDay}
                  {e.note ? ` · ${e.note}` : ""}
                </span>
                {e.reversedByEntryId ? <Badge>Reversed</Badge> : e.syncStatus !== "SYNCED" ? <Badge tone={e.syncStatus === "FAILED" ? "danger" : "neutral"}>{e.syncStatus === "FAILED" ? "Not posted" : "Saving to books…"}</Badge> : null}
              </li>
            ))}
          </ul>
          {paid && !cancelled ? (
            <p className="text-[12px] text-ink">
              Paid {formatINR(paid.paidPaise)} of {formatINR(s.totals.grandTotalPaise)}
              {paid.duePaise > 0 ? ` · ${formatINR(paid.duePaise)} still due` : ""}
            </p>
          ) : null}
        </section>

        <p className="text-2xs text-ink-faint">
          Billed by {s.createdBy}
          {s.createdAt ? ` on ${s.createdAt.toLocaleString("en-IN")}` : ""}.
        </p>
      </div>

      {receiving && paid ? <ReceivePaymentDialog sale={s} duePaise={paid.duePaise} onClose={() => setReceiving(false)} /> : null}
      {cancelling ? <CancelDialog sale={s} onClose={() => setCancelling(false)} /> : null}
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

function ReceivePaymentDialog({ sale: s, duePaise, onClose }: { sale: SaleRow; duePaise: number; onClose: () => void }) {
  const registers = useRegisters();
  const regs = registers.status === "ready" ? registers.data.filter((r) => r.isActive && !r.placeholder) : [];
  const [registerId, setRegisterId] = useState("");
  const reg = regs.find((r) => r.id === (registerId || regs[0]?.id));
  const [amount, setAmount] = useState(String(duePaise / 100));
  const [day, setDay] = useState(indiaDate());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  let paise = NaN;
  try {
    paise = rupeesToPaise(amount);
  } catch {
    paise = NaN;
  }
  const problem = !reg ? "Choose where the money went." : !Number.isInteger(paise) || paise <= 0 ? "Give the amount." : paise > duePaise ? `Only ${formatINR(duePaise)} is due — record any extra separately in Money in & out.` : null;
  return (
    <Modal title={`Payment for ${s.invoiceNo}`} onClose={onClose} busy={busy}>
      <p className="text-[12px] text-ink-muted">
        From {s.customer.name} · {formatINR(duePaise)} still due
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Into" htmlFor="rp-into">
          <Select id="rp-into" value={reg?.id ?? ""} onChange={(e) => setRegisterId(e.target.value)}>
            {regs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount (₹)" htmlFor="rp-amount">
          <Input id="rp-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="num" autoFocus />
        </Field>
        <Field label="Day" htmlFor="rp-day">
          <Input id="rp-day" type="date" value={day} max={indiaDate()} min={s.invoiceDate} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </Field>
        <Field label="Note" htmlFor="rp-note">
          <Input id="rp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. cheque no." maxLength={500} />
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
                from: { kind: "PARTY", entityId: s.customer.entityId, name: s.customer.name },
                to: { kind: reg.kind, registerId: reg.id, name: reg.name },
                amountPaise: paise,
                businessDay: day,
                note: note.trim() || null,
                saleId: s.id,
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

function CancelDialog({ sale: s, onClose }: { sale: SaleRow; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={`Cancel ${s.invoiceNo}`} onClose={onClose} busy={busy}>
      <p className="text-[13px] text-ink">
        {s.customer.name} · {formatINR(s.totals.grandTotalPaise)} · {s.invoiceDate}
      </p>
      <ul className="list-disc space-y-0.5 pl-5 text-[12px] text-ink-muted">
        <li>The stock comes back today.</li>
        <li>The books reverse the sale. Anything already paid stays as the customer's credit (pay it back from Money in & out if needed).</li>
        <li>The number {s.invoiceNo} stays used and shows as cancelled. Bill again with a new sale if needed.</li>
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
              await cancelSale(s.id, reason);
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
              setBusy(false);
            }
          }}
        >
          Cancel invoice
        </Button>
      </div>
    </Modal>
  );
}
