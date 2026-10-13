import { useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import { AlertTriangle, FlaskConical, Package, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatINR,
  formatQuantity,
  packPricePaise,
  piecesPerPackFromLabel,
  priceBasisFromLabel,
  toMilli,
} from "@technofluid/core";
import { Badge, Button, EmptyState, Input, Kbd, Spinner } from "@/components/ui";
import { canSeePrices } from "@/lib/access";
import { useStaff } from "@/features/auth/session";
import { useProducts } from "@/hooks/useProducts";
import type { Product } from "@/services/productService";

type CategoryFilter = "all" | "bulk_oil" | "grease" | "retail";
type SegmentFilter = "all" | "Automotive" | "Industrial";

const CATEGORY_LABEL: Record<string, string> = { bulk_oil: "Bulk oil", grease: "Grease", retail: "Retail pack" };
const ROW_HEIGHT = 40;

export function ProductsScreen() {
  const state = useProducts();
  const { role } = useStaff();
  const showPrices = canSeePrices(role);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [segment, setSegment] = useState<SegmentFilter>("all");
  const [missingPriceOnly, setMissingPriceOnly] = useState(false);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const products = state.status === "ready" ? state.data : [];

  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase();
    const words = text.split(/\s+/).filter(Boolean);
    return products.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      // "Both" products are visible to every segment.
      if (segment !== "all" && p.segment !== segment && p.segment !== "Both") return false;
      if (missingPriceOnly && p.dealerPricePaise !== null) return false;
      if (words.length === 0) return true;
      // Typing a SKU finds it directly; otherwise words match name, grade and pack only —
      // old SKUs like "HYD4668" would otherwise make "68" match grade 46 as well.
      if (p.sku.toLowerCase().includes(text)) return true;
      const hay = `${p.name} ${p.grade} ${p.packLabel}`.toLowerCase();
      const tokens = hay.split(/[\s()/,·-]+/);
      // Numbers must match a whole token: "68" finds grade 68 and a "68L" pack, never "4668".
      return words.every((w) =>
        /^\d+(\.\d+)?$/.test(w) ? [w, `${w}l`, `${w}kg`, `${w}ml`].some((t) => tokens.includes(t)) : hay.includes(w),
      );
    });
  }, [products, search, category, segment, missingPriceOnly]);

  const pools = useMemo(() => new Set(filtered.map((p) => p.productKey)).size, [filtered]);
  const missingCount = useMemo(() => products.filter((p) => p.dealerPricePaise === null).length, [products]);
  const selected = filtered.find((p) => p.sku === selectedSku) ?? null;

  // "/" or ⌘/Ctrl+F jumps to search, like other desktop apps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest("input, textarea");
      if ((e.key === "/" && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f")) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-full">
      <section className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-5 py-2.5">
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setSearch("")}
            placeholder="Search name, grade, pack or SKU"
            leading={<Search className="size-3.5" />}
            className="w-[300px]"
            aria-label="Search products"
          />
          <Segmented
            value={category}
            onChange={setCategory}
            options={[
              ["all", "All"],
              ["bulk_oil", "Bulk oil"],
              ["grease", "Grease"],
              ["retail", "Retail"],
            ]}
          />
          <Segmented
            value={segment}
            onChange={setSegment}
            options={[
              ["all", "All buyers"],
              ["Automotive", "Automotive"],
              ["Industrial", "Industrial"],
            ]}
          />
          {showPrices ? (
            <Button
              size="sm"
              variant={missingPriceOnly ? "primary" : "secondary"}
              onClick={() => setMissingPriceOnly((v) => !v)}
              icon={<AlertTriangle className="size-3.5" />}
            >
              No price ({missingCount})
            </Button>
          ) : null}
          <div className="flex-1" />
          <span className="num text-[12px] text-ink-muted">
            {filtered.length.toLocaleString("en-IN")} {filtered.length === 1 ? "item" : "items"} · {pools}{" "}
            {pools === 1 ? "stock pool" : "stock pools"}
          </span>
        </div>

        {/* List */}
        {state.status === "loading" ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : state.status === "error" ? (
          <EmptyState icon={<AlertTriangle className="size-6" />} title="Products could not be loaded">
            {state.message}
          </EmptyState>
        ) : products.length === 0 ? (
          <EmptyState icon={<Package className="size-6" />} title="No products yet">
            Products are imported from the product master.
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Search className="size-6" />} title="Nothing matches">
            Try fewer words, or clear the filters.
          </EmptyState>
        ) : (
          <ProductTable
            rows={filtered}
            showPrices={showPrices}
            selectedSku={selectedSku}
            onSelect={setSelectedSku}
          />
        )}
      </section>

      {selected ? <ProductPanel product={selected} showPrices={showPrices} onClose={() => setSelectedSku(null)} /> : null}
    </div>
  );
}

