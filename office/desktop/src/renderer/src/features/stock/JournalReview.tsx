import clsx from "clsx";
import { AlertTriangle, Factory, FlaskConical, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatQuantity, parseQuantityToMilli, parseRecipe } from "@technofluid/core";
import { Badge, Button, Input } from "@/components/ui";
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
  type ReviewGroup,
  type ReviewLine,
  type ReviewProblem,
  type UseLine,
} from "./reviewModel";
import { signedQuantity, unitWord } from "./stockFormat";

const KIND_TEXT: Record<string, string> = { IN: "In", OUT: "Out", COUNT: "Counted", OPENING: "Opening" };

/** Short tag + the longer explanation shown on hover. */
const STATUS: Record<UseLine["status"], { tag: string; help: string; warn: boolean }> = {
  ok: { tag: "From recipe", help: "Worked out from the recipe (by volume). Change it if more or less was used.", warn: false },
  no_percent: { tag: "No % — enter amount", help: "The recipe gives no percent. Type how much was used, or leave it empty if it wasn't.", warn: true },
  not_in_stock: { tag: "Not in stock — pick item", help: "No stock item has this recipe code. Pick the matching item, or leave the amount empty to skip it.", warn: true },
  needs_density: { tag: "Density missing — enter amount", help: "Litres ↔ kg needs a density that isn't known. Type how much was used.", warn: true },
  unit_mismatch: { tag: "Enter amount", help: "This can't be worked out from a percent. Type how much was used.", warn: true },
  added: { tag: "Added", help: "Added by you.", warn: false },
};

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
  const updateGroup = (key: string, next: ReviewGroup) => onChange(groups.map((g) => (g.key === key ? next : g)));
  const [recipeOpen, setRecipeOpen] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !busy && !recipeOpen && onBack();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [busy, recipeOpen, onBack]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-6" role="dialog" aria-modal="true" aria-label="Review and confirm">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
        <header className="flex items-start gap-2 border-b border-line px-5 py-3">
          <div className="flex-1">
            <h2 className="text-[14px] font-semibold text-ink">Review and confirm</h2>
            <p className="text-[12px] text-ink-muted">Nothing is saved until you confirm.</p>
          </div>
          <Button variant="ghost" size="sm" className="px-1.5" aria-label="Close" onClick={onBack} disabled={busy}>
            <X className="size-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
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
                onRecipeDialog={setRecipeOpen}
              />
            ) : (
              <div key={g.key} className="flex flex-wrap items-center gap-2 rounded-md border border-line px-3 py-2 text-[13px]">
                <Badge tone={g.kind === "OUT" ? "warning" : "info"}>{KIND_TEXT[g.kind]}</Badge>
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{g.line.item?.name}</span>
                <div className="w-32">
                  <QtyInput line={g.line} unit={g.line.item?.baseUnit ?? "L"} onChange={(line) => updateGroup(g.key, { ...g, line })} />
                </div>
                {problemFor(g.line.key) ? <p className="w-full text-[12px] text-danger">{problemFor(g.line.key)}</p> : null}
              </div>
            ),
          )}

          <section>
            <h3 className="mb-1 text-2xs font-medium tracking-wide text-ink-muted uppercase">Stock after saving</h3>
            <table className="w-full border-collapse text-[13px]">
              <tbody>
                {summary.map((c) => (
                  <tr key={c.item.id} className="border-b border-line/70">
                    <td className="py-1.5 pr-3 font-medium text-ink">{c.item.name}</td>
                    <td className={clsx("num py-1.5 pr-3 text-right font-semibold whitespace-nowrap", c.changeMilli < 0 ? "text-danger" : "text-success")}>
                      {c.changeMilli === 0 ? "—" : signedQuantity(c.changeMilli, c.item.baseUnit)}
                    </td>
                    <td className={clsx("num w-36 py-1.5 text-right whitespace-nowrap", c.afterMilli < 0 ? "font-semibold text-danger" : "text-ink-muted")}>
                      {c.afterMilli < 0 ? <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" /> : null}
                      {formatQuantity(c.afterMilli, c.item.baseUnit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {summary.some((c) => c.afterMilli < 0) ? (
              <p className="mt-1.5 text-[12px] text-warning">Some items will go below zero — you can still save.</p>
            ) : null}
          </section>
        </div>

        <footer className="flex items-center gap-2 border-t border-line px-5 py-3">
          {error ? <p role="alert" className="flex-1 text-[12px] text-danger">{error}</p> : <span className="flex-1" />}
          <Button size="sm" onClick={onBack} disabled={busy}>
            {backLabel}
          </Button>
          <Button size="sm" variant="primary" onClick={onConfirm} loading={busy}>
            Confirm and save
          </Button>
        </footer>
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
  onRecipeDialog,
}: {
  group: Extract<ReviewGroup, { type: "production" }>;
  materials: StockItem[];
  items: StockItem[];
  products: Product[];
  problemFor: (key: string) => string | undefined;
  onChange: (g: Extract<ReviewGroup, { type: "production" }>) => void;
  onRecipeDialog: (open: boolean) => void;
}) {
  const pool = g.made.item!;
  const { role } = useStaff();
  const [changing, setChanging] = useState(false);
  const [recipeNote, setRecipeNote] = useState<string | null>(null);
  const currentRecipe = products.find((p) => p.productKey === pool.productKey && p.recipe.length > 0)?.recipe ?? [];
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

  return (
    <div className="rounded-md border border-line">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-canvas px-3 py-2">
        <Factory className="size-4 shrink-0 text-brand-orange" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{pool.name}</span>
        <div className="w-32">
          <QtyInput line={g.made} unit={pool.baseUnit} onChange={setMade} label="Quantity made" />
        </div>
        {canChangeRecipe(role) && pool.productKey ? (
          <Button size="sm" variant="ghost" onClick={() => openRecipe(true)} icon={<FlaskConical className="size-3.5" />}>
            Recipe
          </Button>
        ) : null}
      </div>
      {problemFor(g.made.key) ? <p className="px-3 pt-1.5 text-[12px] text-danger">{problemFor(g.made.key)}</p> : null}
      {recipeNote ? <p className="px-3 pt-1.5 text-[12px] text-ink-muted">{recipeNote}</p> : null}

      <div className="px-3 py-2">
        {!g.hasRecipe ? (
          <p className="mb-1.5 text-[12px] text-warning">No recipe — nothing is deducted. Add what was used if needed.</p>
        ) : null}
        <ul className="divide-y divide-line/70">
          {g.uses.map((u) => {
            const s = STATUS[u.status];
            const pickable = !u.item || u.status === "not_in_stock" || u.status === "added";
            return (
              <li key={u.key} className="py-1.5">
                <div className="grid grid-cols-[110px_minmax(150px,1fr)_120px_28px] items-center gap-2 text-[13px]">
                  <span className="truncate font-mono text-[12px] text-ink-muted" title={u.ingredient?.code}>
                    {u.ingredient ? `${u.ingredient.code} ${u.ingredient.percentBp != null ? `${u.ingredient.percentBp / 100}%` : ""}` : "—"}
                  </span>
                  {pickable ? (
                    <ItemPicker items={materials} value={u.item} onChange={(item) => setUse(u.key, { item })} />
                  ) : (
                    <span className="truncate font-medium text-ink">{u.item!.name}</span>
                  )}
                  <QtyInput
                    line={u}
                    unit={u.item?.baseUnit ?? "L"}
                    showUnit={Boolean(u.item)}
                    onChange={(line) => setUse(u.key, { qty: line.qty })}
                    placeholder={s.warn ? "Amount" : "0"}
                    label={`Amount of ${u.ingredient?.code ?? "material"} used`}
                  />
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
                </div>
                <p className={clsx("mt-0.5 pl-[118px] text-2xs", s.warn ? "text-warning" : "text-ink-faint")} title={s.help}>
                  {u.touched && u.status === "ok" ? "Edited" : s.tag}
                  {problemFor(u.key) ? <span className="ml-2 text-danger">{problemFor(u.key)}</span> : null}
                </p>
              </li>
            );
          })}
        </ul>
        <Button size="sm" variant="ghost" className="mt-1" onClick={addUse} icon={<Plus className="size-3.5" />}>
          Add material
        </Button>
      </div>

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
