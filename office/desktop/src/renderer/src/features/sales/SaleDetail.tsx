import clsx from "clsx";
import { Ban, IndianRupee } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useParams } from "react-router";
import { amountInWords, formatINR, formatQuantity, formatRate, GST_STATES, indiaDate, INVOICE_COPIES, rupeesToPaise } from "@technofluid/core";
import { Badge, Banner, Button, Dialog, EmptyState, ErrorState, Field, Input, LoadingState, Menu, MoneyInput, Page, PageHeader, Section, Select, Spinner, Table, Td, Th, Tr } from "@/components/ui";
import { useInvoicePreview, usePdfReady } from "@/hooks/useInvoicePreview";
import { useRegisters } from "@/hooks/useMoney";
import { useSale, useSalesPaid } from "@/hooks/useSales";
import { recordMoneyEntry } from "@/services/moneyService";
import { cancelSale, type CreateSaleResult, type SaleRow } from "@/services/saleService";
import { InvoicePdfButtons } from "./InvoicePdfButtons";
import { BooksStatus, PaidBadge } from "./saleBadges";

const PRICE_PER_SHORT: Record<string, string> = { "per litre": "/L", "per liter": "/L", "per kg": "/kg", "per case": "/case", "per bucket": "/bucket", "per barrel": "/barrel", "per piece": "/pc" };

