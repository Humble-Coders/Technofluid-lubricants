import clsx from "clsx";
import { AlertTriangle, ArrowDownToLine, ArrowRight, ArrowUpFromLine, Factory, Flag, FlaskConical, Pencil, PlusCircle, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatQuantity, parseQuantityToMilli, parseRecipe } from "@technofluid/core";
import { Button, Input } from "@/components/ui";
import { useStaff } from "@/features/auth/session";
import { RecipeChangeDialog } from "@/features/recipes/RecipeChangeDialog";
import { canChangeRecipe } from "@/lib/access";
import type { Product } from "@/services/productService";
import type { StockItem } from "@/services/stockService";
import { ItemPicker } from "./ItemPicker";
import {
  netChanges,
  proposeUses,
  readReview,
  recipeFor,
  type NetChange,
  type ReviewGroup,
  type ReviewLine,
  type ReviewProblem,
  type UseLine,
} from "./reviewModel";
import { KIND_LABEL, signedQuantity, unitWord } from "./stockFormat";

const KIND_TEXT: Record<string, string> = { IN: "Stock in", OUT: "Stock out", COUNT: "Counted", OPENING: "Opening stock" };
const KIND_ICON: Record<string, typeof Factory> = { IN: ArrowDownToLine, OUT: ArrowUpFromLine, COUNT: Flag, OPENING: Flag };

/** Short status tag + the longer explanation shown on hover. */
const STATUS: Record<UseLine["status"], { tag: string; help: string; warn: boolean }> = {
  ok: { tag: "From recipe", help: "Worked out from the recipe (by volume). Change it if more or less was used.", warn: false },
  no_percent: { tag: "No % — enter amount", help: "The recipe gives no percent. Type how much was used, or leave it empty if it wasn't.", warn: true },
  not_in_stock: { tag: "Not in stock", help: "No stock item has this recipe code. Pick the matching item, or leave the amount empty to skip it.", warn: true },
  needs_density: { tag: "Enter amount", help: "Litres ↔ kg needs a density that isn't known. Type how much was used.", warn: true },
  unit_mismatch: { tag: "Enter amount", help: "This can't be worked out from a percent. Type how much was used.", warn: true },
  added: { tag: "Added", help: "Added by you.", warn: false },
};

const CHIP = "inline-flex h-6 items-center rounded-md px-2 text-[12px] font-medium whitespace-nowrap";

