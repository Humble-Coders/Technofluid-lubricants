import clsx from "clsx";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  amountInWords,
  formatINR,
  formatRate,
  GST_STATES,
  indiaDate,
  packsAvailable,
  priceSale,
  rupeesToPaise,
  SALE_ERROR_TEXT,
  SALE_LINE_ERROR_TEXT,
  SALE_PAYMENT_ERROR_TEXT,
  saleError,
  salePaymentError,
  tierPrice,
  toMilli,
  cleanDispatch,
  cleanShipTo,
  cleanWalkInBuyer,
  DISPATCH_ERROR_TEXT,
  dispatchError,
  WALK_IN_BUYER_ERROR_TEXT,
  WALK_IN_BUYER_NEEDED_FROM_PAISE,
  WALK_IN_ENTITY_ID,
  walkInBuyerError,
  type SaleLineInput,
  type SaleProduct,
} from "@technofluid/core";
import { Badge, Banner, Button, Checkbox, Field, IconButton, Input, MoneyInput, PageHeader, Section, Select, Spinner, tableClass, Workspace, WorkspacePanel } from "@/components/ui";
import { useEntities, useEntityBalances } from "@/hooks/useEntities";
import { useRegisters } from "@/hooks/useMoney";
import { useProducts } from "@/hooks/useProducts";
import { useStaff } from "@/features/auth/session";
import { useCompany, useNextInvoiceNo } from "@/hooks/useSales";
import { useStockItems } from "@/hooks/useStock";
import type { EntityRow } from "@/services/entityService";
import type { Product } from "@/services/productService";
import { createSale } from "@/services/saleService";
import { newRequestId } from "@/services/stockService";
import { SearchPicker } from "./SearchPicker";

/** manualPrice: an Admin's pack price (₹) for this sale, only for a product with no price. */
type Line = { key: number; product: Product | null; packs: string; discount: string; manualPrice: string };
type Pay = { registerId: string; amount: string };

const toSaleProduct = (p: Product): SaleProduct => ({
  sku: p.sku,
  name: p.name,
  grade: p.grade,
  packLabel: p.packLabel,
  productKey: p.productKey,
  packQty: p.packQty,
  baseUnit: p.baseUnit,
  pricePer: p.pricePer,
  dealerPricePaise: p.dealerPricePaise,
  distributorPricePaise: p.distributorPricePaise,
  gstPct: p.gstPct,
  hsnCode: p.hsnCode,
  active: p.active,
});

