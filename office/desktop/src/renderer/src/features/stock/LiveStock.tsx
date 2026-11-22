import { useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import { AlertTriangle, Boxes, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatQuantity, indiaDate, parseQuantityToMilli } from "@technofluid/core";
import {
  Badge,
  Banner,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  FilterPill,
  FilterSelect,
  IconButton,
  Input,
  LoadingState,
  Menu,
  SearchInput,
  Section,
  SidePanel,
} from "@/components/ui";
import { useMovements } from "@/hooks/useStock";
import type { LoadState } from "@/hooks/useProducts";
import type { Product } from "@/services/productService";
import {
  deleteStockItem,
  isMix,
  newRequestId,
  recordStockMovements,
  type ItemKind,
  type StockItem,
} from "@/services/stockService";
import { MovementList } from "./MovementList";
import { MixRecipeSection } from "./MixRecipeSection";
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
    <>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setSearch("")}
            onClear={() => setSearch("")}
            placeholder="Search"
            className="w-64"
            aria-label="Search stock"
          />
          <FilterSelect
            label="Kind"
            value={kind}
            onChange={(v) => setKind(v as KindFilter)}
            options={[
              ["all", "All"],
              ["product_pool", "Products"],
              ["raw_material", "Raw materials"],
              ["premix", "Premixes"],
              ["blend", "Blends"],
              ["consumable", "Consumables"],
            ]}
          />
          {belowZeroCount > 0 || belowZeroOnly ? (
            <FilterPill active={belowZeroOnly} onClick={() => setBelowZeroOnly((v) => !v)} icon={<AlertTriangle />}>
              Below zero ({belowZeroCount})
            </FilterPill>
          ) : null}
          <div className="flex-1" />
          {canEdit ? (
            <Button
              variant="primary"
              icon={<Plus />}
              onClick={() => {
                setSelectedId(null);
                setAdding(true);
              }}
            >
              Add item
            </Button>
          ) : null}
        </div>

        {items.status === "loading" ? (
          <LoadingState className="flex-1" />
        ) : items.status === "error" ? (
          <ErrorState title="Stock could not be loaded">{items.message}</ErrorState>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Boxes />} title={list.length === 0 ? "No stock items yet" : "Nothing matches"}>
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
          products={products}
          canEdit={canEdit}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </>
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
  // Narrow window: keep item and on-hand, drop kind and packs.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setCompact((entry?.contentRect.width ?? 1200) < 760));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const cols = compact
    ? "grid-cols-[minmax(160px,1fr)_128px]"
    : "grid-cols-[minmax(200px,2fr)_112px_128px_minmax(180px,2fr)]";

  return (
    <div ref={scrollRef} className="-ml-3 min-h-0 flex-1 overflow-auto pl-3">
      <div
        className={clsx(
          "sticky top-0 z-10 grid h-10 items-center gap-6 border-b border-line bg-surface text-label font-medium whitespace-nowrap text-ink-muted before:absolute before:inset-y-0 before:-left-3 before:w-3 before:bg-surface",
          cols,
        )}
      >
        <span>Item</span>
        {compact ? null : <span>Kind</span>}
        <span className="text-right">On hand</span>
        {compact ? null : <span>Packs that could be filled</span>}
      </div>
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
                "absolute inset-x-0 grid cursor-pointer items-center gap-6 border-b border-line-row text-body",
                cols,
                isSelected
                  ? "bg-accent-50 before:absolute before:inset-y-0 before:-left-3 before:w-3 before:bg-accent-50 before:shadow-[inset_2px_0_0_var(--color-accent)]"
                  : "hover:bg-surface-alt",
              )}
              style={{ height: ROW_HEIGHT, transform: `translateY(${v.start}px)` }}
            >
              <span className="min-w-0 truncate">
                <span className="font-medium text-ink">{item.name}</span>
                {item.code ? <span className="ml-2 font-mono text-caption text-ink-subtle">{item.code}</span> : null}
              </span>
              {compact ? null : <span className="truncate text-ink-muted">{KIND_LABEL[item.kind]}</span>}
              <span className={clsx("num text-right whitespace-nowrap", item.onHandMilli < 0 ? "text-danger" : "text-ink")}>
                {!item.unitSet ? (
                  <Badge tone="warning">Unit not set</Badge>
                ) : (
                  <>
                    {item.onHandMilli < 0 ? <AlertTriangle className="mr-1 inline size-4 align-[-3px]" aria-hidden /> : null}
                    {formatQuantity(item.onHandMilli, item.baseUnit)}
                  </>
                )}
              </span>
              {compact ? null : (
                <span className="truncate text-label text-ink-muted">{packsSummary(item, products).join(" · ") || "-"}</span>
              )}
            </div>
          );
        })}
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
    <SidePanel label={title}>
      <div className="flex shrink-0 items-start gap-2 px-6 pt-6 pb-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-title font-semibold break-words text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-label break-words text-ink-muted">{subtitle}</p> : null}
        </div>
        {actions}
        <IconButton label="Close" size="sm" onClick={onClose}>
          <X />
        </IconButton>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-6 pb-6">{children}</div>
    </SidePanel>
  );
}