/**
 * One invoice on screen — the real PDF that prints (Humble Bill Engine, the chosen copy),
 * or, where this copy of the app can't make PDFs (or for a cancelled invoice), our own
 * layout of the tax invoice: seller, buyer, lines with HSN, GST, total in words; then what's been paid,
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
  const [copy, setCopy] = useState<string>(INVOICE_COPIES[0]);
  const pdfReady = usePdfReady();
  const preview = useInvoicePreview(s, copy, pdfReady);

  if (sale.status === "loading") {
    return (
      <Page>
        <LoadingState />
      </Page>
    );
  }
  if (sale.status === "error") {
    return (
      <Page>
        <PageHeader back={{ to: "/sales", label: "Sales" }} title="Invoice" />
        <ErrorState>{sale.message}</ErrorState>
      </Page>
    );
  }
  if (!s) {
    return (
      <Page>
        <PageHeader back={{ to: "/sales", label: "Sales" }} title="Invoice" />
        <EmptyState title="That invoice doesn't exist" />
      </Page>
    );
  }

  const intra = s.totals.supplyType === "INTRA_STATE";
  const cancelled = s.status === "CANCELLED";
  const nothingPaid = s.payments.length === 0 && (paid?.later.length ?? 0) === 0;

  return (
    <Page>
      <PageHeader
        back={{ to: "/sales", label: "Sales" }}
        title={s.invoiceNo}
        subtitle={`${s.customer.buyer?.name ? `${s.customer.buyer.name} (walk-in)` : s.customer.name} · ${s.invoiceDate} · ${formatINR(s.totals.grandTotalPaise)}`}
        badge={
          <>
            {paid ? <PaidBadge paid={paid} /> : null}
            <BooksStatus sale={s} />
          </>
        }
        actions={
          <>
            {!cancelled && paid && paid.duePaise > 0 && !s.customer.isWalkIn ? (
              <Button variant="primary" icon={<IndianRupee />} onClick={() => setReceiving(true)}>
                Receive payment
              </Button>
            ) : null}
            <Menu items={[!cancelled && { label: "Cancel invoice", icon: <Ban />, danger: true, onSelect: () => setCancelling(true) }]} />
          </>
        }
      />

      <div className="mb-6 flex flex-col gap-2 empty:hidden">
        {justCreated && justCreated.belowZero.length > 0 && !cancelled ? (
          <Banner tone="warning">
            Stock is now below zero for {justCreated.belowZero.map((b) => b.name).join(", ")} — record what came in or was made.
          </Banner>
        ) : null}
        {s.lines.some((l) => l.manualPrice) ? (
          <Banner tone="info">
            The price of {s.lines.filter((l) => l.manualPrice).map((l) => `${l.productName} · ${l.packLabel}`).join(", ")} was typed by an Admin for this sale (no price on the price list).
          </Banner>
        ) : null}
        {cancelled && s.cancel ? (
          <Banner tone="danger">
            Cancelled on {s.cancel.day} by {s.cancel.by}: {s.cancel.reason}. The stock came back; the number stays used.
          </Banner>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        {!cancelled ? <InvoicePdfButtons sale={s} copy={copy} onCopy={setCopy} ready={pdfReady} /> : null}

        {preview.status === "loading" ? (
          <div className="flex aspect-[210/297] w-full max-w-[832px] items-center justify-center gap-2 rounded-control border border-line bg-surface text-label text-ink-muted">
            <Spinner /> Preparing the invoice…
          </div>
        ) : preview.status === "ready" ? (
          <iframe
            key={preview.url}
            src={`${preview.url}#toolbar=0&navpanes=0&view=FitH`}
            title={`${s.invoiceNo} ${copy} — as it prints`}
            className="aspect-[210/297] w-full max-w-[832px] rounded-control border border-line bg-white"
          />
        ) : null}
        {preview.status === "error" ? <Banner tone="danger">{preview.message} Showing the invoice details instead.</Banner> : null}

        {preview.status === "off" || preview.status === "error" ? (
          <article className={clsx("rounded-control border border-line p-6 text-label", cancelled && "opacity-70")} aria-label="Tax invoice">
            <header className="flex items-start justify-between gap-6 border-b border-line-row pb-4">
              <div>
                <p className="text-title font-semibold text-ink">{s.seller.tradeName ?? s.seller.legalName}</p>
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
                <p className="text-title font-semibold text-ink">Tax invoice</p>
                <p className="text-ink">
                  No. <span className="num font-medium">{s.invoiceNo}</span>
                </p>
                <p className="text-ink">Date {s.invoiceDate}</p>
              </div>
            </header>

            <section className="grid grid-cols-2 gap-6 border-b border-line-row py-4">
              <div>
                <p className="text-caption text-ink-muted">Billed to</p>
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
                  <div className="mb-3">
                    <p className="text-caption text-ink-muted">Shipped to</p>
                    <p className="font-medium text-ink">{s.shipTo.name}</p>
                    <p className="text-ink-muted">{[s.shipTo.address, s.shipTo.city, s.shipTo.pincode].filter(Boolean).join(", ")}</p>
                    <p className="text-ink-muted">
                      {GST_STATES[s.shipTo.stateCode] ?? s.shipTo.stateCode} ({s.shipTo.stateCode}){s.shipTo.gstin ? ` · GSTIN ${s.shipTo.gstin}` : ""}
                    </p>
                  </div>
                ) : null}
                <p className="text-caption text-ink-muted">Place of supply</p>
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

            <Table className="mt-2">
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Product</Th>
                  <Th>HSN</Th>
                  <Th align="right">Qty</Th>
                  <Th align="right">Rate</Th>
                  <Th align="right">Disc.</Th>
                  <Th align="right">Taxable</Th>
                  <Th align="right">GST</Th>
                  <Th align="right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {s.lines.map((l, i) => (
                  <Tr key={i}>
                    <Td muted>{i + 1}</Td>
                    <Td>
                      {l.productName}
                      <span className="block text-caption text-ink-muted">
                        {l.packLabel} · {formatQuantity(l.qtyMilli, l.baseUnit)}
                      </span>
                    </Td>
                    <Td>
                      {l.hsnCode ?? (
                        <span className="text-warning" title="No HSN code">
                          —
                        </span>
                      )}
                    </Td>
                    <Td num>{l.packs}</Td>
                    <Td num>
                      {formatINR(l.packPricePaise)}
                      <span className="block text-caption text-ink-muted">
                        {formatINR(l.listPricePaise)}
                        {PRICE_PER_SHORT[l.pricePer] ?? ` ${l.pricePer}`}
                      </span>
                    </Td>
                    <Td num>{l.discountBp ? `${formatRate(l.discountBp)} · ${formatINR(l.discountPaise)}` : "—"}</Td>
                    <Td num>{formatINR(l.taxablePaise)}</Td>
                    <Td num>{formatRate(l.gstRateBp)}</Td>
                    <Td num>{formatINR(l.totalPaise)}</Td>
                  </Tr>
                ))}
                {s.freight ? (
                  <Tr>
                    <Td />
                    <Td colSpan={5}>Freight</Td>
                    <Td num>{formatINR(s.freight.taxablePaise)}</Td>
                    <Td num>{formatRate(s.freight.gstRateBp)}</Td>
                    <Td num>{formatINR(s.freight.totalPaise)}</Td>
                  </Tr>
                ) : null}
              </tbody>
            </Table>

            <section className="mt-6 grid grid-cols-[minmax(0,1fr)_280px] gap-8">
              <div className="space-y-3">
                <table className="w-full border-collapse text-caption">
                  <thead>
                    <tr className="border-b border-line text-left text-ink-muted">
                      <th className="h-8 pr-3 font-medium">GST rate</th>
                      <th className="h-8 pr-3 text-right font-medium">Taxable</th>
                      {intra ? (
                        <>
                          <th className="h-8 pr-3 text-right font-medium">CGST</th>
                          <th className="h-8 text-right font-medium">SGST</th>
                        </>
                      ) : (
                        <th className="h-8 text-right font-medium">IGST</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {s.totals.byRate.map((r) => (
                      <tr key={r.gstRateBp} className="border-b border-line-row">
                        <td className="py-1.5 pr-3">{formatRate(r.gstRateBp)}</td>
                        <td className="num py-1.5 pr-3 text-right">{formatINR(r.taxablePaise)}</td>
                        {intra ? (
                          <>
                            <td className="num py-1.5 pr-3 text-right">{formatINR(r.cgstPaise)}</td>
                            <td className="num py-1.5 text-right">{formatINR(r.sgstPaise)}</td>
                          </>
                        ) : (
                          <td className="num py-1.5 text-right">{formatINR(r.igstPaise)}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-ink">{amountInWords(s.totals.grandTotalPaise)}</p>
                {s.note ? <p className="text-ink-muted">Note: {s.note}</p> : null}
              </div>
              <div className="space-y-1.5">
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
                <div className="flex items-baseline justify-between border-t border-line pt-2">
                  <span className="font-semibold text-ink">Total</span>
                  <span className="num text-title font-semibold text-ink">{formatINR(s.totals.grandTotalPaise)}</span>
                </div>
              </div>
            </section>
          </article>
        ) : null}

        {s.missingHsn.length > 0 ? <Banner tone="warning">Billed without an HSN code for {s.missingHsn.length} product(s) — codes are awaited from the CA.</Banner> : null}
      </div>

      <Section
        title="Payments"
        description={
          paid && !cancelled
            ? `Paid ${formatINR(paid.paidPaise)} of ${formatINR(s.totals.grandTotalPaise)}${paid.duePaise > 0 ? ` · ${formatINR(paid.duePaise)} still due` : ""}`
            : undefined
        }
      >
        {nothingPaid ? (
          <p className="text-body text-ink-muted">Nothing paid yet — on credit.</p>
        ) : (
          <ul className="border-t border-line-row">
            {s.payments.map((p, i) => (
              <li key={i} className="flex min-h-11 items-center gap-3 border-b border-line-row py-1.5">
                <span className="selectable min-w-0 flex-1 text-ink">
                  Into {p.name}, at billing ({s.invoiceDate})
                </span>
                <span className="selectable num shrink-0 text-right text-ink">{formatINR(p.amountPaise)}</span>
              </li>
            ))}
            {paid?.later.map((e) => (
              <li key={e.id} className={clsx("flex min-h-11 items-center gap-3 border-b border-line-row py-1.5", e.reversedByEntryId ? "text-ink-subtle" : "text-ink")}>
                <span className="selectable min-w-0 flex-1">
                  Into {e.to.kind === "ADJUSTMENT" ? "—" : e.to.name}, {e.businessDay}
                  {e.note ? ` · ${e.note}` : ""}
                </span>
                {e.reversedByEntryId ? <Badge>Reversed</Badge> : e.syncStatus !== "SYNCED" ? <Badge tone={e.syncStatus === "FAILED" ? "danger" : "neutral"}>{e.syncStatus === "FAILED" ? "Not posted" : "Saving to books…"}</Badge> : null}
                <span className={clsx("selectable num shrink-0 text-right", e.reversedByEntryId && "line-through")}>{formatINR(e.amountPaise)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="mt-10 text-caption text-ink-subtle">
        Billed by {s.createdBy}
        {s.createdAt ? ` on ${s.createdAt.toLocaleString("en-IN")}` : ""}.
      </p>

      {receiving && paid ? <ReceivePaymentDialog sale={s} duePaise={paid.duePaise} onClose={() => setReceiving(false)} /> : null}
      {cancelling ? <CancelDialog sale={s} onClose={() => setCancelling(false)} /> : null}
    </Page>
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
    <Dialog
      title={`Payment for ${s.invoiceNo}`}
      subtitle={`From ${s.customer.name} · ${formatINR(duePaise)} still due`}
      size="md"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          {problem ? <span className="mr-auto min-w-0 text-label text-ink-muted">{problem}</span> : null}
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
            {busy ? "Saving…" : "Save payment"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Into" htmlFor="rp-into">
          <Select id="rp-into" value={reg?.id ?? ""} onChange={(e) => setRegisterId(e.target.value)}>
            {regs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount" htmlFor="rp-amount">
          <MoneyInput id="rp-amount" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label="Day" htmlFor="rp-day">
          <Input id="rp-day" type="date" value={day} max={indiaDate()} min={s.invoiceDate} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </Field>
        <Field label="Note" htmlFor="rp-note" optional>
          <Input id="rp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. cheque no." maxLength={500} />
        </Field>
      </div>
      {error ? <Banner tone="danger">{error}</Banner> : null}
    </Dialog>
  );
}

function CancelDialog({ sale: s, onClose }: { sale: SaleRow; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      title={`Cancel ${s.invoiceNo}`}
      size="md"
      danger
      onClose={onClose}
      busy={busy}
      footer={
        <>
          {!reason.trim() ? <span className="mr-auto min-w-0 text-label text-ink-muted">Give a reason.</span> : null}
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
            {busy ? "Cancelling…" : "Cancel invoice"}
          </Button>
        </>
      }
    >
      <p className="text-body text-ink">
        {s.customer.name} · {formatINR(s.totals.grandTotalPaise)} · {s.invoiceDate}
      </p>
      <ul className="list-disc space-y-1 pl-5 text-label text-ink-muted">
        <li>The stock comes back today.</li>
        <li>The books reverse the sale. Anything already paid stays as the customer's credit (pay it back from Money in & out if needed).</li>
        <li>The number {s.invoiceNo} stays used and shows as cancelled. Bill again with a new sale if needed.</li>
      </ul>
      <Field label="Reason" htmlFor="cancel-reason">
        <Input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is it being cancelled?" autoFocus maxLength={300} />
      </Field>
      {error ? <Banner tone="danger">{error}</Banner> : null}
    </Dialog>
  );
}
