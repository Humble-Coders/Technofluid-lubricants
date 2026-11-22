import clsx from "clsx";
import { Ban, IndianRupee } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { formatINR, formatQuantity, formatRate, GST_STATES, indiaDate, rupeesToPaise } from "@technofluid/core";
import { BackLink, Badge, Banner, Button, Detail, Details, Dialog, EmptyState, ErrorState, Field, Input, LoadingState, Menu, MoneyInput, Page, PageHeader, Section, Select, Table, Td, Th, Tr } from "@/components/ui";
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

  if (purchase.status === "loading") {
    return (
      <Page>
        <LoadingState />
      </Page>
    );
  }
  if (purchase.status === "error") {
    return (
      <Page>
        <BackLink to="/purchases">Purchases</BackLink>
        <ErrorState>{purchase.message}</ErrorState>
      </Page>
    );
  }
  if (!p) {
    return (
      <Page>
        <BackLink to="/purchases">Purchases</BackLink>
        <EmptyState title="That purchase doesn't exist" />
      </Page>
    );
  }

  const cancelled = p.status === "CANCELLED";
  const t = p.totals;
  const nothingPaid = p.payments.length === 0 && (paid?.later.length ?? 0) === 0;

  return (
    <Page>
      <PageHeader
        back={{ to: "/purchases", label: "Purchases" }}
        title={p.ref}
        subtitle={`${p.supplier.name} · bill ${p.billNo}`}
        badge={
          <>
            {paid ? <PaidBadge paid={paid} /> : null}
            <PurchaseBooksStatus purchase={p} />
          </>
        }
        actions={
          <>
            {!cancelled && paid && paid.duePaise > 0 ? (
              <Button variant="primary" icon={<IndianRupee />} onClick={() => setPaying(true)}>
                Pay
              </Button>
            ) : null}
            <Menu items={[!cancelled && { label: "Cancel purchase", icon: <Ban />, danger: true, onSelect: () => setCancelling(true) }]} />
          </>
        }
      />

      {(cancelled && p.cancel) || p.stockAlreadyCounted ? (
        <div className="mb-6 space-y-2">
          {cancelled && p.cancel ? (
            <Banner tone="danger">
              Cancelled on {p.cancel.day} by {p.cancel.by}: {p.cancel.reason}. {p.stockAlreadyCounted ? "" : "The stock went back out; "}the books were reversed.
            </Banner>
          ) : null}
          {p.stockAlreadyCounted ? <Banner tone="info">The goods were already counted in stock — this bill changed the books only.</Banner> : null}
        </div>
      ) : null}

      <article className={clsx(cancelled && "opacity-70")} aria-label="Supplier bill">
        <Details columns={3}>
          <Detail label="Supplier">
            <span className="font-medium">{p.supplier.name}</span>
          </Detail>
          <Detail label="GSTIN">{p.supplier.gstin ? <span className="num">{p.supplier.gstin}</span> : "Unregistered (no GSTIN) — no GST"}</Detail>
          {p.supplier.stateCode ? <Detail label="State">{GST_STATES[p.supplier.stateCode] ?? p.supplier.stateCode}</Detail> : null}
          <Detail label="Bill no.">{p.billNo}</Detail>
          <Detail label="Bill date">
            <span className="num">{p.billDate}</span>
          </Detail>
          <Detail label="Our ref.">
            <span className="num">{p.ref}</span>
          </Detail>
        </Details>

        <Section title="Items">
          <Table>
            <thead>
              <tr>
                <Th className="w-10">#</Th>
                <Th>Item</Th>
                <Th align="right">Quantity</Th>
                <Th align="right">Value before GST</Th>
                <Th align="right">GST</Th>
                <Th align="right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {p.lines.map((l, i) => (
                <Tr key={i}>
                  <Td muted>{i + 1}</Td>
                  <Td>{l.itemName}</Td>
                  <Td num>{formatQuantity(l.qtyMilli, l.baseUnit)}</Td>
                  <Td num>
                    {formatINR(l.taxablePaise)}
                    <span className="block text-caption text-ink-muted">
                      {formatINR(l.unitCostPaise)} / {perUnit(l.baseUnit)}
                    </span>
                  </Td>
                  <Td num>
                    {formatRate(l.gstRateBp)}
                    <span className="block text-caption text-ink-muted">{formatINR(l.cgstPaise + l.sgstPaise + l.igstPaise)}</span>
                  </Td>
                  <Td num>{formatINR(l.totalPaise)}</Td>
                </Tr>
              ))}
              {p.freight ? (
                <Tr>
                  <Td />
                  <Td colSpan={2}>Freight</Td>
                  <Td num>{formatINR(p.freight.taxablePaise)}</Td>
                  <Td num>{formatRate(p.freight.gstRateBp)}</Td>
                  <Td num>{formatINR(p.freight.totalPaise)}</Td>
                </Tr>
              ) : null}
            </tbody>
          </Table>

          <div className="mt-4 flex items-start justify-between gap-8">
            <div className="min-w-0 flex-1">{p.note ? <p className="selectable text-body text-ink-muted">Note: {p.note}</p> : null}</div>
            <div className="w-80 shrink-0 space-y-1.5">
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
              <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2">
                <span className="font-semibold text-ink">Bill total</span>
                <span className="num text-title font-semibold text-ink">{formatINR(p.billTotalPaise)}</span>
              </div>
            </div>
          </div>
        </Section>
      </article>

      <Section title="Payments">
        {nothingPaid ? (
          <p className="text-body text-ink-muted">Nothing paid yet — on credit.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Day</Th>
                <Th>Paid from</Th>
                <Th>Note</Th>
                <Th align="right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {p.payments.map((x, i) => (
                <Tr key={i}>
                  <Td className="num whitespace-nowrap">{p.billDate}</Td>
                  <Td>{x.name}</Td>
                  <Td muted>With the bill</Td>
                  <Td num>{formatINR(x.amountPaise)}</Td>
                </Tr>
              ))}
              {paid?.later.map((e) => {
                const off = e.reversedByEntryId ? "text-ink-subtle" : undefined;
                return (
                  <Tr key={e.id}>
                    <Td className={clsx("num whitespace-nowrap", off)}>{e.businessDay}</Td>
                    <Td className={off}>{e.from.kind === "ADJUSTMENT" ? "—" : e.from.name}</Td>
                    <Td muted>
                      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                        {e.note}
                        {e.reversedByEntryId ? <Badge>Reversed</Badge> : e.syncStatus !== "SYNCED" ? <Badge tone={e.syncStatus === "FAILED" ? "danger" : "neutral"}>{e.syncStatus === "FAILED" ? "Not posted" : "Saving to books…"}</Badge> : null}
                      </span>
                    </Td>
                    <Td num className={clsx(off, e.reversedByEntryId && "line-through")}>
                      {formatINR(e.amountPaise)}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {paid && !cancelled ? (
          <p className="mt-3 text-body text-ink">
            Paid <span className="num">{formatINR(paid.paidPaise)}</span> of <span className="num">{formatINR(p.billTotalPaise)}</span>
            {paid.duePaise > 0 ? ` · ${formatINR(paid.duePaise)} still to pay` : ""}
          </p>
        ) : null}
      </Section>

      <p className="mt-10 text-caption text-ink-subtle">
        Recorded by {p.createdBy}
        {p.createdAt ? ` on ${p.createdAt.toLocaleString("en-IN")}` : ""}.
      </p>

      {paying && paid ? <PayDialog purchase={p} duePaise={paid.duePaise} onClose={() => setPaying(false)} /> : null}
      {cancelling ? <CancelDialog purchase={p} onClose={() => setCancelling(false)} /> : null}
    </Page>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
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
    <Dialog
      title={`Payment for ${p.ref}`}
      subtitle={`To ${p.supplier.name} · bill ${p.billNo} · ${formatINR(duePaise)} still to pay`}
      onClose={onClose}
      busy={busy}
      size="md"
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
            {busy ? "Saving…" : "Save payment"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="From" htmlFor="pp-from">
          <Select id="pp-from" value={reg?.id ?? ""} onChange={(e) => setRegisterId(e.target.value)}>
            {regs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount" htmlFor="pp-amount">
          <MoneyInput id="pp-amount" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label="Day" htmlFor="pp-day">
          <Input id="pp-day" type="date" value={day} max={indiaDate()} min={p.billDate} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </Field>
        <Field label="Note" htmlFor="pp-note" optional>
          <Input id="pp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. cheque no., UTR" maxLength={500} />
        </Field>
      </div>
      {error ? <Banner tone="danger">{error}</Banner> : null}
    </Dialog>
  );
}

function CancelDialog({ purchase: p, onClose }: { purchase: PurchaseRow; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      danger
      title={`Cancel ${p.ref}`}
      subtitle={`${p.supplier.name} · bill ${p.billNo} · ${formatINR(p.billTotalPaise)} · ${p.billDate}`}
      onClose={onClose}
      busy={busy}
      size="md"
      footer={
        <>
          {!reason.trim() ? <span className="mr-auto min-w-0 text-label text-ink-muted">Give a reason to cancel.</span> : null}
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
            {busy ? "Cancelling…" : "Cancel purchase"}
          </Button>
        </>
      }
    >
      <ul className="list-disc space-y-1 pl-5 text-body text-ink-muted">
        {p.stockAlreadyCounted ? <li>Stock isn't touched (the goods were counted separately).</li> : <li>The stock goes back out today.</li>}
        <li>The books reverse the bill. Anything already paid stays — the supplier then owes it back (record a refund as money received).</li>
        <li>Enter the bill again with New purchase if it was a mistake in the details.</li>
      </ul>
      <Field label="Reason" htmlFor="pc-reason">
        <Input id="pc-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus maxLength={300} />
      </Field>
      {error ? <Banner tone="danger">{error}</Banner> : null}
    </Dialog>
  );
}
