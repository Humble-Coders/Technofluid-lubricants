import { useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Copy, FlaskConical, Package, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatINR,
  formatQuantity,
  packPricePaise,
  piecesPerPackFromLabel,
  priceBasisFromLabel,
  toMilli,
} from "@technofluid/core";
import { Badge, Button, EmptyState, Input, Kbd, Segmented, Spinner } from "@/components/ui";
import { canEditProducts, canSeePrices } from "@/lib/access";
import { useStaff } from "@/features/auth/session";
import { useProducts } from "@/hooks/useProducts";
import type { Product } from "@/services/productService";
import { setProductDeleted } from "@/services/productEditService";
import { ProductEditor } from "./ProductEditor";
import { ProductHistory } from "./ProductHistory";

type CategoryFilter = "all" | "bulk_oil" | "grease" | "retail";
/** Selling = on sale now; Not selling = switched off (not deleted). */
type StatusFilter = "selling" | "off" | "all";
type SegmentFilter = "all" | "Automotive" | "Industrial";

const CATEGORY_LABEL: Record<string, string> = { bulk_oil: "Bulk oil", grease: "Grease", retail: "Retail pack" };
const ROW_HEIGHT = 40;

export function ProductsScreen() {
  const { role } = useStaff();
  const showPrices = canSeePrices(role);
  const state = useProducts({ withPrices: showPrices });
  const canEdit = canEditProducts(role);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [segment, setSegment] = useState<SegmentFilter>("all");
  const [missingPriceOnly, setMissingPriceOnly] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("selling");
  // Just-deleted product, for the "Undo" banner.
  const [deletedNote, setDeletedNote] = useState<{ sku: string; label: string; restored?: boolean } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  // Adding a product (from scratch, or as a copy of `from`) replaces the detail panel.
  const [adding, setAdding] = useState<{ from?: Product } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // True while the side panel has unsaved edits — switching product asks first.
  const editDirtyRef = useRef(false);
  const onDirtyChange = useCallback((dirty: boolean) => {
    editDirtyRef.current = dirty;
  }, []);
  const leaveForm = () => {
    if (editDirtyRef.current && !window.confirm("Discard your unsaved changes?")) return false;
    editDirtyRef.current = false;
    return true;
  };
  const select = (sku: string | null) => {
    if (sku === selectedSku && !adding) return;
    if (!leaveForm()) return;
    setAdding(null);
    setSelectedSku(sku);
  };
  const startAdding = (from?: Product) => {
    if (!leaveForm()) return;
    setAdding(from ? { from } : {});
  };

  const products = state.status === "ready" ? state.data : [];

  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase();
    const words = text.split(/\s+/).filter(Boolean);
    return products.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      // "Both" products are visible to every segment.
      if (segment !== "all" && p.segment !== segment && p.segment !== "Both") return false;
      if (status === "selling" && !p.active) return false;
      if (status === "off" && p.active) return false;
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
  }, [products, search, category, segment, missingPriceOnly, status]);

  const pools = useMemo(() => new Set(filtered.map((p) => p.productKey)).size, [filtered]);
  const missingCount = useMemo(
    () =>
      products.filter(
        (p) => p.dealerPricePaise === null && (status === "all" || (status === "selling") === p.active),
      ).length,
    [products, status],
  );

  // The "Deleted … Undo" note fades after a while.
  useEffect(() => {
    if (!deletedNote) return;
    const timer = window.setTimeout(() => setDeletedNote(null), deletedNote.restored ? 5000 : 12000);
    return () => window.clearTimeout(timer);
  }, [deletedNote]);

  const undoDelete = async () => {
    if (!deletedNote) return;
    setUndoing(true);
    try {
      await setProductDeleted(deletedNote.sku, false, "Undo");
      setDeletedNote({ ...deletedNote, restored: true });
      setStatus("all");
      setSelectedSku(deletedNote.sku);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setUndoing(false);
    }
  };
  // From the full list, not the filtered one: giving a "No price" product a price must not close its panel.
  const selected = products.find((p) => p.sku === selectedSku) ?? null;

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
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              ["selling", "Selling"],
              ["off", "Not selling"],
              ["all", "All"],
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
          {canEdit ? (
            <Button size="sm" variant="primary" onClick={() => startAdding()} icon={<Plus className="size-3.5" />}>
              Add product
            </Button>
          ) : null}
        </div>

        {deletedNote ? (
          <div
            role="status"
            className="flex shrink-0 items-center gap-2 border-b border-line bg-canvas px-5 py-2 text-[12px] text-ink"
          >
            {deletedNote.restored ? (
              <>
                <CheckCircle2 className="size-3.5 text-success" />
                Restored {deletedNote.label}. It's switched off — turn Selling on when it's ready.
              </>
            ) : (
              <>
                <Trash2 className="size-3.5 text-ink-muted" />
                Deleted {deletedNote.label}.
                <Button size="sm" variant="secondary" onClick={() => void undoDelete()} loading={undoing}>
                  Undo
                </Button>
              </>
            )}
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => setDeletedNote(null)} aria-label="Dismiss" className="px-1.5">
              <X className="size-3.5" />
            </Button>
          </div>
        ) : null}

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
            onSelect={select}
          />
        )}
      </section>

      {adding ? (
        <aside className="flex w-[360px] shrink-0 flex-col border-l border-line bg-surface">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <p className="min-w-0 flex-1 truncate text-[14px] font-semibold">
              {adding.from ? `Copy of ${adding.from.name}` : "New product"}
            </p>
            <Button variant="ghost" size="sm" onClick={() => select(null)} aria-label="Close" className="px-1.5">
              <X className="size-4" />
            </Button>
          </div>
          <ProductEditor
            key={adding.from?.sku ?? "new"}
            mode={{ kind: "new", from: adding.from }}
            onDirtyChange={onDirtyChange}
            onDone={({ newSku }) => {
              setAdding(null);
              if (newSku) setSelectedSku(newSku);
            }}
          />
        </aside>
      ) : selected ? (
        <ProductPanel
          key={selected.sku}
          product={selected}
          showPrices={showPrices}
          canEdit={canEdit}
          onDirtyChange={onDirtyChange}
          onCopy={() => startAdding(selected)}
          onDeleted={() => {
            setDeletedNote({ sku: selected.sku, label: `${selected.name}${selected.grade ? ` ${selected.grade}` : ""} · ${selected.packLabel}` });
            setSelectedSku(null);
          }}
          onClose={() => select(null)}
        />
      ) : null}
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
          "grid shrink-0 items-center gap-3 border-b border-line bg-canvas px-5 text-center text-2xs font-medium tracking-wide text-ink-muted uppercase",
          cols,
        )}
        style={{ height: 32 }}
      >
        <span className="text-left">Product</span>
        <span>Pack</span>
        <span>Pack size</span>
        {showPrices ? (
          <>
            <span>Dealer</span>
            <span>Distributor</span>
          </>
        ) : null}
        {compact ? null : (
          <>
            <span>GST</span>
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
                  "absolute inset-x-0 grid cursor-default items-center gap-3 border-b border-line/70 px-5 text-center text-[13px]",
                  cols,
                  isSelected ? "bg-brand-orange/[0.08]" : "bg-surface hover:bg-hover",
                )}
                style={{ height: ROW_HEIGHT, transform: `translateY(${item.start}px)` }}
              >
                <span className="min-w-0 truncate text-left">
                  <span className="font-medium text-ink">{p.name}</span>
                  {p.grade ? <span className="text-ink-muted"> · {p.grade}</span> : null}
                  {p.active ? null : (
                    <Badge tone="neutral" className="ml-1.5">
                      Not selling
                    </Badge>
                  )}
                </span>
                <span className="truncate text-ink-muted">{p.packLabel}</span>
                <span className="num text-ink-muted">{formatQuantity(toMilli(p.packQty), p.baseUnit)}</span>
                {showPrices ? (
                  <>
                    <PriceCell paise={p.dealerPricePaise} per={p.pricePer} />
                    <PriceCell paise={p.distributorPricePaise} per={p.pricePer} />
                  </>
                ) : null}
                {compact ? null : <span className="num text-ink-muted">{p.gstPct}%</span>}
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
  if (paise === null) return <span className="text-[12px] text-warning">No price</span>;
  return (
    <span className="num text-ink" title={per ?? undefined}>
      {formatINR(paise)}
      {per === "per litre" || per === "per kg" ? <span className="text-2xs text-ink-faint">/{per.slice(4)}</span> : null}
    </span>
  );
}

