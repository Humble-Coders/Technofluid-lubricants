import { useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import { AlertTriangle, Copy, Package, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatINR,
  formatQuantity,
  packPricePaise,
  piecesPerPackFromLabel,
  priceBasisFromLabel,
  toMilli,
} from "@technofluid/core";
import {
  Badge,
  Banner,
  Button,
  Detail,
  Details,
  Dialog,
  EmptyState,
  ErrorState,
  FilterPill,
  FilterSelect,
  IconButton,
  LoadingState,
  Menu,
  Page,
  PageHeader,
  SearchInput,
  SidePanel,
  TableFooter,
  tableClass,
} from "@/components/ui";
import { canEditProducts, canSeePrices } from "@/lib/access";
import { useStaff } from "@/features/auth/session";
import { useProducts } from "@/hooks/useProducts";
import type { Product } from "@/services/productService";
import { setProductDeleted } from "@/services/productEditService";
import { BulkTaxDialog } from "./BulkTaxDialog";
import { ProductEditor } from "./ProductEditor";
import { RecipeSection } from "./RecipeSection";
import { ProductHistory } from "./ProductHistory";

type CategoryFilter = "all" | "bulk_oil" | "grease" | "retail";
/** Selling = on sale now; Not selling = switched off (not deleted). */
type StatusFilter = "selling" | "off" | "all";
type SegmentFilter = "all" | "Automotive" | "Industrial";

const CATEGORY_LABEL: Record<string, string> = { bulk_oil: "Bulk oil", grease: "Grease", retail: "Retail pack" };
const ROW_HEIGHT = 44;

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
  const [bulkTax, setBulkTax] = useState(false);
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

  const panel = adding ? (
    <SidePanel label={adding.from ? `Copy of ${adding.from.name}` : "New product"} onClose={() => select(null)}>
      <div className="flex shrink-0 items-start gap-2 px-6 pt-6 pb-4">
        <h2 className="min-w-0 flex-1 truncate text-title font-semibold text-ink">
          {adding.from ? `Copy of ${adding.from.name}` : "New product"}
        </h2>
        <IconButton label="Close" size="sm" onClick={() => select(null)}>
          <X />
        </IconButton>
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
    </SidePanel>
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
  ) : null;

  return (
    <>
      <Page fill>
        <PageHeader
          title="Products"
          actions={
            <>
              {canEdit && filtered.length > 0 ? (
                <Button onClick={() => setBulkTax(true)} title="Set the GST % or HSN code on every product shown">
                  Change GST / HSN
                </Button>
              ) : null}
              {canEdit ? (
                <Button variant={adding ? "secondary" : "primary"} onClick={() => startAdding()} icon={<Plus />}>
                  Add product
                </Button>
              ) : null}
            </>
          }
          toolbar={
            <>
              <SearchInput
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setSearch("")}
                onClear={() => setSearch("")}
                placeholder="Search name, grade, pack or SKU"
                aria-label="Search products"
              />
              <FilterSelect
                label="Category"
                value={category}
                onChange={(v) => setCategory(v as CategoryFilter)}
                options={[
                  ["all", "All"],
                  ["bulk_oil", "Bulk oil"],
                  ["grease", "Grease"],
                  ["retail", "Retail"],
                ]}
              />
              <FilterSelect
                label="Sold to"
                value={segment}
                onChange={(v) => setSegment(v as SegmentFilter)}
                options={[
                  ["all", "All buyers"],
                  ["Automotive", "Automotive"],
                  ["Industrial", "Industrial"],
                ]}
              />
              <FilterSelect
                label="Status"
                value={status}
                onChange={(v) => setStatus(v as StatusFilter)}
                options={[
                  ["selling", "Selling"],
                  ["off", "Not selling"],
                  ["all", "All"],
                ]}
              />
              {showPrices ? (
                <FilterPill active={missingPriceOnly} onClick={() => setMissingPriceOnly((v) => !v)} icon={<AlertTriangle />}>
                  No price ({missingCount})
                </FilterPill>
              ) : null}
            </>
          }
        />

        {deletedNote ? (
          <Banner
            tone={deletedNote.restored ? "success" : "info"}
            className="mb-3 shrink-0 items-center!"
            action={
              <div className="flex items-center gap-1">
                {deletedNote.restored ? null : (
                  <Button size="sm" onClick={() => void undoDelete()} loading={undoing}>
                    Undo
                  </Button>
                )}
                <IconButton label="Dismiss" size="sm" onClick={() => setDeletedNote(null)}>
                  <X />
                </IconButton>
              </div>
            }
          >
            {deletedNote.restored
              ? `Restored ${deletedNote.label}. It's switched off, so turn Selling on when it's ready.`
              : `Deleted ${deletedNote.label}.`}
          </Banner>
        ) : null}

        {/* List */}
        {state.status === "loading" ? (
          <LoadingState className="flex-1" />
        ) : state.status === "error" ? (
          <div className="min-h-0 flex-1">
            <ErrorState title="Products could not be loaded">{state.message}</ErrorState>
          </div>
        ) : products.length === 0 ? (
          <div className="min-h-0 flex-1">
            <EmptyState icon={<Package />} title="No products yet">
              Products are imported from the product master.
            </EmptyState>
          </div>
        ) : filtered.length === 0 ? (
          <div className="min-h-0 flex-1">
            <EmptyState icon={<Search />} title="Nothing matches">
              Try fewer words, or clear the filters.
            </EmptyState>
          </div>
        ) : (
          <>
            <ProductTable rows={filtered} showPrices={showPrices} selectedSku={selectedSku} onSelect={select} />
            <TableFooter shown={filtered.length} total={products.length} noun={products.length === 1 ? "item" : "items"}>
              <span className="num">
                · {pools.toLocaleString("en-IN")} {pools === 1 ? "stock pool" : "stock pools"}
              </span>
            </TableFooter>
          </>
        )}
      </Page>
      {panel}
      {bulkTax ? <BulkTaxDialog products={filtered} onClose={() => setBulkTax(false)} /> : null}
    </>
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

  // Narrow window (sheet about 850px wide with the sidebar open): with prices, the full set of
  // columns needs ~875px, so keep what matters for picking a product and drop the rest (the
  // detail panel shows it). The flexible columns may shrink to nothing, so the list never scrolls
  // sideways. Without prices the full columns need ~635px and always fit.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const minFull = showPrices ? 880 : 640;
    const observer = new ResizeObserver(([entry]) => setCompact((entry?.contentRect.width ?? 1200) < minFull));
    observer.observe(el);
    return () => observer.disconnect();
  }, [showPrices]);

  const cols = compact
    ? showPrices
      ? "grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_96px_96px]"
      : "grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_76px_90px]"
    : showPrices
      ? "grid-cols-[minmax(180px,2.2fr)_minmax(140px,1.6fr)_84px_108px_108px_56px_100px_minmax(0,1.2fr)]"
      : "grid-cols-[minmax(180px,2.2fr)_minmax(140px,1.6fr)_84px_56px_100px_minmax(0,1.2fr)]";

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
      className="-mx-3 flex min-h-0 flex-1 flex-col outline-none"
    >
      <div
        role="row"
        className={clsx("grid h-10 shrink-0 items-center gap-3 border-b border-line px-3 text-label font-medium whitespace-nowrap text-ink-muted", cols)}
      >
        <span>Product</span>
        <span>Pack</span>
        {compact && showPrices ? null : <span className="text-right">Pack size</span>}
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

      {/* The scrollbar sits in the 12px the rows bleed past the page edge, so the columns stay under their headings. */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
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
                  "absolute inset-x-0 grid cursor-pointer items-center gap-3 border-b border-line-row pr-0.5 pl-3 text-body",
                  cols,
                  isSelected ? tableClass.trSelected : "hover:bg-surface-alt",
                )}
                style={{ height: ROW_HEIGHT, transform: `translateY(${item.start}px)` }}
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium text-ink">{p.name}</span>
                  {p.grade ? <span className="text-ink-muted"> · {p.grade}</span> : null}
                  {p.active ? null : (
                    <Badge tone="neutral" className="ml-1.5">
                      Not selling
                    </Badge>
                  )}
                </span>
                <span className="truncate text-ink-muted">{p.packLabel}</span>
                {compact && showPrices ? null : <span className="num text-right text-ink-muted">{formatQuantity(toMilli(p.packQty), p.baseUnit)}</span>}
                {showPrices ? (
                  <>
                    <PriceCell paise={p.dealerPricePaise} per={p.pricePer} />
                    <PriceCell paise={p.distributorPricePaise} per={p.pricePer} />
                  </>
                ) : null}
                {compact ? null : <span className="num text-right text-ink-muted">{p.gstPct}%</span>}
                <span className={clsx("truncate text-ink-muted", compact && showPrices && "hidden")}>
                  {p.segment ? (p.segment === "Both" ? "All buyers" : p.segment) : <Badge tone="warning">Not set</Badge>}
                </span>
                {compact ? null : <span className="selectable truncate font-mono text-caption text-ink-subtle">{p.sku}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PriceCell({ paise, per }: { paise: number | null; per: string | null }) {
  if (paise === null) return <span className="text-right text-label text-warning">No price</span>;
  return (
    <span className="num truncate text-right text-ink" title={per ?? undefined}>
      {formatINR(paise)}
      {per === "per litre" || per === "per kg" ? <span className="text-caption text-ink-subtle">/{per.slice(4)}</span> : null}
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
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    <SidePanel label={`${p.name} details`} onClose={onClose}>
      <div className="flex shrink-0 items-start gap-2 px-6 pt-6 pb-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-title font-semibold break-words text-ink">{p.name}</h2>
          <p className="mt-0.5 text-label text-ink-muted">
            {p.grade || "Single grade"} · {p.packLabel}
          </p>
          {p.active ? null : (
            <Badge tone="neutral" className="mt-1.5">
              Not selling
            </Badge>
          )}
        </div>
        {canEdit && !editing ? (
          <>
            <Button
              size="sm"
              onClick={() => {
                setSavedCount(null);
                setEditing(true);
              }}
              icon={<Pencil />}
            >
              Edit
            </Button>
            <Menu
              size="sm"
              items={[
                { label: "Copy as a new product", icon: <Copy />, onSelect: onCopy },
                { label: "Delete product", icon: <Trash2 />, danger: true, onSelect: () => setConfirmDelete(true) },
              ]}
            />
          </>
        ) : null}
        <IconButton label="Close details" size="sm" onClick={onClose}>
          <X />
        </IconButton>
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
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pb-6">
          {savedCount !== null ? (
            <Banner tone="success">
              Saved {savedCount} {savedCount === 1 ? "change" : "changes"}.
            </Banner>
          ) : null}
          <Details columns={2}>
            <Detail label="SKU">
              <span className="font-mono text-label">{p.sku}</span>
            </Detail>
            <Detail label="Category">{CATEGORY_LABEL[p.category] ?? p.category}</Detail>
            <Detail label="Pack size">{formatQuantity(toMilli(p.packQty), p.baseUnit)}</Detail>
            <Detail label="Density">{p.densityKgPerL ? `${p.densityKgPerL} kg/L` : "-"}</Detail>
            <Detail label="GST">{p.gstPct}%</Detail>
            <Detail label="HSN code">{p.hsnCode ?? "-"}</Detail>
            <Detail label="Sold to">{p.segment === "Both" ? "All buyers" : (p.segment ?? "Not set")}</Detail>
          </Details>

          {showPrices ? (
            <section>
              <h3 className="mb-2 text-label font-semibold text-ink">Price of one pack (before GST)</h3>
              {packPrice === null ? (
                <Banner tone="warning">{canEdit ? "No price yet. Use Edit to add one." : "No price yet."}</Banner>
              ) : packPrice === "unknown" ? (
                <Banner tone="warning">Can't work out the pack price from "{p.pricePer}".</Banner>
              ) : (
                <Details columns={2}>
                  <PackPrice label="Dealer" paise={packPrice.dealer} />
                  <PackPrice label="Distributor" paise={packPrice.distributor} />
                </Details>
              )}
            </section>
          ) : null}

          <RecipeSection product={p} />

          {canEdit ? <ProductHistory sku={p.sku} /> : null}
        </div>
      )}
      {confirmDelete ? <DeleteProduct product={p} onDeleted={onDeleted} onClose={() => setConfirmDelete(false)} /> : null}
    </SidePanel>
  );
}

function PackPrice({ label, paise }: { label: string; paise: number | null }) {
  return (
    <Detail label={label}>
      {paise === null ? <span className="text-warning">No price</span> : <span className="num text-title font-semibold">{formatINR(paise)}</span>}
    </Detail>
  );
}

/* ─── Delete (soft) ──────────────────────────────────────────────────────────── */

function DeleteProduct({ product: p, onDeleted, onClose }: { product: Product; onDeleted: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = `${p.name}${p.grade ? ` ${p.grade}` : ""} (${p.packLabel})`;

  const remove = async () => {
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
    <Dialog
      danger
      title="Delete this product?"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy} autoFocus>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void remove()} loading={busy}>
            {busy ? "Deleting…" : "Delete product"}
          </Button>
        </>
      }
    >
      <p className="text-body text-ink">
        <span className="font-semibold">{label}</span> disappears from Technofluid Office and from the pack sizes on the website. Nothing is
        erased: you can undo it straight after, and it stays in the records.
      </p>
      {error ? <Banner tone="danger">{error}</Banner> : null}
    </Dialog>
  );
}