/**
 * The review dialog: every change the save will make — products made, the raw materials
 * their recipes use, and the stock afterwards. Everything is editable; nothing is saved
 * until "Confirm and save".
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
  backLabel = "Back",
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
  backLabel?: string;
}) {
  const materials = useMemo(() => items.filter((i) => i.kind !== "product_pool"), [items]);
  const problemFor = (key: string) => problems.find((p) => p.key === key)?.message;
  const summary = useMemo(() => netChanges(readReview(groups).lines, items), [groups, items]);
  const afterOf = useMemo(() => new Map(summary.map((c) => [c.item.id, c.afterMilli])), [summary]);
  const updateGroup = (key: string, next: ReviewGroup) => onChange(groups.map((g) => (g.key === key ? next : g)));
  const [recipeOpen, setRecipeOpen] = useState(false);

  // Materials already shown (with what's left) in a recipe table aren't repeated below.
  const inTables = new Set(groups.flatMap((g) => (g.type === "production" ? g.uses.map((u) => u.item?.id) : [])));
  const totals = summary.filter((c) => !inTables.has(c.item.id));

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !busy && !recipeOpen && onBack();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [busy, recipeOpen, onBack]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-6" role="dialog" aria-modal="true" aria-label="Review and confirm">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-surface shadow-pop">
        <header className="flex items-start gap-2 px-6 pt-5 pb-3">
          <div className="flex-1">
            <h2 className="text-[20px] font-semibold text-ink">Review and confirm</h2>
            <p className="text-[13px] text-ink-muted">Check the stock used and what's left after this entry.</p>
          </div>
          <Button variant="ghost" size="sm" className="px-1.5" aria-label="Close" onClick={onBack} disabled={busy}>
            <X className="size-5" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4">
          {groups.map((g) =>
            g.type === "production" ? (
              <ProductionCard
                key={g.key}
                group={g}
                materials={materials}
                items={items}
                products={products}
                afterOf={afterOf}
                problemFor={problemFor}
                onChange={(next) => updateGroup(g.key, next)}
                onRecipeDialog={setRecipeOpen}
              />
            ) : (
              <ItemHeader
                key={g.key}
                icon={KIND_ICON[g.kind] ?? Flag}
                name={g.line.item?.name ?? ""}
                sub={KIND_TEXT[g.kind] ?? g.kind}
                label="Quantity"
                problem={problemFor(g.line.key)}
              >
                <QtyInput line={g.line} unit={g.line.item?.baseUnit ?? "L"} onChange={(line) => updateGroup(g.key, { ...g, line })} big />
              </ItemHeader>
            ),
          )}

          {totals.length > 0 ? (
            <section className="rounded-lg bg-canvas px-5 py-4">
              <h3 className="mb-2 text-[14px] font-semibold text-ink">Stock after saving</h3>
              <div className="space-y-3">
                {totals.map((c) => (
                  <StockAfterRow key={c.item.id} change={c} />
                ))}
              </div>
            </section>
          ) : null}
          {summary.some((c) => c.afterMilli < 0) ? (
            <p className="flex items-center gap-1.5 text-[12px] text-warning">
              <AlertTriangle className="size-3.5" /> Some items will go below zero — you can still save.
            </p>
          ) : null}
        </div>

        <footer className="flex items-center gap-3 px-6 pt-2 pb-5">
          {error ? <p role="alert" className="flex-1 text-[12px] text-danger">{error}</p> : <span className="flex-1" />}
          <Button className="h-10 px-6" onClick={onBack} disabled={busy}>
            {backLabel}
          </Button>
          <Button variant="primary" className="h-10 px-7" onClick={onConfirm} loading={busy}>
            Confirm and save
          </Button>
        </footer>
      </div>
    </div>
  );
}

/** Icon + item name on the left, a labelled quantity box (and extras) on the right. */
function ItemHeader({
  icon: Icon,
  name,
  sub,
  label,
  problem,
  note,
  children,
  extra,
}: {
  icon: typeof Factory;
  name: string;
  sub: string;
  label: string;
  problem?: string;
  note?: string | null;
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-orange/12 text-brand-orange">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">{name}</p>
          <p className="text-[12px] text-ink-muted">{sub}</p>
        </div>
        <span className="text-[13px] text-ink-muted">{label}</span>
        <div className="w-40">{children}</div>
        {extra}
      </div>
      {problem ? <p className="mt-1.5 text-[12px] text-danger">{problem}</p> : null}
      {note ? <p className="mt-1.5 text-[12px] text-ink-muted">{note}</p> : null}
    </div>
  );
}

/** Current stock · change → stock after, for one item. */
function StockAfterRow({ change: c }: { change: NetChange }) {
  const before = c.afterMilli - c.changeMilli;
  const unit = c.item.baseUnit;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-orange/12 text-brand-orange">
        <Factory className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-ink">{c.item.name}</p>
        <p className="text-[12px] text-ink-muted">{c.item.kind === "product_pool" ? "Output product" : KIND_LABEL[c.item.kind]}</p>
      </div>
      <div className="w-28 text-center">
        <p className="text-[12px] text-ink-muted">Current stock</p>
        <p className="num text-[15px] font-semibold text-ink">{formatQuantity(before, unit)}</p>
      </div>
      <div className="h-8 w-px bg-line" />
      <div className="w-28 text-center">
        <p className="text-[12px] text-ink-muted">{c.changeMilli < 0 ? "To be removed" : "To be added"}</p>
        <p className={clsx("num text-[15px] font-semibold", c.changeMilli < 0 ? "text-danger" : "text-success")}>
          {c.changeMilli === 0 ? "—" : signedQuantity(c.changeMilli, unit)}
        </p>
      </div>
      <ArrowRight className="size-4 text-ink-muted" />
      <div className={clsx("w-36 rounded-lg px-3 py-2 text-center", c.afterMilli < 0 ? "bg-danger-soft" : "bg-success-soft")}>
        <p className={clsx("text-[12px]", c.afterMilli < 0 ? "text-danger" : "text-success")}>Stock after</p>
        <p className={clsx("num text-[20px] font-semibold", c.afterMilli < 0 ? "text-danger" : "text-success")}>
          {formatQuantity(c.afterMilli, unit)}
        </p>
      </div>
    </div>
  );
}

