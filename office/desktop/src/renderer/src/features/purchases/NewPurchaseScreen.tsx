import clsx from "clsx";
import { ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  BUYABLE_KINDS,
  formatINR,
  formatRate,
  GST_STATES,
  indiaDate,
  parseQuantityToMilli,
  pricePurchase,
  PURCHASE_ERROR_TEXT,
  PURCHASE_LINE_ERROR_TEXT,
  purchaseError,
  purchaseTotalsError,
  rupeesToPaise,
  SELLER_STATE_CODE,
  suggestRoundOff,
  supplierGstState,
  WALK_IN_ENTITY_ID,
  type PurchaseItem,
  type PurchaseLineInput,
} from "@technofluid/core";
import { Banner, Button, Checkbox, Field, IconButton, Input, MoneyInput, PageHeader, Select, Spinner, tableClass, Workspace, WorkspacePanel } from "@/components/ui";
import { EntityForm } from "@/features/entities/EntityForm";
import { SearchPicker } from "@/features/sales/SearchPicker";
import { KIND_LABEL, unitWord } from "@/features/stock/stockFormat";
import { useEntities } from "@/hooks/useEntities";
import { useRegisters } from "@/hooks/useMoney";
import type { RegisterRow } from "@/services/moneyService";
import { useStockItems } from "@/hooks/useStock";
import { createPurchase } from "@/services/purchaseService";
import { newRequestId, type StockItem } from "@/services/stockService";

type Line = { key: number; item: StockItem | null; qty: string; taxable: string; gst: string };
type Pay = { registerId: string; amount: string };
type PanelTab = "bill" | "payment";

const EMPTY_LINE = { item: null, qty: "", taxable: "", gst: "" } as const;

const lineTh = "sticky top-0 z-10 h-10 border-b border-line bg-surface px-2 text-label font-medium whitespace-nowrap text-ink-muted first:pl-0 last:pr-0";
const lineTd = "border-b border-line-row px-2 py-1.5 align-top first:pl-0 last:pr-0 @max-xl:border-b-0 @max-xl:px-0 @max-xl:py-0";
// Below a 576px-wide lines area (the smallest window, next to the form panel) each line stacks:
// the picker on its own row, the figures under it with a small label each, so nothing scrolls sideways.
const stackTable = "@max-xl:block";
const stackHead = "@max-xl:hidden";
const stackBody = "@max-xl:block";
const stackRow = "@max-xl:grid @max-xl:items-start @max-xl:gap-x-2 @max-xl:gap-y-1.5 @max-xl:border-b @max-xl:border-line-row @max-xl:py-2";
const stackLabel = "mb-1 block text-caption text-ink-subtle @xl:hidden";

/** "18" → 1800, "2.5" → 250 basis points; NaN if not a percent with at most two decimals. */
function percentToBp(text: string): number {
  const t = text.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return NaN;
  const [whole, frac = ""] = t.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}
const paiseOf = (t: string, empty = 0) => {
  if (!t.trim()) return empty;
  try {
    return rupeesToPaise(t);
  } catch {
    return NaN;
  }
};
const milliOf = (t: string) => {
  try {
    return parseQuantityToMilli(t);
  } catch {
    return NaN;
  }
};
const signed = (p: number) => `${p > 0 ? "+" : p < 0 ? "−" : ""}${formatINR(Math.abs(p))}`;

/**
 * Record a supplier's bill (Admin, Accounts). Type it as printed: each line's quantity,
 * value before GST and GST %, then freight and the bill's total. Everything worked out
 * here is a PREVIEW with the shared rules — the Cloud Function prices it again, refuses
 * it unless our total matches the supplier's, numbers it PB/… and brings the stock in.
 */