/* ─── Detail panel ───────────────────────────────────────────────────────────── */

function ProductPanel({
  product: p,
  showPrices,
  canEdit,
  onDirtyChange,
  onCopy,
  onDeleted,
  onClose,
}: {
  product: Product;
  showPrices: boolean;
  canEdit: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onCopy: () => void;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  // The "Saved" note fades after a few seconds.
  useEffect(() => {
    if (savedCount === null) return;
    const timer = window.setTimeout(() => setSavedCount(null), 4000);
    return () => window.clearTimeout(timer);
  }, [savedCount]);

  const packPrice = useMemo(() => {
    // Each price is shown on its own — one may be set before the other.
    if (!showPrices || (p.dealerPricePaise === null && p.distributorPricePaise === null) || !p.pricePer) return null;
    try {
      const basis = priceBasisFromLabel(p.pricePer);
      const piecesPerPack = piecesPerPackFromLabel(p.packLabel) ?? undefined;
      const packQtyMilli = toMilli(p.packQty);
      return {
        dealer:
          p.dealerPricePaise === null
            ? null
            : packPricePaise({ basis, pricePaise: p.dealerPricePaise, packQtyMilli, piecesPerPack }),
        distributor:
          p.distributorPricePaise === null
            ? null
            : packPricePaise({ basis, pricePaise: p.distributorPricePaise, packQtyMilli, piecesPerPack }),
      };
    } catch {
      return "unknown" as const;
    }
  }, [p, showPrices]);

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-line bg-surface">
      <div className="flex items-start gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug font-semibold">{p.name}</p>
          <p className="text-[12px] text-ink-muted">
            {p.grade || "Single grade"} · {p.packLabel}
          </p>
          {p.active ? null : (
            <Badge tone="neutral" className="mt-1">
              Not selling
            </Badge>
          )}
        </div>
        {canEdit && !editing ? (
          <>
            <Button size="sm" onClick={onCopy} icon={<Copy className="size-3.5" />} title="Copy as a new product">
              Copy
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setSavedCount(null);
                setEditing(true);
              }}
              icon={<Pencil className="size-3.5" />}
            >
              Edit
            </Button>
          </>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close details" className="px-1.5">
          <X className="size-4" />
        </Button>
      </div>

      {editing ? (
        <ProductEditor
          mode={{ kind: "edit", product: p }}
          onDirtyChange={onDirtyChange}
          onDone={({ saved }) => {
            setEditing(false);
            if (saved > 0) setSavedCount(saved);
          }}
        />
      ) : (
        <>
          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
            {savedCount !== null ? (
              <p role="status" className="flex items-center gap-1.5 rounded-md bg-success-soft px-3 py-2 text-[12px] text-success">
                <CheckCircle2 className="size-3.5" />
                Saved {savedCount} {savedCount === 1 ? "change" : "changes"}.
              </p>
            ) : null}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[12px]">
              <Detail label="SKU" value={<span className="selectable font-mono">{p.sku}</span>} />
              <Detail label="Category" value={CATEGORY_LABEL[p.category] ?? p.category} />
              <Detail label="Pack size" value={formatQuantity(toMilli(p.packQty), p.baseUnit)} />
              <Detail label="Density" value={p.densityKgPerL ? `${p.densityKgPerL} kg/L` : "—"} />
              <Detail label="GST" value={`${p.gstPct}%`} />
              <Detail label="HSN code" value={p.hsnCode ?? "—"} />
              <Detail label="Sold to" value={p.segment === "Both" ? "All buyers" : (p.segment ?? "Not set")} />
            </dl>

            {showPrices ? (
              <section>
                <h3 className="mb-2 text-2xs font-medium tracking-wide text-ink-muted uppercase">Price of one pack (before GST)</h3>
                {packPrice === null ? (
                  <p className="rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning">
                    {canEdit ? "No price yet — use Edit to add one." : "No price yet."}
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

            {canEdit ? <ProductHistory sku={p.sku} /> : null}

            {canEdit ? <DeleteProduct product={p} onDeleted={onDeleted} /> : null}
          </div>

          <div className="flex items-center gap-1.5 border-t border-line px-4 py-2 text-2xs text-ink-faint">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> to move · <Kbd>Esc</Kbd> to close
          </div>
        </>
      )}
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

function PriceBox({ label, paise }: { label: string; paise: number | null }) {
  return (
    <div className="rounded-md border border-line px-3 py-2">
      <p className="text-2xs text-ink-muted">{label}</p>
      {paise === null ? (
        <p className="text-[13px] text-warning">No price</p>
      ) : (
        <p className="num text-[15px] font-semibold text-ink">{formatINR(paise)}</p>
      )}
    </div>
  );
}

/* ─── Delete (soft) ──────────────────────────────────────────────────────────── */

function DeleteProduct({ product: p, onDeleted }: { product: Product; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    const label = `${p.name}${p.grade ? ` ${p.grade}` : ""} (${p.packLabel})`;
    const ok = window.confirm(
      `Delete ${label}?\n\nIt disappears from Technofluid Office and from the pack sizes on the website. ` +
        "Nothing is erased — you can undo it straight after, and it stays in the records.",
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await setProductDeleted(p.sku, true);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <section className="border-t border-line pt-4">
      <Button variant="ghost" size="sm" onClick={() => void remove()} loading={busy} icon={<Trash2 className="size-3.5" />} className="text-danger hover:text-danger">
        Delete product
      </Button>
      {error ? (
        <p role="alert" className="mt-2 rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
