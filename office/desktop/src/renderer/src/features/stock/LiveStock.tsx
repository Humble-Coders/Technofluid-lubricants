import { useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import { AlertTriangle, Boxes, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatQuantity, indiaDate, parseQuantityToMilli } from "@technofluid/core";
import { Badge, Button, EmptyState, Input, Segmented, Spinner } from "@/components/ui";
import { useMovements } from "@/hooks/useStock";
import type { LoadState } from "@/hooks/useProducts";
import type { Product } from "@/services/productService";
import {
  deleteStockItem,
  newRequestId,
  recordStockMovements,
  type ItemKind,
  type StockItem,
} from "@/services/stockService";
import { JournalReview } from "./JournalReview";
import { MovementList } from "./MovementList";
import { buildReview, readReview, type ReviewGroup, type ReviewProblem } from "./reviewModel";
import { StockItemForm } from "./StockItemForm";
import { KIND_LABEL, packsSummary, searchText, unitWord } from "./stockFormat";

type KindFilter = "all" | ItemKind;
const ROW_HEIGHT = 44;

/** Everything we count, how much is on hand now, and packs that could be filled. */
export function LiveStock({
  items,
  products,
  canEdit,
}: {
  items: LoadState<StockItem[]>;
  products: Product[];
  canEdit: boolean;
}) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [belowZeroOnly, setBelowZeroOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const list = items.status === "ready" ? items.data : [];
  const filtered = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return list.filter(
      (i) =>
        (kind === "all" || i.kind === kind) &&
        (!belowZeroOnly || i.onHandMilli < 0) &&
        words.every((w) => searchText(i).includes(w)),
    );
  }, [list, search, kind, belowZeroOnly]);
  const belowZeroCount = useMemo(() => list.filter((i) => i.onHandMilli < 0).length, [list]);
  const selected = list.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-5 py-2.5">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setSearch("")}
            placeholder="Search item, code or other name"
            leading={<Search className="size-3.5" />}
            className="w-[260px]"
            aria-label="Search stock"
          />
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              ["all", "All"],
              ["product_pool", "Products"],
              ["raw_material", "Raw materials"],
              ["consumable", "Consumables"],
            ]}
          />
          <Button
            size="sm"
            variant={belowZeroOnly ? "primary" : "secondary"}
            onClick={() => setBelowZeroOnly((v) => !v)}
            icon={<AlertTriangle className="size-3.5" />}
          >
            Below zero ({belowZeroCount})
          </Button>
          <div className="flex-1" />
          <span className="num text-[12px] text-ink-muted">{filtered.length.toLocaleString("en-IN")} items</span>
          {canEdit ? (
            <Button
              size="sm"
              variant="primary"
              icon={<Plus className="size-3.5" />}
              onClick={() => {
                setSelectedId(null);
                setAdding(true);
              }}
            >
              Add raw material / consumable
            </Button>
          ) : null}
        </div>

        {items.status === "loading" ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : items.status === "error" ? (
          <EmptyState icon={<AlertTriangle className="size-6" />} title="Stock could not be loaded">
            {items.message}
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Boxes className="size-6" />} title={list.length === 0 ? "No stock items yet" : "Nothing matches"}>
            {list.length === 0 ? "Product stock pools are created from the products automatically." : "Try fewer words, or clear the filters."}
          </EmptyState>
        ) : (
          <StockTable
            rows={filtered}
            products={products}
            selectedId={selectedId}
            onSelect={(id) => {
              setAdding(false);
              setSelectedId(id);
            }}
          />
        )}
      </section>

      {adding ? (
        <Panel title="New raw material or consumable" onClose={() => setAdding(false)}>
          <StockItemForm
            item={null}
            onDone={(id) => {
              setAdding(false);
              if (id) setSelectedId(id);
            }}
          />
        </Panel>
      ) : selected ? (
        <ItemPanel
          key={selected.id}
          item={selected}
          items={list}
          products={products}
          canEdit={canEdit}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}

function StockTable({
  rows,
  products,
  selectedId,
  onSelect,
}: {
  rows: StockItem[];
  products: Product[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  // Narrow (side panel open): keep item and on-hand, drop kind and packs.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setCompact((entry?.contentRect.width ?? 1200) < 760));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const cols = compact
    ? "grid-cols-[minmax(160px,1fr)_120px]"
    : "grid-cols-[minmax(200px,2fr)_110px_120px_minmax(180px,2fr)]";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={clsx(
          "grid shrink-0 items-center gap-3 border-b border-line bg-canvas px-5 text-center text-2xs font-medium tracking-wide text-ink-muted uppercase",
          cols,
        )}
        style={{ height: 32 }}
      >
        <span className="text-left">Item</span>
        {compact ? null : <span>Kind</span>}
        <span>On hand</span>
        {compact ? null : <span>Packs that could be filled</span>}
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((v) => {
            const item = rows[v.index]!;
            const isSelected = item.id === selectedId;
            return (
              <div
                key={item.id}
                role="row"
                aria-selected={isSelected}
                onClick={() => onSelect(isSelected ? null : item.id)}
                className={clsx(
                  "absolute inset-x-0 grid cursor-default items-center gap-3 border-b border-line/70 px-5 text-center text-[13px]",
                  cols,
                  isSelected ? "bg-brand-orange/[0.08]" : "bg-surface hover:bg-hover",
                )}
                style={{ height: ROW_HEIGHT, transform: `translateY(${v.start}px)` }}
              >
                <span className="min-w-0 truncate text-left">
                  <span className="font-medium text-ink">{item.name}</span>
                  {item.code ? <span className="ml-1.5 font-mono text-[11px] text-ink-faint">{item.code}</span> : null}
                </span>
                {compact ? null : (
                  <span>
                    <Badge tone={item.kind === "product_pool" ? "brand" : item.kind === "raw_material" ? "info" : "neutral"}>
                      {KIND_LABEL[item.kind]}
                    </Badge>
                  </span>
                )}
                <span className={clsx("num font-medium", item.onHandMilli < 0 ? "text-danger" : "text-ink")}>
                  {item.onHandMilli < 0 ? <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" /> : null}
                  {formatQuantity(item.onHandMilli, item.baseUnit)}
                </span>
                {compact ? null : (
                  <span className="truncate text-[12px] text-ink-muted">{packsSummary(item, products) || "—"}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, onClose, actions, children }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-line bg-surface">
      <div className="flex items-start gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug font-semibold">{title}</p>
          {subtitle ? <p className="text-[12px] text-ink-muted">{subtitle}</p> : null}
        </div>
        {actions}
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" className="px-1.5">
          <X className="size-4" />
        </Button>
      </div>
      {children}
    </aside>
  );
}

function ItemPanel({ item, items, products, canEdit, onClose }: {
  item: StockItem;
  items: StockItem[];
  products: Product[];
  canEdit: boolean;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const history = useMovements({ itemId: item.id });
  const packs = packsSummary(item, products);
  const isPool = item.kind === "product_pool";

  if (editing) {
    return (
      <Panel title={`Edit ${item.name}`} onClose={() => setEditing(false)}>
        <StockItemForm item={item} onDone={() => setEditing(false)} />
      </Panel>
    );
  }

  return (
    <Panel
      title={item.name}
      subtitle={`${KIND_LABEL[item.kind]}${item.code ? ` · ${item.code}` : ""}`}
      onClose={onClose}
      actions={
        canEdit && !isPool ? (
          <Button size="sm" onClick={() => setEditing(true)} icon={<Pencil className="size-3.5" />}>
            Edit
          </Button>
        ) : null
      }
    >
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <section>
          <p className="text-2xs font-medium tracking-wide text-ink-muted uppercase">On hand</p>
          <p className={clsx("num text-[22px] font-semibold", item.onHandMilli < 0 ? "text-danger" : "text-ink")}>
            {formatQuantity(item.onHandMilli, item.baseUnit)}
          </p>
          {item.onHandMilli < 0 ? (
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-danger">
              <AlertTriangle className="size-3.5" /> Below zero — more went out than was recorded. Count it and correct.
            </p>
          ) : null}
          {packs ? <p className="mt-1 text-[12px] text-ink-muted">Could fill: {packs}</p> : null}
          <p className="mt-1 text-[12px] text-ink-faint">
            {[item.densityKgPerL ? `${item.densityKgPerL} kg/L` : null, item.aliases.length ? `Also called ${item.aliases.join(", ")}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </section>

        {canEdit ? <StockActions item={item} items={items} products={products} /> : null}

        <section>
          <h3 className="mb-2 text-2xs font-medium tracking-wide text-ink-muted uppercase">History</h3>
          <MovementList state={history} canEdit={canEdit} showItem={false} emptyText="No stock recorded for this item yet." />
        </section>

        {canEdit && !isPool ? <DeleteItem item={item} onDeleted={onClose} /> : null}
      </div>
    </Panel>
  );
}

type Action = "IN" | "OUT" | "COUNT";

const ACTION_TEXT: Record<Action, { label: string; qty: string; why: string; saved: string }> = {
  IN: { label: "How much came in?", qty: "Quantity added", why: "Why? e.g. filled from tank 2", saved: "Stock in saved." },
  OUT: { label: "How much went out?", qty: "Quantity removed", why: "Why? e.g. dispatched, damaged, sample", saved: "Stock out saved." },
  COUNT: { label: "What's really there?", qty: "Quantity actually there", why: "Why? e.g. monthly count", saved: "Count saved." },
};

/**
 * Change one item's stock from its panel: Stock in / Stock out (an amount, with a reason)
 * or Correct count — "feels directly editable" (decision #23): type what's really there
 * and the server records only the difference. With no history yet it's the opening stock.
 * Every save is a new diary line; nothing is overwritten.
 */
function StockActions({ item, items, products }: { item: StockItem; items: StockItem[]; products: Product[] }) {
  const opening = !item.lastMovementAt && item.onHandMilli === 0;
  // A product's "Stock in" is production: it goes through the same recipe review as the
  // Daily journal (Sharnya, 17 Oct 2026) — nothing is saved until confirmed.
  const production = item.kind === "product_pool" && !opening;
  const [review, setReview] = useState<ReviewGroup[] | null>(null);
  const [problems, setProblems] = useState<ReviewProblem[]>([]);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(newRequestId);
  const [action, setAction] = useState<Action>("IN");
  const [qty, setQty] = useState("");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const text = ACTION_TEXT[action];

  const save = async () => {
    setMessage(null);
    let milli: number;
    try {
      milli = parseQuantityToMilli(qty);
    } catch {
      return setMessage({ tone: "error", text: "Enter a quantity like 26 or 17.5." });
    }
    if (!opening && action !== "COUNT" && milli === 0) {
      return setMessage({ tone: "error", text: "Quantity must be above 0." });
    }
    if (production && action === "IN") {
      setProblems([]);
      setReviewError(null);
      setReview(buildReview([{ item, kind: "IN", qtyMilli: milli, note: why.trim() }], items, products));
      return;
    }
    if (!opening && !why.trim()) return setMessage({ tone: "error", text: "Say why." });
    setBusy(true);
    try {
      const note = why.trim();
      const result = await recordStockMovements(newRequestId(), indiaDate(), [
        opening
          ? { itemId: item.id, kind: "OPENING", qtyMilli: milli, ...(note ? { note } : {}) }
          : action === "COUNT"
            ? { itemId: item.id, kind: "COUNT", countedMilli: milli, note }
            : { itemId: item.id, kind: action, qtyMilli: milli, note },
      ]);
      setQty("");
      setWhy("");
      const below = result.belowZero.find((b) => b.itemId === item.id);
      setMessage(
        below
          ? { tone: "warn", text: `Saved — ${item.name} is now below zero. Count it and correct.` }
          : {
              tone: "ok",
              text: result.recorded === 0 ? "Already matches — nothing to change." : opening ? "Opening stock saved." : text.saved,
            },
      );
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const confirmReview = async () => {
    if (!review) return;
    setReviewError(null);
    const { lines, problems: found } = readReview(review);
    setProblems(found);
    if (found.length > 0) return setReviewError("Fix the highlighted lines first.");
    setBusy(true);
    try {
      const result = await recordStockMovements(requestId, indiaDate(), lines);
      setReview(null);
      setRequestId(newRequestId());
      setQty("");
      setWhy("");
      setMessage(
        result.belowZero.length > 0
          ? { tone: "warn", text: `Saved — ${result.belowZero.map((b) => b.name).join(", ")} now below zero.` }
          : { tone: "ok", text: "Production saved — raw materials deducted." },
      );
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {review ? (
        <JournalReview
          groups={review}
          onChange={(groups) => {
            setReview(groups);
            setProblems([]);
          }}
          items={items}
          products={products}
          problems={problems}
          busy={busy}
          error={reviewError}
          onBack={() => setReview(null)}
          onConfirm={() => void confirmReview()}
          backLabel="Cancel"
        />
      ) : null}
      <form
        className="space-y-2 rounded-md border border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {opening ? (
          <p className="text-[12px] font-medium text-ink">Opening stock</p>
        ) : (
          <Segmented
            value={action}
            onChange={(a) => {
              setAction(a);
              setMessage(null);
            }}
            options={[
              ["IN", production ? "Made (recipe)" : "Stock in"],
              ["OUT", "Stock out"],
              ["COUNT", "Correct count"],
            ]}
          />
        )}
        <div className="relative">
          <Input
            aria-label={opening ? "Opening quantity" : text.qty}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
            placeholder={opening ? "How much is there?" : text.label}
            className="num [&_input]:pr-14"
          />
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] text-ink-muted">
            {unitWord(item.baseUnit)}
          </span>
        </div>
        <Input
          aria-label="Reason"
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder={opening || (production && action === "IN") ? "Note (optional)" : text.why}
          maxLength={200}
        />
        <div className="flex items-center gap-2">
          {message ? (
            <p
              className={clsx(
                "flex-1 text-[12px]",
                message.tone === "ok" ? "text-success" : message.tone === "warn" ? "text-warning" : "text-danger",
              )}
            >
              {message.text}
            </p>
          ) : (
            <span className="flex-1" />
          )}
          <Button size="sm" variant="primary" type="submit" loading={busy} disabled={!qty.trim()}>
            {opening ? "Save" : action === "IN" ? (production ? "Review" : "Add stock") : action === "OUT" ? "Remove stock" : "Save count"}
          </Button>
        </div>
      </form>
    </>
  );
}

function DeleteItem({ item, onDeleted }: { item: StockItem; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    if (!window.confirm(`Delete ${item.name}? It must have nothing on hand. Its history is kept.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteStockItem(item.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };
  return (
    <section className="border-t border-line pt-4">
      <Button variant="ghost" size="sm" onClick={() => void remove()} loading={busy} icon={<Trash2 className="size-3.5" />} className="text-danger hover:text-danger">
        Delete item
      </Button>
      {error ? <p className="mt-2 text-[12px] text-danger">{error}</p> : null}
    </section>
  );
}
