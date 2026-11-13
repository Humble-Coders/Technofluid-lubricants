import clsx from "clsx";
import { ArrowLeft, Check, Plus, Trash2, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
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
import { Badge, Button, Card, Field, Input, Select, Spinner } from "@/components/ui";
import { EntityForm } from "@/features/entities/EntityForm";
import { SearchPicker } from "@/features/sales/SearchPicker";
import { KIND_LABEL, unitWord } from "@/features/stock/stockFormat";
import { useEntities } from "@/hooks/useEntities";
import { useRegisters } from "@/hooks/useMoney";
import { useStockItems } from "@/hooks/useStock";
import { createPurchase } from "@/services/purchaseService";
import { newRequestId, type StockItem } from "@/services/stockService";

type Line = { key: number; item: StockItem | null; qty: string; taxable: string; gst: string };
type Pay = { registerId: string; amount: string };

const EMPTY_LINE = { item: null, qty: "", taxable: "", gst: "" } as const;

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
  const [adding, setAdding] = useState(false);
  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState(today);
  const [lines, setLines] = useState<Line[]>([{ key: 0, ...EMPTY_LINE }]);
  const [nextKey, setNextKey] = useState(1);
  const [freight, setFreight] = useState("");
  const [roundOff, setRoundOff] = useState<string | null>(null);
  const [supplierTotal, setSupplierTotal] = useState("");
  const [alreadyCounted, setAlreadyCounted] = useState(false);
  const [pays, setPays] = useState<Pay[]>([]);
  const [note, setNote] = useState("");
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gstState = supplierGstState(supplier?.gstin ?? null);
  const registered = gstState !== null;
  const defaultRate = registered ? "18" : "0";
  const filled = lines.filter((l) => l.item);
  const freightPaise = paiseOf(freight);
  const payments = pays.map((p) => ({ registerId: p.registerId, amountPaise: paiseOf(p.amount, NaN) }));

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
    if (lines.some((l) => !l.item && (l.qty || l.taxable))) return "A line has no item — pick one or remove the line.";
    if (!priced) return "Working it out…";
    if (!priced.ok) {
      const e = priced.errors[0]!;
      return `Line ${lines.indexOf(filled[e.line]!) + 1}: ${PURCHASE_LINE_ERROR_TEXT[e.code]}`;
    }
    if (!supplierTotal.trim()) return "Type the total printed on the supplier's bill.";
    if (!Number.isInteger(supplierTotalPaise)) return "The supplier's bill total isn't an amount.";
    const tot = purchaseTotalsError(priced.totals, supplierTotalPaise, payments);
    if (tot === "TOTAL_MISMATCH") return `Our total is ${formatINR(priced.totals.billTotalPaise)} but the supplier's bill says ${formatINR(supplierTotalPaise)} — check the lines, freight and round-off.`;
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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-4 px-5 py-4">
        <div className="flex items-center gap-2">
          <Link to="/purchases" className="inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink">
            <ArrowLeft className="size-3.5" /> Purchases
          </Link>
          <h2 className="text-[16px] font-semibold text-ink">New purchase</h2>
          <span className="text-[12px] text-ink-muted">Our reference (PB/…) is given on save.</span>
          {loading ? <Spinner /> : null}
        </div>

        <Card className="grid grid-cols-[2fr_1fr_1fr_1.2fr] gap-4 p-4">
          <Field label="Supplier" htmlFor="np-supplier">
            <div className="flex gap-2">
              <div className="flex-1">
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
                />
              </div>
              <Button icon={<UserPlus className="size-3.5" />} onClick={() => setAdding(true)} title="Add a new supplier">
                Add
              </Button>
            </div>
          </Field>
          <Field label="Supplier's bill no." htmlFor="np-billno">
            <Input id="np-billno" value={billNo} onChange={(e) => setBillNo(e.target.value)} maxLength={40} placeholder="As printed" />
          </Field>
          <Field label="Bill date" htmlFor="np-date">
            <Input id="np-date" type="date" value={billDate} max={today} onChange={(e) => e.target.value && setBillDate(e.target.value)} />
          </Field>
          <div className="space-y-1 text-[12px]">
            <p className="font-medium text-ink">GST</p>
            {supplier ? (
              registered ? (
                <>
                  <p>
                    <Badge tone="info">Registered — input GST</Badge> <Badge>{gstState === SELLER_STATE_CODE ? "CGST + SGST" : "IGST"}</Badge>
                  </p>
                  <p className="text-ink-muted">
                    {supplier.gstin} · {GST_STATES[gstState!] ?? gstState}
                  </p>
                </>
              ) : (
                <>
                  <Badge tone="warning">Unregistered — no GST</Badge>
                  <p className="text-ink-muted">{supplier.gstin ? "The GSTIN on record isn't valid." : "No GSTIN on record."} The bill can't carry GST.</p>
                </>
              )
            ) : (
              <p className="text-ink-muted">Choose a supplier</p>
            )}
          </div>
        </Card>

        <Card className="p-0">
          <table className="w-full border-collapse text-[13px]">
            <thead className="text-left text-2xs tracking-wide text-ink-muted uppercase">
              <tr className="border-b border-line">
                <th className="py-2 pr-2 pl-3 font-medium">Item</th>
                <th className="w-36 py-2 pr-2 font-medium">Quantity</th>
                <th className="w-32 py-2 pr-2 font-medium">Value before GST ₹</th>
                <th className="w-20 py-2 pr-2 font-medium">GST %</th>
                <th className="w-28 py-2 pr-2 text-right font-medium">GST</th>
                <th className="w-28 py-2 pr-2 text-right font-medium">Amount</th>
                <th className="w-10 py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                const pl = pricedLine(l);
                const err = lineError(l);
                return (
                  <tr key={l.key} className="border-b border-line/70 align-top">
                    <td className="py-2 pr-2 pl-3">
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
                      <div className="mt-1 flex flex-wrap gap-x-3 text-2xs">
                        {pl && pl.qtyMilli > 0 ? (
                          <span className="text-ink-faint">
                            {formatINR(pl.unitCostPaise)} / {pl.baseUnit === "piece" ? "piece" : pl.baseUnit} before GST
                          </span>
                        ) : null}
                        {err ? <span className="text-danger">{err}</span> : null}
                      </div>
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-1.5">
                        <Input value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} inputMode="decimal" className="num" aria-label={`Line ${idx + 1} quantity`} />
                        <span className="text-[12px] text-ink-muted">{l.item?.unitSet ? unitWord(l.item.baseUnit) : ""}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-2">
                      <Input value={l.taxable} onChange={(e) => setLine(l.key, { taxable: e.target.value })} inputMode="decimal" className="num text-right" aria-label={`Line ${idx + 1} value before GST`} />
                    </td>
                    <td className="py-2 pr-2">
                      <Input value={l.gst} onChange={(e) => setLine(l.key, { gst: e.target.value })} inputMode="decimal" placeholder={defaultRate} className="num" aria-label={`Line ${idx + 1} GST percent`} />
                    </td>
                    <td className="num py-2 pr-2 text-right text-ink-muted">{pl ? formatINR(pl.cgstPaise + pl.sgstPaise + pl.igstPaise) : "—"}</td>
                    <td className="num py-2 pr-2 text-right font-medium">{pl ? formatINR(pl.totalPaise) : "—"}</td>
                    <td className="py-2 pr-3 text-right">
                      {lines.length > 1 ? (
                        <Button size="sm" variant="ghost" className="px-1.5" aria-label={`Remove line ${idx + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2">
            <Button
              size="sm"
              icon={<Plus className="size-3.5" />}
              onClick={() => {
                setLines((ls) => [...ls, { key: nextKey, ...EMPTY_LINE }]);
                setNextKey((k) => k + 1);
              }}
            >
              Add line
            </Button>
          </div>
        </Card>

        <div className="grid grid-cols-[1fr_380px] gap-4">
          <Card className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Freight on the bill (₹, before GST)" htmlFor="np-freight" help="Part of the cost; taxed at the highest line rate.">
                <Input id="np-freight" value={freight} onChange={(e) => setFreight(e.target.value)} inputMode="decimal" placeholder="0" className="num" />
              </Field>
              <Field label="Note" htmlFor="np-note">
                <Input id="np-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Optional — e.g. vehicle no., delivery challan" />
              </Field>
            </div>
            <label className="flex items-start gap-2 text-[12px] text-ink">
              <input type="checkbox" checked={alreadyCounted} onChange={(e) => setAlreadyCounted(e.target.checked)} className="mt-0.5 size-3.5 accent-brand-orange" />
              <span>
                Goods already counted in stock
                <span className="block text-ink-muted">Tick only if Stock & Production already recorded these goods as "In" — then this bill updates the books only, so stock isn't counted twice.</span>
              </span>
            </label>
            <div className="space-y-2">
              <p className="text-[12px] font-medium text-ink">
                Paid now <span className="font-normal text-ink-muted">— leave empty if on credit</span>
              </p>
              {pays.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={p.registerId} onChange={(e) => setPays((ps) => ps.map((x, j) => (j === i ? { ...x, registerId: e.target.value } : x)))} aria-label={`Payment ${i + 1} from`} className="w-52">
                    {regs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                  <Input value={p.amount} onChange={(e) => setPays((ps) => ps.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} inputMode="decimal" placeholder="Amount ₹" className="num w-40" aria-label={`Payment ${i + 1} amount`} />
                  {t && pays.length === 1 ? (
                    <Button size="sm" variant="ghost" onClick={() => setPays((ps) => ps.map((x, j) => (j === i ? { ...x, amount: String(t.billTotalPaise / 100) } : x)))}>
                      Full amount
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" className="px-1.5" aria-label={`Remove payment ${i + 1}`} onClick={() => setPays((ps) => ps.filter((_, j) => j !== i))}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
              {pays.length < 2 && regs.length > 0 ? (
                <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setPays((ps) => [...ps, { registerId: regs.find((r) => !ps.some((x) => x.registerId === r.id))?.id ?? regs[0]!.id, amount: "" }])}>
                  {pays.length === 0 ? "Add payment made now" : "Split: add a second payment"}
                </Button>
              ) : null}
            </div>
          </Card>

          <Card className="space-y-1.5 p-4 text-[13px]">
            <Row label="Value before GST" value={t ? formatINR(t.taxablePaise - (priced?.ok && priced.freight ? priced.freight.taxablePaise : 0)) : "—"} />
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
              <div className="flex items-center gap-1.5">
                {roundOff !== null && exact?.ok && roundOffPaise !== suggested ? (
                  <button type="button" className="text-2xs text-info hover:underline" onClick={() => setRoundOff(null)}>
                    use {signed(suggested)}
                  </button>
                ) : null}
                <Input value={roundOff ?? (suggested ? (suggested / 100).toFixed(2) : "")} onChange={(e) => setRoundOff(e.target.value)} inputMode="decimal" placeholder="0.00" className="num w-24 text-right" aria-label="Round off, rupees (minus to round down)" />
              </div>
            </div>
            <div className="flex items-baseline justify-between border-t border-line pt-2">
              <span className="font-semibold text-ink">Our total</span>
              <span className="num text-[20px] font-semibold text-ink">{t ? formatINR(t.billTotalPaise) : "—"}</span>
            </div>
            <Field label="Supplier's bill total (₹, as printed)" htmlFor="np-total">
              <div className="flex items-center gap-2">
                <Input id="np-total" value={supplierTotal} onChange={(e) => setSupplierTotal(e.target.value)} inputMode="decimal" className={clsx("num text-right", supplierTotal && !matches && "border-danger")} />
                {matches ? <Check className="size-4 text-success" aria-label="Matches" /> : null}
              </div>
            </Field>
            {t && supplierTotal.trim() && Number.isInteger(supplierTotalPaise) && !matches ? (
              <p className="text-2xs text-danger">Off by {signed(supplierTotalPaise - t.billTotalPaise)}. A difference up to ₹1 goes in Round off.</p>
            ) : null}
            {t && paidNow > 0 ? <Row label="Paid now" value={formatINR(paidNow)} /> : null}
            {t && paidNow > 0 && paidNow < t.billTotalPaise ? <Row label="Still to pay" value={formatINR(t.billTotalPaise - paidNow)} /> : null}
            {t && t.taxPaise > 0 ? <p className="text-2xs text-ink-muted">Input GST {formatINR(t.taxPaise)} is recorded to claim back{t.byRate.length > 1 ? ` (${t.byRate.map((r) => formatRate(r.gstRateBp)).join(", ")})` : ""}.</p> : null}
          </Card>
        </div>

        {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</p> : null}

        <div className="flex items-center justify-end gap-2 pb-6">
          {problem ? <span className="mr-auto text-[12px] text-ink-muted">{problem}</span> : null}
          <Button variant="ghost" onClick={() => navigate("/purchases")} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={busy} disabled={Boolean(problem)}>
            Save purchase
          </Button>
        </div>
      </div>

      {adding ? (
        <EntityForm
          entity={null}
          all={allEntities}
          onClose={(id) => {
            setAdding(false);
            if (id) setSupplierId(id);
          }}
        />
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-ink-muted">{label}</span>
      <span className="num text-ink">{value}</span>
    </div>
  );
}