function ProductionCard({
  group: g,
  materials,
  items,
  products,
  afterOf,
  problemFor,
  onChange,
  onRecipeDialog,
}: {
  group: Extract<ReviewGroup, { type: "production" }>;
  materials: StockItem[];
  items: StockItem[];
  products: Product[];
  afterOf: Map<string, number>;
  problemFor: (key: string) => string | undefined;
  onChange: (g: Extract<ReviewGroup, { type: "production" }>) => void;
  onRecipeDialog: (open: boolean) => void;
}) {
  const pool = g.made.item!;
  const { role } = useStaff();
  const [changing, setChanging] = useState(false);
  const [recipeNote, setRecipeNote] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableSectionElement>(null);
  const currentRecipe = products.find((p) => p.productKey === pool.productKey && p.recipe.length > 0)?.recipe ?? [];
  const canChange = canChangeRecipe(role) && Boolean(pool.productKey);
  const madeMilliOf = (qty: string): number | null => {
    try {
      return qty.trim() ? parseQuantityToMilli(qty) : null;
    } catch {
      return null;
    }
  };
  const openRecipe = (open: boolean) => {
    setChanging(open);
    onRecipeDialog(open);
  };

  // Changing the amount made re-works the recipe lines the person hasn't touched.
  const setMade = (made: ReviewLine) => {
    const milli = madeMilliOf(made.qty);
    const uses = milli === null ? g.uses : proposeUses(pool, milli, recipeFor(pool, products), items, g.uses, `${g.key}-`);
    onChange({ ...g, made, uses });
  };
  const setUse = (key: string, patch: Partial<UseLine>) =>
    onChange({ ...g, uses: g.uses.map((u) => (u.key === key ? { ...u, ...patch, touched: true } : u)) });
  const addUse = () =>
    onChange({
      ...g,
      uses: [...g.uses, { key: `${g.key}-added-${Date.now()}`, item: null, qty: "", note: "", ingredient: null, status: "added", touched: true }],
    });
  const focusAmount = (key: string) => tableRef.current?.querySelector<HTMLInputElement>(`[data-use="${key}"] input`)?.focus();

  const recipeChip = (
    <span className={clsx(CHIP, g.hasRecipe ? "bg-brand-orange/12 text-brand-orange-dark" : "bg-warning-soft text-warning")}>
      <FlaskConical className="mr-1 size-3.5" />
      {g.hasRecipe ? "Uses recipe" : "No recipe"}
    </span>
  );

  return (
    <div className="space-y-4">
      <ItemHeader
        icon={Factory}
        name={pool.name}
        sub="Output product"
        label="Quantity to make"
        problem={problemFor(g.made.key)}
        note={recipeNote}
        extra={
          canChange ? (
            <button type="button" onClick={() => openRecipe(true)} title="Change the recipe" className="rounded-md hover:opacity-80">
              {recipeChip}
            </button>
          ) : (
            recipeChip
          )
        }
      >
        <QtyInput line={g.made} unit={pool.baseUnit} onChange={setMade} label="Quantity made" big />
      </ItemHeader>

      <section className="rounded-lg border border-line px-4 py-4">
        <h3 className="text-[15px] font-semibold text-ink">Recipe materials</h3>
        <p className="mb-3 text-[12px] text-ink-muted">
          {g.hasRecipe ? "Used from stock by the recipe. You can change any amount." : "No recipe — nothing is deducted. Add what was used if needed."}
        </p>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead className="bg-canvas text-left text-[12px] whitespace-nowrap text-ink-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Material</th>
                <th className="px-3 py-2.5 font-medium">Recipe %</th>
                <th className="px-3 py-2.5 font-medium">
                  Required for {g.made.qty.trim() || "0"} {unitWord(pool.baseUnit)}
                </th>
                <th className="px-3 py-2.5 font-medium">Current stock</th>
                <th className="px-3 py-2.5 font-medium">Remaining after</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-center font-medium">Action</th>
              </tr>
            </thead>
            <tbody ref={tableRef}>
              {g.uses.map((u) => {
                const s = STATUS[u.status];
                const pickable = !u.item || u.status === "not_in_stock" || u.status === "added";
                const after = u.item ? (afterOf.get(u.item.id) ?? u.item.onHandMilli) : null;
                const status = !u.item
                  ? { tag: u.status === "not_in_stock" ? s.tag : "Pick item", tone: "warn" as const }
                  : s.warn && u.status !== "not_in_stock" && !u.qty.trim()
                    ? { tag: s.tag, tone: "warn" as const }
                    : after !== null && after < 0
                      ? { tag: "Short", tone: "danger" as const }
                      : { tag: "Available", tone: "ok" as const };
                const problem = problemFor(u.key);
                return (
                  <tr key={u.key} className="border-t border-line align-middle">
                    <td className="px-4 py-2.5">
                      {u.ingredient ? <p className="font-mono text-[13px] font-semibold text-ink">{u.ingredient.code}</p> : null}
                      {pickable ? (
                        <div className={clsx("w-52", u.ingredient && "mt-1")}>
                          <ItemPicker items={materials} value={u.item} onChange={(item) => setUse(u.key, { item })} />
                        </div>
                      ) : u.item && u.item.name.toLowerCase() !== u.ingredient?.code ? (
                        <p className={clsx("max-w-52 truncate", u.ingredient ? "text-[12px] text-ink-muted" : "font-semibold text-ink")}>{u.item.name}</p>
                      ) : null}
                      {problem ? <p className="mt-1 text-[12px] text-danger">{problem}</p> : null}
                    </td>
                    <td className="num px-3 py-2.5 text-ink-muted">
                      {u.ingredient ? (u.ingredient.percentBp != null ? `${u.ingredient.percentBp / 100}%` : "no %") : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="w-36" data-use={u.key}>
                        <QtyInput
                          line={u}
                          unit={u.item?.baseUnit ?? "L"}
                          showUnit={Boolean(u.item)}
                          onChange={(line) => setUse(u.key, { qty: line.qty })}
                          placeholder={s.warn ? "Amount" : "0"}
                          label={`Amount of ${u.ingredient?.code ?? "material"} used`}
                        />
                      </div>
                    </td>
                    <td className="num px-3 py-2.5 text-ink-muted">{u.item ? formatQuantity(u.item.onHandMilli, u.item.baseUnit) : "—"}</td>
                    <td className={clsx("num px-3 py-2.5 font-semibold", after === null ? "text-ink-faint" : after < 0 ? "text-danger" : "text-success")}>
                      {u.item && after !== null ? formatQuantity(after, u.item.baseUnit) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        title={s.help}
                        className={clsx(
                          CHIP,
                          status.tone === "ok"
                            ? "bg-success-soft text-success"
                            : status.tone === "danger"
                              ? "bg-danger-soft text-danger"
                              : "bg-warning-soft text-warning",
                        )}
                      >
                        {status.tag}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-center gap-1.5">
                        <button
                          type="button"
                          aria-label="Change the amount"
                          title="Change the amount"
                          onClick={() => focusAmount(u.key)}
                          className="inline-flex size-8 items-center justify-center rounded-md border border-line-strong text-ink-muted hover:bg-hover hover:text-ink"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Don't deduct this"
                          title="Don't deduct this"
                          onClick={() => onChange({ ...g, uses: g.uses.filter((x) => x.key !== u.key) })}
                          className="inline-flex size-8 items-center justify-center rounded-md border border-line-strong text-ink-muted hover:bg-hover hover:text-danger"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-line">
                <td colSpan={7} className="px-4 py-2.5">
                  <button type="button" onClick={addUse} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-info hover:underline">
                    <PlusCircle className="size-4" /> Add material
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {changing ? (
        <RecipeChangeDialog
          productKey={pool.productKey!}
          productName={pool.name}
          currentRecipe={currentRecipe}
          onSent={() => setRecipeNote("Recipe change sent for approval — this run still uses the current recipe.")}
          onClose={(applied) => {
            openRecipe(false);
            if (applied) {
              // An Admin's change applies at once: use it for this run straight away.
              onChange({
                ...g,
                hasRecipe: applied.length > 0,
                uses: proposeUses(pool, madeMilliOf(g.made.qty), parseRecipe(applied), items, [], `${g.key}-r${Date.now()}-`),
              });
              setRecipeNote("New recipe saved and used for this run.");
            }
          }}
        />
      ) : null}
    </div>
  );
}

/** A quantity box with its unit in a separate box on the right. */
function QtyInput({
  line,
  unit,
  onChange,
  label = "Quantity",
  placeholder = "0",
  showUnit = true,
  big = false,
}: {
  line: ReviewLine;
  unit: StockItem["baseUnit"];
  onChange: (line: ReviewLine) => void;
  label?: string;
  placeholder?: string;
  showUnit?: boolean;
  /** The larger, shaded box used for the amount made. */
  big?: boolean;
}) {
  return (
    <div className="flex">
      <Input
        aria-label={label}
        value={line.qty}
        onChange={(e) => onChange({ ...line, qty: e.target.value })}
        inputMode="decimal"
        placeholder={placeholder}
        className={clsx(
          "num min-w-0 flex-1",
          showUnit && "[&_input]:rounded-r-none",
          big ? "[&_input]:h-10 [&_input]:bg-canvas [&_input]:text-[16px] [&_input]:font-semibold" : "[&_input]:h-9",
        )}
      />
      {showUnit ? (
        <span
          className={clsx(
            "inline-flex min-w-10 items-center justify-center rounded-r-md border border-l-0 border-line-strong bg-canvas px-2.5 text-[13px] text-ink-muted",
            big ? "h-10" : "h-9",
          )}
        >
          {unitWord(unit)}
        </span>
      ) : null}
    </div>
  );
}