function ItemPanel({ item, products, canEdit, onClose }: {
  item: StockItem;
  products: Product[];
  canEdit: boolean;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
      subtitle={[KIND_LABEL[item.kind], item.code, item.densityKgPerL ? `${item.densityKgPerL} kg/L` : null].filter(Boolean).join(" · ")}
      onClose={onClose}
      actions={
        canEdit && !isPool ? (
          <>
            <Button size="sm" onClick={() => setEditing(true)} icon={<Pencil />}>
              Edit
            </Button>
            <Menu size="sm" items={[{ label: "Delete item", icon: <Trash2 />, danger: true, onSelect: () => setDeleting(true) }]} />
          </>
        ) : null
      }
    >
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        <section>
          <p className="text-label text-ink-muted">On hand</p>
          <OnHandCount item={item} canEdit={canEdit} />
          {item.onHandMilli < 0 ? (
            <p className="mt-1 flex items-center gap-1.5 text-label text-danger">
              <AlertTriangle className="size-4 shrink-0" /> Below zero. Count it and correct.
            </p>
          ) : null}
          {packs.length ? (
            <p className="num mt-2 text-label text-ink-muted" title="Packs this could fill">
              {packs.join(" · ")}
            </p>
          ) : null}
          {item.aliases.length ? <p className="mt-2 text-caption text-ink-subtle">Also called {item.aliases.join(", ")}</p> : null}
        </section>

        <Section title="History">
          <MovementList state={history} canEdit={canEdit} showItem={false} emptyText="No stock recorded for this item yet." />
        </Section>

        {isMix(item.kind) ? <MixRecipeSection item={item} /> : null}
      </div>
      {deleting ? <DeleteItemDialog item={item} onClose={() => setDeleting(false)} onDeleted={onClose} /> : null}
    </Panel>
  );
}

/**
 * The on-hand amount with an Edit button beside it to correct the count — "feels directly
 * editable" (decision #23): type what's really there and the server records only the
 * difference. With no history yet it's the opening stock. Every save is a new diary line;
 * nothing is overwritten. Stock in / out and production are entered in the Daily journal
 * (Sharnya, 22 Oct 2026).
 */
function OnHandCount({ item, canEdit }: { item: StockItem; canEdit: boolean }) {
  const opening = !item.lastMovementAt && item.onHandMilli === 0;
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState("");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const qtyId = useId();
  const whyId = useId();

  const start = () => {
    setQty(opening ? "" : String(item.onHandMilli / 1000));
    setWhy("");
    setMessage(null);
    setEditing(true);
  };

  const save = async () => {
    setMessage(null);
    let milli: number;
    try {
      milli = parseQuantityToMilli(qty);
    } catch {
      return setMessage({ tone: "error", text: "Enter a quantity like 26 or 17.5." });
    }
    const note = why.trim();
    if (!opening && !note) return setMessage({ tone: "error", text: "Say why." });
    setBusy(true);
    try {
      const result = await recordStockMovements(newRequestId(), indiaDate(), [
        opening
          ? { itemId: item.id, kind: "OPENING", qtyMilli: milli, ...(note ? { note } : {}) }
          : { itemId: item.id, kind: "COUNT", countedMilli: milli, note },
      ]);
      setEditing(false);
      const below = result.belowZero.some((b) => b.itemId === item.id);
      setMessage(
        below
          ? { tone: "warn", text: "Saved, but it's below zero. Count it and correct." }
          : { tone: "ok", text: result.recorded === 0 ? "Already matches. Nothing to change." : opening ? "Opening stock saved." : "Count saved." },
      );
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  if (!item.unitSet) {
    return (
      <div className="mt-1 space-y-1.5">
        <Badge tone="warning">Unit not set</Badge>
        <p className="text-label text-ink-muted">
          An Admin sets it with Edit (top right): litres, kg or pieces. No stock can be recorded until then.
        </p>
      </div>
    );
  }

  const note = message ? (
    <Banner tone={message.tone === "ok" ? "success" : message.tone === "warn" ? "warning" : "danger"} className="mt-2">
      {message.text}
    </Banner>
  ) : null;

  if (!editing) {
    return (
      <>
        <div className="mt-1 flex items-center gap-2">
          <p className={clsx("num text-headline font-semibold", item.onHandMilli < 0 ? "text-danger" : "text-ink")}>
            {formatQuantity(item.onHandMilli, item.baseUnit)}
          </p>
          {canEdit ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={start}
              icon={<Pencil />}
              title={opening ? "Enter the opening stock" : "Correct the count to what's really there"}
            >
              Edit
            </Button>
          ) : null}
        </div>
        {note}
      </>
    );
  }

  return (
    <form
      className="mt-2 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) {
          e.stopPropagation();
          setEditing(false);
        }
      }}
    >
      <Field label={opening ? "Opening quantity" : "Quantity actually there"} htmlFor={qtyId}>
        <div className="relative">
          <Input
            id={qtyId}
            aria-label={opening ? "Opening quantity" : "Quantity actually there"}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
            placeholder={opening ? "How much is there?" : "What's really there?"}
            className="num [&_input]:pr-14"
            autoFocus
            onFocus={(e) => e.target.select()}
          />
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-label text-ink-muted">
            {unitWord(item.baseUnit)}
          </span>
        </div>
      </Field>
      <Field label="Reason" htmlFor={whyId} optional={opening}>
        <Input
          id={whyId}
          aria-label="Reason"
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder={opening ? "Note (optional)" : "Why? e.g. monthly count"}
          maxLength={200}
        />
      </Field>
      {note}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" loading={busy} disabled={!qty.trim()}>
          {opening ? "Save" : "Save count"}
        </Button>
      </div>
    </form>
  );
}

function DeleteItemDialog({ item, onClose, onDeleted }: { item: StockItem; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
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
    <Dialog
      danger
      title="Delete item"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void remove()} loading={busy}>
            {busy ? "Deleting…" : "Delete item"}
          </Button>
        </>
      }
    >
      <p className="text-body text-ink">Delete {item.name}? It must have nothing on hand. Its history is kept.</p>
      {error ? <Banner tone="danger">{error}</Banner> : null}
    </Dialog>
  );
}