/** "5" → 500, "2.5" → 250 basis points; NaN if not a percent with at most two decimals. */
function percentToBp(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return NaN;
  const [whole, frac = ""] = t.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

const STATES = Object.entries(GST_STATES).sort((a, b) => a[1].localeCompare(b[1]));

const EMPTY_LINE = { product: null, packs: "1", discount: "", manualPrice: "" } as const;

const packsOf = (t: string) => (/^\d+$/.test(t.trim()) ? Number(t.trim()) : NaN);
const paiseOf = (t: string) => {
  if (!t.trim()) return 0;
  try {
    return rupeesToPaise(t);
  } catch {
    return NaN;
  }
};

const lineTh = "sticky top-0 z-10 h-10 border-b border-line bg-surface px-2 text-label font-medium whitespace-nowrap text-ink-muted first:pl-0 last:pr-0";
const lineTd = "border-b border-line-row px-2 py-1.5 align-top first:pl-0 last:pr-0";

const WALK_IN_STAND_IN = (stateCode: string): EntityRow => ({
  id: WALK_IN_ENTITY_ID,
  name: "Walk-in / cash customer",
  kinds: ["customer"],
  phones: [],
  email: null,
  gstin: null,
  gstVerified: null,
  address: { line1: "", line2: "", city: "", district: "", pincode: "", stateCode },
  priceTier: "Dealer",
  creditLimitPaise: null,
  notes: null,
  distributorId: null,
  isWalkIn: true,
  isActive: true,
  opening: null,
  syncStatus: "SYNCED",
  hlSyncError: null,
  importNotes: [],
  createdAt: null,
});

/**
 * Bill a customer (Admin, Accounts). Everything shown here is a PREVIEW worked out with
 * the shared rules — the Cloud Function prices it again, numbers it and takes the stock
 * out. Problems are spelled out next to the Save button; stock, HSN and credit-limit
 * warnings never block.
 */
export function NewSaleScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { role } = useStaff();
  const isAdmin = role === "admin";
  const today = indiaDate();
  const company = useCompany();
  const seller = company.status === "ready" ? company.data : null;
  const entities = useEntities();
  const products = useProducts({ withPrices: true });
  const stock = useStockItems();
  const registers = useRegisters();
  const balances = useEntityBalances(null);

  const customers = useMemo(() => {
    const list = entities.status === "ready" ? entities.data.filter((e) => e.isActive) : [];
    const withWalkIn = list.some((e) => e.id === WALK_IN_ENTITY_ID) ? list : [WALK_IN_STAND_IN(seller?.stateCode ?? "06"), ...list];
    // Customers first; anyone can be billed (kinds are labels only).
    return [...withWalkIn].sort((a, b) => Number(b.isWalkIn) - Number(a.isWalkIn) || Number(b.kinds.includes("customer")) - Number(a.kinds.includes("customer")) || a.name.localeCompare(b.name));
  }, [entities, seller?.stateCode]);
  const productList = useMemo(() => (products.status === "ready" ? products.data.filter((p) => p.active) : []), [products]);
  const regs = useMemo(() => (registers.status === "ready" ? registers.data.filter((r) => r.isActive && !r.placeholder) : []), [registers]);

  const [customerId, setCustomerId] = useState<string | null>(params.get("customer"));
  const customer = customers.find((c) => c.id === customerId) ?? null;
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [lines, setLines] = useState<Line[]>([{ key: 0, ...EMPTY_LINE }]);
  const [nextKey, setNextKey] = useState(1);
  const [freight, setFreight] = useState("");
  const [pays, setPays] = useState<Pay[]>([]);
  const [note, setNote] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [transport, setTransport] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [station, setStation] = useState("");
  const [ewayBillNo, setEwayBillNo] = useState("");
  const [shipElsewhere, setShipElsewhere] = useState(false);
  const [ship, setShip] = useState({ name: "", address: "", city: "", pincode: "", stateCode: "", gstin: "" });
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tier = customer?.priceTier ?? null;
  const placeOfSupply = customer ? (customer.isWalkIn ? (seller?.stateCode ?? null) : customer.address.stateCode) : null;
  const filled = lines.filter((l) => l.product);
  const freightPaise = paiseOf(freight);
  const payments = pays.map((p) => ({ registerId: p.registerId, amountPaise: paiseOf(p.amount) }));
  const nextInvoiceNo = useNextInvoiceNo(invoiceDate, seller?.invoicePrefix ?? null);
  const dispatch = cleanDispatch({ transport, vehicleNo, station, ewayBillNo });
  const shipTo = shipElsewhere && !customer?.isWalkIn ? cleanShipTo({ ...ship, stateCode: ship.stateCode || placeOfSupply || "" }) : null;
  const buyer = customer?.isWalkIn ? cleanWalkInBuyer({ name: buyerName, phone: buyerPhone, address: buyerAddress }) : null;

  /** True when this line's product has no price for the customer's price list. */
  const noListPrice = (p: Product) => (tier ? tierPrice(toSaleProduct(p), tier) === null : false);
  /** The lines as the sale sends them; an Admin's typed price only where there is no list price. */
  const lineInputs = (): SaleLineInput[] =>
    filled.map((l) => ({
      sku: l.product!.sku,
      packs: packsOf(l.packs),
      discountBp: percentToBp(l.discount),
      manualPackPricePaise: isAdmin && noListPrice(l.product!) && l.manualPrice.trim() ? paiseOf(l.manualPrice) : null,
    }));

  const priced = useMemo(() => {
    if (!tier || !placeOfSupply || !seller || !GST_STATES[placeOfSupply] || filled.length === 0 || !Number.isInteger(freightPaise) || freightPaise < 0) return null;
    const map: Record<string, SaleProduct> = {};
    for (const l of filled) map[l.product!.sku] = toSaleProduct(l.product!);
    return priceSale({
      products: map,
      lines: lineInputs(),
      tier,
      sellerStateCode: seller.stateCode,
      placeOfSupplyStateCode: placeOfSupply,
      freightPaise,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lineInputs reads only what is listed here.
  }, [filled, tier, placeOfSupply, seller, freightPaise, isAdmin]);

  const lineError = (l: Line): string | null => {
    if (!l.product || !priced || priced.ok) return null;
    const i = filled.indexOf(l);
    const e = priced.errors.find((x) => x.line === i);
    if (e?.code === "NO_PRICE") return isAdmin ? "No price on this price list — type a price for one pack (this sale only)." : "No price on this price list — an Admin can set one for this sale.";
    return e ? SALE_LINE_ERROR_TEXT[e.code] : null;
  };
  const pricedLine = (l: Line) => (priced?.ok ? priced.lines[filled.indexOf(l)] : undefined);

  // Stock left per pool after this sale (warning only — stock may go below zero).
  const shortPools = useMemo(() => {
    const onHand = new Map((stock.status === "ready" ? stock.data : []).map((s) => [s.id, s.onHandMilli]));
    const need = new Map<string, number>();
    for (const l of filled) {
      const packs = packsOf(l.packs);
      if (!Number.isInteger(packs)) continue;
      const id = `pool_${l.product!.productKey}`;
      need.set(id, (need.get(id) ?? 0) + packs * toMilli(l.product!.packQty));
    }
    const short = new Set<string>();
    for (const [id, qty] of need) if ((onHand.get(id) ?? 0) < qty) short.add(id);
    return { short, onHand };
  }, [filled, stock]);

  const problem = (() => {
    if (company.status === "ready" && !seller) return "The company details aren't set up yet — an Admin must fill them in under Settings.";
    if (!customer) return "Choose a customer.";
    const head = saleError({ customerEntityId: customer.id, priceTier: tier, placeOfSupplyStateCode: placeOfSupply, invoiceDate, lineCount: filled.length, freightPaise, payments, note: note.trim() || null }, today);
    if (head) return SALE_ERROR_TEXT[head];
    if (lines.some((l) => !l.product && (l.packs !== "1" || l.discount))) return "A line has no product — pick one or remove the line.";
    if (!priced) return "Working it out…";
    if (!priced.ok) {
      const e = priced.errors[0]!;
      return `Line ${lines.indexOf(filled[e.line]!) + 1}: ${lineError(filled[e.line]!) ?? SALE_LINE_ERROR_TEXT[e.code]}`;
    }
    const who = walkInBuyerError(customer.isWalkIn, buyer, priced.totals.taxablePaise);
    if (who) return WALK_IN_BUYER_ERROR_TEXT[who];
    if (shipElsewhere && !customer.isWalkIn && !shipTo) return DISPATCH_ERROR_TEXT.SHIP_TO_NO_NAME;
    const dis = dispatchError(dispatch, shipTo, customer.isWalkIn);
    if (dis) return DISPATCH_ERROR_TEXT[dis];
    const pay = salePaymentError(customer.id, priced.totals.grandTotalPaise, payments);
    return pay ? SALE_PAYMENT_ERROR_TEXT[pay] : null;
  })();

  const t = priced?.ok ? priced.totals : null;
  const balance = customer ? (balances.balances?.[customer.id]?.balancePaise ?? null) : null;
  const paidNow = payments.reduce((s, p) => s + (Number.isInteger(p.amountPaise) ? p.amountPaise : 0), 0);
  const overLimit = customer?.creditLimitPaise != null && t && balance !== null && balance + t.grandTotalPaise - paidNow > customer.creditLimitPaise;

  const save = async () => {
    if (problem || !customer) return;
    setBusy(true);
    setError(null);
    try {
      const r = await createSale(requestId, {
        customerEntityId: customer.id,
        invoiceDate,
        lines: lineInputs(),
        freightPaise,
        payments,
        note: note.trim() || null,
        walkInBuyer: buyer,
        dispatch,
        shipTo,
      });
      navigate(`/sales/${r.saleId}`, { state: { justCreated: r } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRequestId(newRequestId());
      setBusy(false);
    }
  };

  const loading = entities.status === "loading" || products.status === "loading" || company.status === "loading";

  return (
    <Workspace
      panel={
        <WorkspacePanel
          title="Invoice details"
          footer={
            <>
              <div className="space-y-1 text-label">
                <Row label="Value before discount" value={t ? formatINR(t.grossPaise) : "—"} />
                {t && t.discountPaise > 0 ? <Row label="Discount" value={`−${formatINR(t.discountPaise)}`} /> : null}
                {priced?.ok && priced.freight ? <Row label="Freight" value={formatINR(priced.freight.taxablePaise)} /> : null}
                <Row label="Taxable value" value={t ? formatINR(t.taxablePaise) : "—"} strong />
                {t && t.supplyType === "INTRA_STATE" ? (
                  <>
                    <Row label="CGST" value={formatINR(t.cgstPaise)} />
                    <Row label="SGST" value={formatINR(t.sgstPaise)} />
                  </>
                ) : t ? (
                  <Row label="IGST" value={formatINR(t.igstPaise)} />
                ) : null}
                {t && t.roundOffPaise !== 0 ? <Row label="Round off" value={`${t.roundOffPaise > 0 ? "+" : "−"}${formatINR(Math.abs(t.roundOffPaise))}`} /> : null}
              </div>
              <div className="border-t border-line pt-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-ink">Invoice total</span>
                  <span className="num text-page font-semibold text-ink">{t ? formatINR(t.grandTotalPaise) : "—"}</span>
                </div>
                {t ? <p className="mt-0.5 text-caption text-ink-muted">{amountInWords(t.grandTotalPaise)}</p> : null}
              </div>
              {t && paidNow > 0 ? (
                <div className="space-y-1 text-label">
                  <Row label="Paid now" value={formatINR(paidNow)} />
                  {paidNow < t.grandTotalPaise ? <Row label="Left on credit" value={formatINR(t.grandTotalPaise - paidNow)} /> : null}
                </div>
              ) : null}
              {error ? <Banner tone="danger">{error}</Banner> : null}
              {problem ? <p className="text-label text-ink-muted">{problem}</p> : null}
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => navigate("/sales")} disabled={busy}>
                  Cancel
                </Button>
                <Button variant="primary" className="flex-1" onClick={() => void save()} loading={busy} disabled={Boolean(problem)}>
                  {busy ? "Saving…" : "Save invoice"}
                </Button>
              </div>
            </>
          }
        >
          <Field label="Customer" htmlFor="ns-customer">
            <div className="[&_[role=listbox]]:max-w-full">
              <SearchPicker
                id="ns-customer"
                items={customers}
                value={customer}
                onChange={(c) => setCustomerId(c?.id ?? null)}
                keyOf={(c) => c.id}
                labelOf={(c) => c.name}
                searchOf={(c) => `${c.name} ${c.gstin ?? ""} ${c.address.city} ${c.phones.join(" ")}`.toLowerCase()}
                meta={(c) => [c.address.city, c.priceTier ?? "no price list"].filter(Boolean).join(" · ")}
                placeholder="Type a name, GSTIN or city"
                autoFocus={!customerId}
              />
            </div>
          </Field>
          <div className="space-y-1 text-label">
            <p className="font-medium text-ink">Billed as</p>
            {customer ? (
              <>
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-ink">
                  {tier ? <span>{tier} price list</span> : <Badge tone="danger">No price list</Badge>}
                  <span className="text-ink-faint" aria-hidden>
                    ·
                  </span>
                  {placeOfSupply && GST_STATES[placeOfSupply] ? <span>{placeOfSupply === seller?.stateCode ? "CGST + SGST" : "IGST"}</span> : <Badge tone="danger">No state</Badge>}
                </p>
                <p className="text-ink-muted">
                  {placeOfSupply ? GST_STATES[placeOfSupply] ?? placeOfSupply : "—"}
                  {customer.gstin ? ` · ${customer.gstin}` : customer.isWalkIn ? "" : " · no GSTIN"}
                </p>
              </>
            ) : (
              <p className="text-ink-muted">Choose a customer</p>
            )}
          </div>
          {overLimit ? (
            <Banner tone="warning">
              This takes {customer!.name} over their credit limit of {formatINR(customer!.creditLimitPaise!)} (they owe {formatINR(balance!)} now).
            </Banner>
          ) : null}
          {customer?.isWalkIn ? (
            <div className="space-y-3">
              <div>
                <p className="text-label font-medium text-ink">Buyer on the invoice</p>
                <p className="mt-0.5 text-caption text-ink-subtle">
                  {t && t.taxablePaise >= WALK_IN_BUYER_NEEDED_FROM_PAISE
                    ? "Name and address needed for a bill of ₹50,000 or more (before GST)"
                    : "Optional; name and address needed from ₹50,000 (before GST)"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name" htmlFor="ns-buyer-name">
                  <Input id="ns-buyer-name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} maxLength={100} placeholder="e.g. Ravi Kumar" />
                </Field>
                <Field label="Phone" htmlFor="ns-buyer-phone">
                  <Input id="ns-buyer-phone" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} maxLength={20} inputMode="tel" placeholder="Optional" />
                </Field>
              </div>
              <Field label="Address" htmlFor="ns-buyer-address">
                <Input id="ns-buyer-address" value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} maxLength={200} placeholder="Shop / street, city" />
              </Field>
            </div>
          ) : null}
          <Field label="Invoice date" htmlFor="ns-date">
            <Input id="ns-date" type="date" value={invoiceDate} max={today} onChange={(e) => e.target.value && setInvoiceDate(e.target.value)} />
          </Field>
          <Field label="Freight charged (before GST)" htmlFor="ns-freight" help="Taxed at the goods' GST rate.">
            <MoneyInput id="ns-freight" value={freight} onChange={(e) => setFreight(e.target.value)} placeholder="0" />
          </Field>
          <Field label="Note on the invoice" htmlFor="ns-note">
            <Input id="ns-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Optional — e.g. vehicle no., order ref." />
          </Field>
          <div className="space-y-2">
            <div>
              <p className="text-label font-medium text-ink">Paid now</p>
              <p className="mt-0.5 text-caption text-ink-subtle">{customer?.isWalkIn ? "A walk-in pays the full amount" : "Leave empty if on credit"}</p>
            </div>
            {pays.map((p, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center gap-2">
                  <Select value={p.registerId} onChange={(e) => setPays((ps) => ps.map((x, j) => (j === i ? { ...x, registerId: e.target.value } : x)))} aria-label={`Payment ${i + 1} into`} className="min-w-0 flex-1">
                    {regs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                  <MoneyInput value={p.amount} onChange={(e) => setPays((ps) => ps.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} placeholder="Amount" className="w-28 shrink-0" aria-label={`Payment ${i + 1} amount`} />
                  <IconButton size="sm" label={`Remove payment ${i + 1}`} onClick={() => setPays((ps) => ps.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </IconButton>
                </div>
                {t && pays.length === 1 ? (
                  <div className="flex justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setPays((ps) => ps.map((x, j) => (j === i ? { ...x, amount: String(t.grandTotalPaise / 100) } : x)))}>
                      Full amount
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
            {pays.length < 2 && regs.length > 0 ? (
              <Button size="sm" icon={<Plus />} onClick={() => setPays((ps) => [...ps, { registerId: regs.find((r) => !ps.some((x) => x.registerId === r.id))?.id ?? regs[0]!.id, amount: "" }])}>
                {pays.length === 0 ? "Add payment received now" : "Split: add a second payment"}
              </Button>
            ) : null}
          </div>
        </WorkspacePanel>
      }
    >
      <div className="@container px-8 pt-6 pb-10">
        <PageHeader
          back={{ to: "/sales", label: "Sales" }}
          title="New sale"
          badge={loading ? <Spinner /> : null}
          subtitle={
            nextInvoiceNo ? (
              <span title="The number is given when the invoice is saved — if someone else saves one first, this one takes the next number.">
                Invoice no. <span className="num font-medium text-ink">{nextInvoiceNo}</span> (given on save)
              </span>
            ) : undefined
          }
        />

        <table className={clsx(tableClass.table, "min-w-[36rem]")}>
          <thead>
            <tr>
              <th scope="col" className={clsx(lineTh, "text-left")}>
                Product
              </th>
              <th scope="col" className={clsx(lineTh, "w-18 text-left")}>
                Packs
              </th>
              <th scope="col" className={clsx(lineTh, "w-30 text-right")}>
                Price / pack
              </th>
              <th scope="col" className={clsx(lineTh, "w-18 text-left")}>
                Disc. %
              </th>
              <th scope="col" className={clsx(lineTh, "hidden w-28 text-right @4xl:table-cell")}>
                Taxable
              </th>
              <th scope="col" className={clsx(lineTh, "hidden w-14 text-right @4xl:table-cell")}>
                GST
              </th>
              <th scope="col" className={clsx(lineTh, "w-28 text-right")}>
                Amount
              </th>
              <th scope="col" className={clsx(lineTh, "w-9")} />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => {
              const pl = pricedLine(l);
              const err = lineError(l);
              const pool = l.product ? `pool_${l.product.productKey}` : null;
              const packQtyMilli = l.product ? toMilli(l.product.packQty) : 0;
              const left = pool && packQtyMilli > 0 ? packsAvailable(Math.max(shortPools.onHand.get(pool) ?? 0, 0), packQtyMilli) : null;
              const listPrice = l.product && tier ? tierPrice(toSaleProduct(l.product), tier) : null;
              return (
                <tr key={l.key}>
                  <td className={lineTd}>
                    <SearchPicker
                      items={productList}
                      value={l.product}
                      onChange={(p) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, product: p } : x)))}
                      keyOf={(p) => p.sku}
                      labelOf={(p) => `${[p.name, p.grade].filter(Boolean).join(" ")} · ${p.packLabel}`}
                      searchOf={(p) => `${p.name} ${p.grade} ${p.packLabel} ${p.sku}`.toLowerCase()}
                      meta={(p) => {
                        const price = tier ? tierPrice(toSaleProduct(p), tier) : null;
                        return price === null ? "no price" : `${formatINR(price)} ${p.pricePer ?? ""}`;
                      }}
                      placeholder={`Line ${idx + 1}: type a product`}
                      autoFocus={idx > 0 && !l.product}
                    />
                    <div className="mt-1 flex flex-wrap gap-x-3 text-caption empty:hidden">
                      {l.product && listPrice !== null ? <span className="text-ink-subtle">{formatINR(listPrice)} {l.product.pricePer}</span> : null}
                      {pl ? (
                        <span className="num text-ink-subtle @4xl:hidden">
                          Taxable {formatINR(pl.taxablePaise)} · GST {formatRate(pl.gstRateBp)}
                        </span>
                      ) : null}
                      {l.product && !l.product.hsnCode ? <span className="text-warning">No HSN code</span> : null}
                      {pool && shortPools.short.has(pool) ? <span className="text-warning">Stock short — {left} pack{left === 1 ? "" : "s"} in stock</span> : null}
                      {err ? <span className="text-danger">{err}</span> : null}
                    </div>
                  </td>
                  <td className={lineTd}>
                    <Input value={l.packs} onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, packs: e.target.value } : x)))} inputMode="numeric" className="num" aria-label={`Line ${idx + 1} packs`} />
                  </td>
                  <td className={clsx(lineTd, "num text-right leading-8")}>
                    {isAdmin && l.product && noListPrice(l.product) ? (
                      <>
                        <MoneyInput
                          value={l.manualPrice}
                          onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, manualPrice: e.target.value } : x)))}
                          placeholder="per pack"
                          aria-label={`Line ${idx + 1} price for one pack, this sale only`}
                        />
                        <span className="mt-1 block text-caption text-ink-subtle">this sale only</span>
                      </>
                    ) : pl ? (
                      formatINR(pl.packPricePaise)
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={lineTd}>
                    <Input value={l.discount} onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, discount: e.target.value } : x)))} inputMode="decimal" placeholder="0" className="num" aria-label={`Line ${idx + 1} discount percent`} />
                  </td>
                  <td className={clsx(lineTd, "num hidden text-right leading-8 @4xl:table-cell")}>{pl ? formatINR(pl.taxablePaise) : "—"}</td>
                  <td className={clsx(lineTd, "num hidden text-right leading-8 text-ink-muted @4xl:table-cell")}>{pl ? formatRate(pl.gstRateBp) : ""}</td>
                  <td className={clsx(lineTd, "num text-right leading-8 font-medium")}>{pl ? formatINR(pl.totalPaise) : "—"}</td>
                  <td className={lineTd}>
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

        {priced?.ok && priced.missingHsn.length > 0 ? (
          <Banner tone="warning" className="mt-4">
            {priced.missingHsn.length} product{priced.missingHsn.length === 1 ? " has" : "s have"} no HSN code yet — the invoice can still go out (codes are awaited from the CA; GST is 18% for now).
          </Banner>
        ) : null}
        {shortPools.short.size > 0 ? (
          <Banner tone="warning" className="mt-4">
            Some products are short in stock — the sale is still recorded and stock goes below zero.
          </Banner>
        ) : null}

        <Section title="Dispatch" description="Printed on the invoice; all optional">
          <div className="grid grid-cols-2 gap-4 @xl:grid-cols-4">
            <Field label="Transport" htmlFor="ns-transport">
              <Input id="ns-transport" value={transport} onChange={(e) => setTransport(e.target.value)} maxLength={60} placeholder="e.g. Sample Cargo" />
            </Field>
            <Field label="Vehicle no." htmlFor="ns-vehicle">
              <Input id="ns-vehicle" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value.toUpperCase())} maxLength={15} placeholder="HR99X0001" />
            </Field>
            <Field label="Station" htmlFor="ns-station">
              <Input id="ns-station" value={station} onChange={(e) => setStation(e.target.value)} maxLength={40} placeholder="e.g. Jagadhri" />
            </Field>
            <Field label="E-way bill no." htmlFor="ns-eway">
              <Input id="ns-eway" value={ewayBillNo} onChange={(e) => setEwayBillNo(e.target.value)} inputMode="numeric" maxLength={14} placeholder="12 digits" className="num" />
            </Field>
          </div>
          <div className="mt-4">
            {customer?.isWalkIn ? (
              <p className="text-label text-ink-muted">A walk-in sale can't be shipped to another address. Bill it to a saved customer to ship elsewhere.</p>
            ) : (
              <Checkbox
                checked={shipElsewhere}
                onChange={(e) => setShipElsewhere(e.target.checked)}
                label={
                  <span>
                    Ship to a different address <span className="text-ink-muted">(GST still follows the billed-to customer's state)</span>
                  </span>
                }
              />
            )}
          </div>
          {shipElsewhere && !customer?.isWalkIn ? (
            <div className="mt-4 grid grid-cols-2 gap-4 @xl:grid-cols-3">
              <Field label="Ship to (name)" htmlFor="ns-ship-name">
                <Input id="ns-ship-name" value={ship.name} onChange={(e) => setShip((x) => ({ ...x, name: e.target.value }))} maxLength={120} />
              </Field>
              <Field label="Address" htmlFor="ns-ship-address">
                <Input id="ns-ship-address" value={ship.address} onChange={(e) => setShip((x) => ({ ...x, address: e.target.value }))} maxLength={200} placeholder="Shop / street" />
              </Field>
              <Field label="City" htmlFor="ns-ship-city">
                <Input id="ns-ship-city" value={ship.city} onChange={(e) => setShip((x) => ({ ...x, city: e.target.value }))} maxLength={60} />
              </Field>
              <Field label="State" htmlFor="ns-ship-state">
                <Select id="ns-ship-state" value={ship.stateCode || placeOfSupply || ""} onChange={(e) => setShip((x) => ({ ...x, stateCode: e.target.value }))}>
                  <option value="">Choose…</option>
                  {STATES.map(([c, l]) => (
                    <option key={c} value={c}>
                      {l} ({c})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="PIN code" htmlFor="ns-ship-pin">
                <Input id="ns-ship-pin" value={ship.pincode} onChange={(e) => setShip((x) => ({ ...x, pincode: e.target.value }))} inputMode="numeric" maxLength={6} />
              </Field>
              <Field label="GSTIN" optional htmlFor="ns-ship-gstin">
                <Input id="ns-ship-gstin" value={ship.gstin} onChange={(e) => setShip((x) => ({ ...x, gstin: e.target.value.toUpperCase() }))} maxLength={15} className="font-mono" />
              </Field>
            </div>
          ) : null}
        </Section>
      </div>
    </Workspace>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={clsx(strong ? "font-medium text-ink" : "text-ink-muted")}>{label}</span>
      <span className={clsx("num text-ink", strong && "font-medium")}>{value}</span>
    </div>
  );
}