/* ─── Virtualised table ──────────────────────────────────────────────────────── */

function ProductTable({
  rows,
  showPrices,
  selectedSku,
  onSelect,
}: {
  rows: Product[];
  showPrices: boolean;
  selectedSku: string | null;
  onSelect: (sku: string | null) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  // Narrow (e.g. detail panel open): keep what matters for picking a product, drop the rest.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setCompact((entry?.contentRect.width ?? 1200) < 1000));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cols = compact
    ? showPrices
      ? "grid-cols-[minmax(180px,2fr)_minmax(140px,1.5fr)_76px_104px_104px]"
      : "grid-cols-[minmax(180px,2fr)_minmax(140px,1.5fr)_76px_90px]"
    : showPrices
      ? "grid-cols-[minmax(200px,2.2fr)_minmax(160px,1.6fr)_84px_108px_108px_56px_92px_minmax(140px,1.2fr)]"
      : "grid-cols-[minmax(200px,2.2fr)_minmax(160px,1.6fr)_84px_56px_92px_minmax(140px,1.2fr)]";

  const selectedIndex = rows.findIndex((r) => r.sku === selectedSku);

  const move = (delta: number) => {
    const next = Math.min(Math.max((selectedIndex < 0 ? -1 : selectedIndex) + delta, 0), rows.length - 1);
    const row = rows[next];
    if (!row) return;
    onSelect(row.sku);
    virtualizer.scrollToIndex(next, { align: "auto" });
  };

  return (
    <div
      role="grid"
      aria-rowcount={rows.length}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          move(-1);
        } else if (e.key === "Escape") {
          onSelect(null);
        }
      }}
      className="flex min-h-0 flex-1 flex-col outline-none"
    >
      <div
        role="row"
        className={clsx(
          "grid shrink-0 items-center gap-3 border-b border-line bg-canvas px-5 text-2xs font-medium tracking-wide text-ink-muted uppercase",
          cols,
        )}
        style={{ height: 32 }}
      >
        <span>Product</span>
        <span>Pack</span>
        <span className="text-right">Pack size</span>
        {showPrices ? (
          <>
            <span className="text-right">Dealer</span>
            <span className="text-right">Distributor</span>
          </>
        ) : null}
        {compact ? null : (
          <>
            <span className="text-right">GST</span>
            <span>Sold to</span>
            <span>SKU</span>
          </>
        )}
        {compact && !showPrices ? <span>Sold to</span> : null}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((item) => {
            const p = rows[item.index]!;
            const isSelected = p.sku === selectedSku;
            return (
              <div
                key={p.sku}
                role="row"
                aria-selected={isSelected}
                onClick={() => onSelect(isSelected ? null : p.sku)}
                className={clsx(
                  "absolute inset-x-0 grid cursor-default items-center gap-3 border-b border-line/70 px-5 text-[13px]",
                  cols,
                  isSelected ? "bg-brand-orange/[0.08]" : "bg-surface hover:bg-hover",
                )}
                style={{ height: ROW_HEIGHT, transform: `translateY(${item.start}px)` }}
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium text-ink">{p.name}</span>
                  {p.grade ? <span className="text-ink-muted"> · {p.grade}</span> : null}
                </span>
                <span className="truncate text-ink-muted">{p.packLabel}</span>
                <span className="num text-right text-ink-muted">{formatQuantity(toMilli(p.packQty), p.baseUnit)}</span>
                {showPrices ? (
                  <>
                    <PriceCell paise={p.dealerPricePaise} per={p.pricePer} />
                    <PriceCell paise={p.distributorPricePaise} per={p.pricePer} />
                  </>
                ) : null}
                {compact ? null : <span className="num text-right text-ink-muted">{p.gstPct}%</span>}
                <span className={compact && showPrices ? "hidden" : undefined}>
                  {p.segment ? (
                    <Badge tone={p.segment === "Automotive" ? "info" : p.segment === "Industrial" ? "neutral" : "brand"}>
                      {p.segment === "Both" ? "All buyers" : p.segment}
                    </Badge>
                  ) : (
                    <Badge tone="warning">Not set</Badge>
                  )}
                </span>
                {compact ? null : <span className="selectable truncate font-mono text-[12px] text-ink-faint">{p.sku}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PriceCell({ paise, per }: { paise: number | null; per: string | null }) {
  if (paise === null) return <span className="text-right text-[12px] text-warning">No price</span>;
  return (
    <span className="num text-right text-ink" title={per ?? undefined}>
      {formatINR(paise)}
      {per === "per litre" || per === "per kg" ? <span className="text-2xs text-ink-faint">/{per.slice(4)}</span> : null}
    </span>
  );
}

/* ─── Detail panel ───────────────────────────────────────────────────────────── */

function ProductPanel({ product: p, showPrices, onClose }: { product: Product; showPrices: boolean; onClose: () => void }) {
  const packPrice = useMemo(() => {
    if (!showPrices || p.dealerPricePaise === null || p.distributorPricePaise === null || !p.pricePer) return null;
    try {
      const basis = priceBasisFromLabel(p.pricePer);
      const piecesPerPack = piecesPerPackFromLabel(p.packLabel) ?? undefined;
      const packQtyMilli = toMilli(p.packQty);
      return {
        dealer: packPricePaise({ basis, pricePaise: p.dealerPricePaise, packQtyMilli, piecesPerPack }),
        distributor: packPricePaise({ basis, pricePaise: p.distributorPricePaise, packQtyMilli, piecesPerPack }),
      };
    } catch {
      return "unknown" as const;
    }
  }, [p, showPrices]);

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-line bg-surface">
      <div className="flex items-start gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug font-semibold">{p.name}</p>
          <p className="text-[12px] text-ink-muted">
            {p.grade || "Single grade"} · {p.packLabel}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close details" className="px-1.5">
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[12px]">
          <Detail label="SKU" value={<span className="selectable font-mono">{p.sku}</span>} />
          <Detail label="Category" value={CATEGORY_LABEL[p.category] ?? p.category} />
          <Detail label="Pack size" value={formatQuantity(toMilli(p.packQty), p.baseUnit)} />
          <Detail label="Density" value={p.densityKgPerL ? `${p.densityKgPerL} kg/L` : "—"} />
          <Detail label="GST" value={`${p.gstPct}%`} />
          <Detail label="Sold to" value={p.segment ?? "Not set"} />
        </dl>

        {showPrices ? (
          <section>
            <h3 className="mb-2 text-2xs font-medium tracking-wide text-ink-muted uppercase">Price of one pack (before GST)</h3>
            {packPrice === null ? (
              <p className="rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning">
                No price yet — it can be entered here once price editing is added.
              </p>
            ) : packPrice === "unknown" ? (
              <p className="rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning">
                Can't work out the pack price from "{p.pricePer}".
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <PriceBox label="Dealer" paise={packPrice.dealer} />
                <PriceBox label="Distributor" paise={packPrice.distributor} />
              </div>
            )}
          </section>
        ) : null}

        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-2xs font-medium tracking-wide text-ink-muted uppercase">
            <FlaskConical className="size-3.5" /> Recipe
          </h3>
          {p.recipe.length === 0 ? (
            <p className="text-[12px] text-ink-muted">No recipe recorded.</p>
          ) : (
            <ul className="space-y-1">
              {p.recipe.map((item, i) => {
                const [name, pct] = item.split("/");
                return (
                  <li key={i} className="flex items-center justify-between rounded bg-canvas px-2.5 py-1.5 text-[12px]">
                    <span className="font-mono">{name?.trim()}</span>
                    <span className="num text-ink-muted">{pct?.trim() ? `${pct.trim()}%` : "alternative"}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="flex items-center gap-1.5 border-t border-line px-4 py-2 text-2xs text-ink-faint">
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd> to move · <Kbd>Esc</Kbd> to close
      </div>
    </aside>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-ink-faint">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{value}</dd>
    </div>
  );
}

function PriceBox({ label, paise }: { label: string; paise: number }) {
  return (
    <div className="rounded-md border border-line px-3 py-2">
      <p className="text-2xs text-ink-muted">{label}</p>
      <p className="num text-[15px] font-semibold text-ink">{formatINR(paise)}</p>
    </div>
  );
}

/* ─── Segmented control ──────────────────────────────────────────────────────── */

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<[T, string]>;
}) {
  return (
    <div className="inline-flex h-8 items-center rounded-md border border-line-strong bg-canvas p-0.5" role="radiogroup">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => onChange(key)}
          className={clsx(
            "h-full rounded px-2.5 text-[12px] font-medium transition-colors",
            value === key ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
