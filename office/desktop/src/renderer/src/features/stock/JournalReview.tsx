import clsx from "clsx";
import { AlertTriangle, ArrowLeft, Factory, Plus, X } from "lucide-react";
import { useMemo } from "react";
import { formatQuantity, parseQuantityToMilli } from "@technofluid/core";
import { Badge, Button, Input } from "@/components/ui";
import type { Product } from "@/services/productService";
import type { StockItem } from "@/services/stockService";
import { ItemPicker } from "./ItemPicker";
import {
  netChanges,
  proposeUses,
  readReview,
  recipeFor,
  type ReviewGroup,
  type ReviewLine,
  type ReviewProblem,
  type UseLine,
} from "./reviewModel";
import { signedQuantity, unitWord } from "./stockFormat";

const KIND_TEXT: Record<string, string> = { IN: "In", OUT: "Out", COUNT: "Counted (set to)", OPENING: "Opening stock" };

const STATUS_TEXT: Record<UseLine["status"], string> = {
  ok: "From the recipe",
  no_percent: "No % in the recipe — type how much was used, or leave empty if it wasn't used.",
  not_in_stock: "Not in the stock list yet — pick the matching item, or leave empty to skip.",
  needs_density: "Density unknown — type how much was used.",
  unit_mismatch: "Can't be worked out from a % — type how much was used.",
  added: "Added by you",
};

/**
 * Step between "Review" and saving: every change the journal will make, with the raw
 * materials each production run uses proposed from its recipe. Everything is editable;
 * nothing is saved until Confirm.
 */