export function NewPurchaseScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = indiaDate();
  const entities = useEntities();
  const stock = useStockItems();
  const registers = useRegisters();

  const allEntities = useMemo(() => (entities.status === "ready" ? entities.data : []), [entities]);
  const suppliers = useMemo(
    // Suppliers first; anyone can be bought from (kinds are labels only) — not the walk-in.
    () => allEntities.filter((e) => e.isActive && e.id !== WALK_IN_ENTITY_ID && !e.isWalkIn).sort((a, b) => Number(b.kinds.includes("supplier")) - Number(a.kinds.includes("supplier")) || a.name.localeCompare(b.name)),
    [allEntities],
  );
  const items = useMemo(() => (stock.status === "ready" ? stock.data.filter((s) => BUYABLE_KINDS.includes(s.kind)) : []), [stock]);
  const regs = useMemo(() => (registers.status === "ready" ? registers.data.filter((r) => r.isActive && !r.placeholder) : []), [registers]);

  const [supplierId, setSupplierId] = useState<string | null>(params.get("supplier"));
  const supplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const [adding, setAdding] = useState<{ name: string } | null>(null);
  const [tab, setTab] = useState<PanelTab>("bill");
  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState(today);
  const [lines, setLines] = useState<Line[]>([{ key: 0, ...EMPTY_LINE }]);
  const [nextKey, setNextKey] = useState(1);
  const [freight, setFreight] = useState("");
  const [roundOff, setRoundOff] = useState<string | null>(null);
  const [supplierTotal, setSupplierTotal] = useState("");
  const [alreadyCounted, setAlreadyCounted] = useState(false);
  const [cash, setCash] = useState<Pay>({ registerId: "", amount: "" });
  const [bank, setBank] = useState<Pay>({ registerId: "", amount: "" });
  const [note, setNote] = useState("");
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gstState = supplierGstState(supplier?.gstin ?? null);
  const registered = gstState !== null;
  const defaultRate = registered ? "18" : "0";
  const filled = lines.filter((l) => l.item);
  const freightPaise = paiseOf(freight);
  // Cash and Bank are always there; an empty or 0 amount means nothing paid that way.
  const cashRegs = regs.filter((r) => r.kind === "CASH");
  const bankRegs = regs.filter((r) => r.kind === "BANK");
  const payments = [
    { pay: cash, list: cashRegs },
    { pay: bank, list: bankRegs },
  ]
    .filter(({ pay }) => pay.amount.trim() !== "" && paiseOf(pay.amount, NaN) !== 0)
    .map(({ pay, list }) => ({ registerId: pay.registerId || list[0]?.id || "", amountPaise: paiseOf(pay.amount, NaN) }));

  const lineInputs: PurchaseLineInput[] = filled.map((l) => ({
    itemId: l.item!.id,
    qtyMilli: milliOf(l.qty),
    taxablePaise: paiseOf(l.taxable, NaN),
    gstRateBp: percentToBp(l.gst.trim() || defaultRate),
  }));
  const itemMap: Record<string, PurchaseItem> = {};
  for (const l of filled) itemMap[l.item!.id] = { id: l.item!.id, name: l.item!.name, kind: l.item!.kind, baseUnit: l.item!.unitSet ? l.item!.baseUnit : null };

  // Price once without a round-off to suggest one, then with the one in use.
  const exact = filled.length && Number.isInteger(freightPaise) && freightPaise >= 0
    ? pricePurchase({ items: itemMap, lines: lineInputs, freightPaise, supplierStateCode: gstState, sellerStateCode: SELLER_STATE_CODE, roundOffPaise: 0 })
    : null;
  const suggested = exact?.ok ? suggestRoundOff(exact.totals.exactTotalPaise) : 0;
  const roundOffPaise = roundOff === null ? suggested : paiseOf(roundOff.replace(/^\+/, ""));
  const priced = exact?.ok && Number.isInteger(roundOffPaise)
    ? pricePurchase({ items: itemMap, lines: lineInputs, freightPaise, supplierStateCode: gstState, sellerStateCode: SELLER_STATE_CODE, roundOffPaise })
    : exact;
  const t = priced?.ok ? priced.totals : null;
  const supplierTotalPaise = paiseOf(supplierTotal, NaN);

  const lineError = (l: Line): string | null => {
    if (!l.item || !priced || priced.ok) return null;
    const e = priced.errors.find((x) => x.line === filled.indexOf(l));
    return e ? PURCHASE_LINE_ERROR_TEXT[e.code] : null;
  };
  const pricedLine = (l: Line) => (priced?.ok ? priced.lines[filled.indexOf(l)] : undefined);

  const problem = (() => {
    if (!supplier) return PURCHASE_ERROR_TEXT.NO_SUPPLIER;
    const head = purchaseError(
      { supplierEntityId: supplier.id, billNo, billDate, lineCount: filled.length, lineRatesBp: lineInputs.map((l) => l.gstRateBp), supplierGstin: supplier.gstin, freightPaise, roundOffPaise, payments, note: note.trim() || null },
      today,
    );
    if (head) return PURCHASE_ERROR_TEXT[head];
    if (lines.some((l) => !l.item && (l.qty || l.taxable))) return "A line has no item. Pick one or remove the line.";
    if (!priced) return "Working it out…";
    if (!priced.ok) {
      const e = priced.errors[0]!;
      return `Line ${lines.indexOf(filled[e.line]!) + 1}: ${PURCHASE_LINE_ERROR_TEXT[e.code]}`;
    }
    if (!supplierTotal.trim()) return "Type the total printed on the supplier's bill.";
    if (!Number.isInteger(supplierTotalPaise)) return "The supplier's bill total isn't an amount.";
    const tot = purchaseTotalsError(priced.totals, supplierTotalPaise, payments);
    if (tot === "TOTAL_MISMATCH") return `Our total is ${formatINR(priced.totals.billTotalPaise)} but the supplier's bill says ${formatINR(supplierTotalPaise)}. Check the lines, freight and round-off.`;
    return tot ? PURCHASE_ERROR_TEXT[tot] : null;
  })();

  const paidNow = payments.reduce((s, p) => s + (Number.isInteger(p.amountPaise) ? p.amountPaise : 0), 0);
  const matches = t && Number.isInteger(supplierTotalPaise) && t.billTotalPaise === supplierTotalPaise;

  const save = async () => {
    if (problem || !supplier) return;
    setBusy(true);
    setError(null);
    try {
      const r = await createPurchase(requestId, {
        supplierEntityId: supplier.id,
        billNo: billNo.trim(),
        billDate,
        lines: lineInputs,
        freightPaise,
        roundOffPaise,
        supplierBillTotalPaise: supplierTotalPaise,
        payments,
        stockAlreadyCounted: alreadyCounted,
        note: note.trim() || null,
      });
      navigate(`/purchases/${r.purchaseId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRequestId(newRequestId());
      setBusy(false);
    }
  };

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const loading = entities.status === "loading" || stock.status === "loading";

  return (
    <>
      <Workspace
        panel={
          <WorkspacePanel
            footer={
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-ink">Our total</span>
                  <span className="num text-page font-semibold text-ink">{t ? formatINR(t.billTotalPaise) : "-"}</span>
                </div>
                {error ? <Banner tone="danger">{error}</Banner> : null}
                {problem ? <p className="text-label text-ink-muted">{problem}</p> : null}
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => navigate("/purchases")} disabled={busy}>
                    Cancel
                  </Button>
                  <Button variant="primary" className="flex-1" onClick={() => void save()} loading={busy} disabled={Boolean(problem)}>
                    {busy ? "Saving…" : "Save purchase"}
                  </Button>
                </div>
              </>
            }
          >
            <StepTabs
              value={tab}
              onChange={setTab}
              steps={[
                { key: "bill", label: "Bill details", done: Boolean(supplier && billNo.trim()) },
                { key: "payment", label: "Totals & payment", done: Boolean(matches) },
              ]}
            />
            {tab === "bill" ? (
              <>
                <Field label="Supplier" htmlFor="np-supplier">
                  <div className="[&_[role=listbox]]:w-84 [&_[role=listbox]]:max-w-84">
                    <SearchPicker
                      id="np-supplier"
                      items={suppliers}
                      value={supplier}
                      onChange={(s) => setSupplierId(s?.id ?? null)}
                      keyOf={(s) => s.id}
                      labelOf={(s) => s.name}
                      searchOf={(s) => `${s.name} ${s.gstin ?? ""} ${s.address.city} ${s.phones.join(" ")}`.toLowerCase()}
                      meta={(s) => [s.address.city, s.gstin ? "GSTIN" : "no GSTIN"].filter(Boolean).join(" · ")}
                      placeholder="Type a name, GSTIN or city"
                      autoFocus={!supplierId}
                      onCreate={(name) => setAdding({ name })}
                      createLabel="Add supplier"
                    />
                  </div>
                  <p className="mt-1.5 truncate text-caption text-ink-muted" title={supplier?.gstin ?? undefined}>
                    {!supplier ? (
                      "Not in the list? Type the name and choose Add supplier."
                    ) : registered ? (
                      <>
                        GST registered · {gstState === SELLER_STATE_CODE ? "CGST + SGST" : "IGST"} · {GST_STATES[gstState!] ?? gstState}
                      </>
                    ) : (
                      <span className="text-warning">{supplier.gstin ? "GSTIN not valid" : "No GSTIN"}, so the bill can't carry GST</span>
                    )}
                  </p>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Supplier's bill no." htmlFor="np-billno">
                    <Input id="np-billno" value={billNo} onChange={(e) => setBillNo(e.target.value)} maxLength={40} placeholder="As printed" />
                  </Field>
                  <Field label="Bill date" htmlFor="np-date">
                    <Input id="np-date" type="date" value={billDate} max={today} onChange={(e) => e.target.value && setBillDate(e.target.value)} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Freight (before GST)" htmlFor="np-freight">
                    <MoneyInput id="np-freight" value={freight} onChange={(e) => setFreight(e.target.value)} placeholder="0" />
                  </Field>
                  <Field label="Note" htmlFor="np-note">
                    <Input id="np-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Vehicle no., challan" />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-body text-ink">
                  <Checkbox checked={alreadyCounted} onChange={(e) => setAlreadyCounted(e.target.checked)} />
                  <span className="min-w-0 truncate">Already added to stock, don't add again</span>
                </label>
                <Button className="w-full" icon={<ArrowRight />} onClick={() => setTab("payment")}>
                  Next: Totals & payment
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-1.5 text-label">
                  <Row label="Value before GST" value={t ? formatINR(t.taxablePaise - (priced?.ok && priced.freight ? priced.freight.taxablePaise : 0)) : "-"} />
                  {priced?.ok && priced.freight ? <Row label="Freight" value={formatINR(priced.freight.taxablePaise)} /> : null}
                  {t && t.supplyType === "INTRA" ? (
                    <>
                      <Row label="Input CGST" value={formatINR(t.cgstPaise)} />
                      <Row label="Input SGST" value={formatINR(t.sgstPaise)} />
                    </>
                  ) : t && t.supplyType === "INTER" ? (
                    <Row label="Input IGST" value={formatINR(t.igstPaise)} />
                  ) : t ? (
                    <Row label="GST" value="none (unregistered)" />
                  ) : null}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink-muted">Round off</span>
                    <div className="flex items-center gap-2">
                      {roundOff !== null && exact?.ok && roundOffPaise !== suggested ? (
                        <button type="button" className="rounded text-caption font-medium text-accent hover:underline" onClick={() => setRoundOff(null)}>
                          use {signed(suggested)}
                        </button>
                      ) : null}
                      <MoneyInput value={roundOff ?? (suggested ? (suggested / 100).toFixed(2) : "")} onChange={(e) => setRoundOff(e.target.value)} placeholder="0.00" className="w-28" aria-label="Round off, rupees (minus to round down)" />
                    </div>
                  </div>
                </div>
                <Field
                  label="Supplier's bill total (as printed)"
                  htmlFor="np-total"
                  help={matches || !(t && supplierTotal.trim()) ? "Must match our total, to catch typing mistakes." : undefined}
                  error={t && supplierTotal.trim() && Number.isInteger(supplierTotalPaise) && !matches ? `Off by ${signed(supplierTotalPaise - t.billTotalPaise)}. Up to ₹1 goes in Round off.` : undefined}
                >
                  <div className="flex items-center gap-2">
                    <MoneyInput id="np-total" value={supplierTotal} onChange={(e) => setSupplierTotal(e.target.value)} invalid={Boolean(supplierTotal) && !matches} className="flex-1" />
                    {matches ? <Check className="size-4 shrink-0 text-success" aria-label="Matches" /> : null}
                  </div>
                </Field>
                <div className="space-y-2">
                  <p className="text-label font-medium text-ink">
                    Paid now <span className="font-normal text-ink-subtle">· 0 if on credit</span>
                  </p>
                  <PayRow label="Cash" pay={cash} onChange={setCash} accounts={cashRegs} />
                  <PayRow label="Bank" pay={bank} onChange={setBank} accounts={bankRegs} />
                  {t ? (
                    <div className="space-y-1 text-label">
                      <Row label="Still to pay" value={formatINR(Math.max(0, t.billTotalPaise - paidNow))} />
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </WorkspacePanel>
        }
      >
        <div className="@container px-8 pt-6 pb-10">
          <PageHeader back={{ to: "/purchases", label: "Purchases" }} title="New purchase" badge={loading ? <Spinner /> : null} subtitle="Our reference (PB/…) is given on save." />

          <table className={clsx(tableClass.table, stackTable)}>
            <thead className={stackHead}>
              <tr>
                <th scope="col" className={clsx(lineTh, "text-left")}>
                  Item
                </th>
                <th scope="col" className={clsx(lineTh, "w-32 text-left")}>
                  Quantity
                </th>
                <th scope="col" className={clsx(lineTh, "w-24 text-right")}>
                  Value before GST
                </th>
                <th scope="col" className={clsx(lineTh, "w-16 text-left")}>
                  GST %
                </th>
                <th scope="col" className={clsx(lineTh, "hidden w-28 text-right @4xl:table-cell")}>
                  GST
                </th>
                <th scope="col" className={clsx(lineTh, "w-24 text-right")}>
                  Amount
                </th>
                <th scope="col" className={clsx(lineTh, "w-9")} />
              </tr>
            </thead>
            <tbody className={stackBody}>
              {lines.map((l, idx) => {
                const pl = pricedLine(l);
                const err = lineError(l);
                return (
                  <tr key={l.key} className={clsx(stackRow, "@max-xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_3.5rem_minmax(0,1fr)_2rem]")}>
                    <td className={clsx(lineTd, "@max-xl:col-span-full @max-xl:[&_[role=listbox]]:max-w-full")}>
                      <SearchPicker
                        items={items}
                        value={l.item}
                        onChange={(item) => setLine(l.key, { item })}
                        keyOf={(i) => i.id}
                        labelOf={(i) => i.name}
                        searchOf={(i) => `${i.name} ${i.code ?? ""} ${i.aliases.join(" ")}`.toLowerCase()}
                        meta={(i) => `${KIND_LABEL[i.kind]} · ${i.unitSet ? unitWord(i.baseUnit) : "no unit"}`}
                        placeholder={`Line ${idx + 1}: type a raw material, consumable or product`}
                        autoFocus={idx > 0 && !l.item}
                      />
                      <div className="mt-1 flex flex-wrap gap-x-3 text-caption empty:hidden">
                        {pl && pl.qtyMilli > 0 ? (
                          <span className="num text-ink-subtle">
                            {formatINR(pl.unitCostPaise)} / {pl.baseUnit === "piece" ? "piece" : pl.baseUnit} before GST
                          </span>
                        ) : null}
                        {pl ? <span className="num text-ink-subtle @4xl:hidden">GST {formatINR(pl.cgstPaise + pl.sgstPaise + pl.igstPaise)}</span> : null}
                        {err ? <span className="text-danger">{err}</span> : null}
                      </div>
                    </td>
                    <td className={lineTd}>
                      <span className={stackLabel} aria-hidden>
                        Quantity
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Input value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} inputMode="decimal" className="num min-w-0 flex-1" aria-label={`Line ${idx + 1} quantity`} />
                        <span className="w-10 shrink-0 text-label text-ink-muted">{l.item?.unitSet ? unitWord(l.item.baseUnit) : ""}</span>
                      </div>
                    </td>
                    <td className={lineTd}>
                      <span className={stackLabel} aria-hidden>
                        Before GST
                      </span>
                      <MoneyInput value={l.taxable} onChange={(e) => setLine(l.key, { taxable: e.target.value })} aria-label={`Line ${idx + 1} value before GST`} />
                    </td>
                    <td className={lineTd}>
                      <span className={stackLabel} aria-hidden>
                        GST %
                      </span>
                      <Input value={l.gst} onChange={(e) => setLine(l.key, { gst: e.target.value })} inputMode="decimal" placeholder={defaultRate} className="num" aria-label={`Line ${idx + 1} GST percent`} />
                    </td>
                    <td className={clsx(lineTd, "num hidden text-right leading-8 text-ink-muted @4xl:table-cell")}>{pl ? formatINR(pl.cgstPaise + pl.sgstPaise + pl.igstPaise) : "-"}</td>
                    <td className={clsx(lineTd, "num text-right leading-8 font-medium")}>
                      <span className={stackLabel} aria-hidden>
                        Amount
                      </span>
                      {pl ? formatINR(pl.totalPaise) : "-"}
                    </td>
                    <td className={lineTd}>
                      <span className={clsx(stackLabel, "invisible")} aria-hidden>
                        &nbsp;
                      </span>
                      {lines.length > 1 ? (
                        <div className="flex h-8 items-center justify-end">
                          <IconButton size="sm" label={`Remove line ${idx + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                            <Trash2 />
                          </IconButton>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-3">
            <Button
              size="sm"
              icon={<Plus />}
              onClick={() => {
                setLines((ls) => [...ls, { key: nextKey, ...EMPTY_LINE }]);
                setNextKey((k) => k + 1);
              }}
            >
              Add line
            </Button>
          </div>
        </div>
      </Workspace>

      {adding ? (
        <EntityForm
          entity={null}
          all={allEntities}
          defaults={{ name: adding.name, kinds: ["supplier"] }}
          onClose={(id) => {
            setAdding(null);
            if (id) setSupplierId(id);
          }}
        />
      ) : null}
    </>
  );
}

/** The panel's two parts as big, numbered steps: the one you're on is filled orange, a finished one shows a tick. */
function StepTabs({ value, onChange, steps }: { value: PanelTab; onChange: (t: PanelTab) => void; steps: Array<{ key: PanelTab; label: string; done: boolean }> }) {
  return (
    <div role="tablist" aria-label="Bill parts" className="grid grid-cols-2 gap-1 rounded-control bg-surface-alt p-1 ring-1 ring-line ring-inset">
      {steps.map((st, i) => {
        const on = value === st.key;
        return (
          <button
            key={st.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(st.key)}
            className={clsx(
              "flex h-10 min-w-0 items-center justify-center gap-2 rounded-[6px] px-2 text-label font-semibold transition-colors",
              on ? "bg-accent text-white shadow-control" : "text-ink-muted hover:bg-surface hover:text-ink",
            )}
          >
            <span
              className={clsx(
                "flex size-5 shrink-0 items-center justify-center rounded-full text-caption",
                on ? "bg-white/25 text-white" : st.done ? "bg-success text-white" : "bg-surface text-ink-muted ring-1 ring-line",
              )}
              aria-hidden
            >
              {st.done && !on ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className="truncate">{st.label}</span>
            {st.done ? <span className="sr-only">(done)</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** One way of paying (Cash or Bank): which account (only asked when there's more than one) and how much. */
function PayRow({ label, pay, onChange, accounts }: { label: string; pay: Pay; onChange: (p: Pay) => void; accounts: RegisterRow[] }) {
  const registerId = pay.registerId || accounts[0]?.id || "";
  return (
    <div className="flex items-center gap-2">
      {accounts.length > 1 ? (
        <Select value={registerId} onChange={(e) => onChange({ ...pay, registerId: e.target.value })} aria-label={`${label} account`} className="min-w-0 flex-1">
          {accounts.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      ) : (
        <span className="min-w-0 flex-1 truncate text-body text-ink" title={accounts[0]?.name}>
          {accounts[0]?.name ?? `No ${label.toLowerCase()} account`}
        </span>
      )}
      <MoneyInput value={pay.amount} onChange={(e) => onChange({ ...pay, amount: e.target.value })} placeholder="0" className="w-32 shrink-0" aria-label={`Paid by ${label.toLowerCase()}, rupees`} disabled={accounts.length === 0} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <span className="num text-ink">{value}</span>
    </div>
  );
}