export function JournalReview({
  groups,
  onChange,
  items,
  products,
  problems,
  busy,
  error,
  onBack,
  onConfirm,
  backLabel = "Back to entries",
}: {
  groups: ReviewGroup[];
  onChange: (groups: ReviewGroup[]) => void;
  items: StockItem[];
  products: Product[];
  problems: ReviewProblem[];
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onConfirm: () => void;
  /** "Back to entries" in the journal; "Cancel" when opened from the item panel. */
  backLabel?: string;
}) {
  const materials = useMemo(() => items.filter((i) => i.kind !== "product_pool"), [items]);
  const problemFor = (key: string) => problems.find((p) => p.key === key)?.message;
  const summary = useMemo(() => netChanges(readReview(groups).lines, items), [groups, items]);

  const updateGroup = (key: string, next: ReviewGroup) => onChange(groups.map((g) => (g.key === key ? next : g)));

  return (
    <div className="space-y-4 border-b border-line bg-surface px-5 py-4">
      <div>
        <h3 className="text-[13px] font-semibold text-ink">Review before saving</h3>
        <p className="text-[12px] text-ink-muted">
          Check every change. Edit any quantity, then confirm — nothing is saved until you do.
        </p>
      </div>

      {groups.map((g) =>
        g.type === "production" ? (
          <ProductionCard
            key={g.key}
            group={g}
            materials={materials}
            items={items}
            products={products}
            problemFor={problemFor}
            onChange={(next) => updateGroup(g.key, next)}
          />
        ) : (
          <div key={g.key} className="rounded-md border border-line p-3">
            <div className="grid grid-cols-[minmax(160px,2fr)_120px_minmax(110px,1fr)_minmax(140px,2fr)] items-center gap-2 text-[13px]">
              <span className="font-medium text-ink">{g.line.item?.name}</span>
              <Badge tone={g.kind === "OUT" ? "warning" : "info"}>{KIND_TEXT[g.kind]}</Badge>
              <QtyInput line={g.line} unit={g.line.item?.baseUnit ?? "L"} onChange={(line) => updateGroup(g.key, { ...g, line })} />
              <Input
                aria-label="Why"
                value={g.line.note}
                onChange={(e) => updateGroup(g.key, { ...g, line: { ...g.line, note: e.target.value } })}
                maxLength={200}
              />
            </div>
            {problemFor(g.line.key) ? <p className="mt-1 text-[12px] text-danger">{problemFor(g.line.key)}</p> : null}
          </div>
        ),
      )}

      <section>
        <h3 className="mb-1.5 text-2xs font-medium tracking-wide text-ink-muted uppercase">Final changes to stock</h3>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-center text-2xs font-medium tracking-wide text-ink-muted uppercase">
              <th className="px-3 py-1.5 text-left font-medium">Item</th>
              <th className="px-3 py-1.5 font-medium">Now</th>
              <th className="px-3 py-1.5 font-medium">Change</th>
              <th className="px-3 py-1.5 font-medium">After saving</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((c) => (
              <tr key={c.item.id} className="border-b border-line/70 text-center">
                <td className="px-3 py-1.5 text-left font-medium text-ink">{c.item.name}</td>
                <td className="num px-3 py-1.5 text-ink-muted">{formatQuantity(c.item.onHandMilli, c.item.baseUnit)}</td>
                <td className={clsx("num px-3 py-1.5 font-semibold", c.changeMilli < 0 ? "text-danger" : "text-success")}>
                  {c.changeMilli === 0 ? "no change" : signedQuantity(c.changeMilli, c.item.baseUnit)}
                </td>
                <td className={clsx("num px-3 py-1.5", c.afterMilli < 0 ? "font-semibold text-danger" : "text-ink")}>
                  {c.afterMilli < 0 ? <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" /> : null}
                  {formatQuantity(c.afterMilli, c.item.baseUnit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {summary.some((c) => c.afterMilli < 0) ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-warning">
            <AlertTriangle className="size-3.5" /> Some items will go below zero. You can still save; count them and correct later.
          </p>
        ) : null}
      </section>

      {error ? <p role="alert" className="text-[12px] text-danger">{error}</p> : null}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onBack} disabled={busy} icon={<ArrowLeft className="size-3.5" />}>
          {backLabel}
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="primary" onClick={onConfirm} loading={busy}>
          Confirm and save
        </Button>
      </div>
    </div>
  );
}

function ProductionCard({
  group: g,
  materials,
  items,
  products,
  problemFor,
  onChange,
}: {
  group: Extract<ReviewGroup, { type: "production" }>;
  materials: StockItem[];
  items: StockItem[];
  products: Product[];
  problemFor: (key: string) => string | undefined;
  onChange: (g: Extract<ReviewGroup, { type: "production" }>) => void;
}) {
  const pool = g.made.item!;

  // Changing the amount made re-works the recipe lines the person hasn't touched.
  const setMade = (made: ReviewLine) => {
    let milli: number | null = null;
    try {
      milli = made.qty.trim() ? parseQuantityToMilli(made.qty) : null;
    } catch {
      milli = null;
    }
    const uses = milli === null ? g.uses : proposeUses(pool, milli, recipeFor(pool, products), items, g.uses, `${g.key}-`);
    onChange({ ...g, made, uses });
  };
  const setUse = (key: string, patch: Partial<UseLine>) =>
    onChange({ ...g, uses: g.uses.map((u) => (u.key === key ? { ...u, ...patch, touched: true } : u)) });
  const addUse = () =>
    onChange({
      ...g,
      uses: [
        ...g.uses,
        { key: `${g.key}-added-${g.uses.length}-${Date.now()}`, item: null, qty: "", note: "", ingredient: null, status: "added", touched: true },
      ],
    });

  return (
    <div className="rounded-md border border-brand-orange/30">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-brand-orange/[0.04] px-3 py-2.5">
        <Factory className="size-4 text-brand-orange" />
        <span className="text-[13px] font-semibold text-ink">Made: {pool.name}</span>
        <div className="w-36">
          <QtyInput line={g.made} unit={pool.baseUnit} onChange={setMade} label="Quantity made" />
        </div>
        <Input
          aria-label="Note"
          value={g.made.note}
          onChange={(e) => onChange({ ...g, made: { ...g.made, note: e.target.value } })}
          placeholder="Note (optional)"
          className="min-w-40 flex-1"
          maxLength={200}
        />
      </div>
      {problemFor(g.made.key) ? <p className="px-3 pt-1 text-[12px] text-danger">{problemFor(g.made.key)}</p> : null}

      <div className="px-3 py-2.5">
        <p className="mb-1.5 text-2xs font-medium tracking-wide text-ink-muted uppercase">
          Raw materials used {g.hasRecipe ? "(proposed from the recipe — by volume)" : ""}
        </p>
        {!g.hasRecipe ? (
          <p className="mb-2 rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning">
            This product has no recipe yet — nothing is deducted. Add what was used below if needed.
          </p>
        ) : null}
        {g.uses.length > 0 ? (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-center text-2xs font-medium tracking-wide text-ink-muted uppercase">
                <th className="px-2 py-1.5 text-left font-medium">Recipe</th>
                <th className="px-2 py-1.5 text-left font-medium">Stock item</th>
                <th className="px-2 py-1.5 font-medium">Quantity used</th>
                <th className="px-2 py-1.5 text-left font-medium">Notes</th>
                <th className="w-8" aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {g.uses.map((u) => (
                <tr key={u.key} className="border-b border-line/70 align-top">
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {u.ingredient ? (
                      <>
                        <span className="font-mono text-[12px] text-ink">{u.ingredient.code}</span>
                        <span className="ml-1.5 text-[12px] text-ink-muted">
                          {u.ingredient.percentBp != null ? `${u.ingredient.percentBp / 100}%` : "no %"}
                        </span>
                      </>
                    ) : (
                      <span className="text-[12px] text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="min-w-[200px] px-2 py-1.5">
                    {u.item && u.status !== "not_in_stock" && u.status !== "added" ? (
                      <span className="font-medium text-ink">{u.item.name}</span>
                    ) : (
                      <ItemPicker items={materials} value={u.item} onChange={(item) => setUse(u.key, { item })} />
                    )}
                  </td>
                  <td className="w-40 px-2 py-1.5">
                    <QtyInput
                      line={u}
                      unit={u.item?.baseUnit ?? "L"}
                      showUnit={Boolean(u.item)}
                      onChange={(line) => setUse(u.key, { qty: line.qty })}
                      placeholder={u.status === "ok" ? "0" : "How much?"}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-[12px]">
                    <span className={u.status === "ok" || u.status === "added" ? "text-ink-faint" : "text-warning"}>
                      {u.touched && u.status === "ok" ? "Changed by you" : STATUS_TEXT[u.status]}
                    </span>
                    {problemFor(u.key) ? <span className="block text-danger">{problemFor(u.key)}</span> : null}
                  </td>
                  <td className="py-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-1.5"
                      aria-label="Don't deduct this"
                      title="Don't deduct this"
                      onClick={() => onChange({ ...g, uses: g.uses.filter((x) => x.key !== u.key) })}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <Button size="sm" variant="ghost" className="mt-1.5" onClick={addUse} icon={<Plus className="size-3.5" />}>
          Add material used
        </Button>
      </div>
    </div>
  );
}

function QtyInput({
  line,
  unit,
  onChange,
  label = "Quantity",
  placeholder = "0",
  showUnit = true,
}: {
  line: ReviewLine;
  unit: StockItem["baseUnit"];
  onChange: (line: ReviewLine) => void;
  label?: string;
  placeholder?: string;
  showUnit?: boolean;
}) {
  return (
    <div className="relative">
      <Input
        aria-label={label}
        value={line.qty}
        onChange={(e) => onChange({ ...line, qty: e.target.value })}
        inputMode="decimal"
        placeholder={placeholder}
        className="num [&_input]:pr-14"
      />
      {showUnit ? (
        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] text-ink-muted">
          {unitWord(unit)}
        </span>
      ) : null}
    </div>
  );
}
