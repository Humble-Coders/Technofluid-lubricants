import clsx from "clsx";
import { AlertTriangle, ArrowDownToLine, ArrowRight, ArrowUpFromLine, Check, Factory, Flag, FlaskConical, Pencil, PlusCircle, X } from "lucide-react";
import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { formatQuantity, parseQuantityToMilli, parseRecipe, recipeTotalBp } from "@technofluid/core";
import { Button, Input, Select } from "@/components/ui";
import { useStaff } from "@/features/auth/session";
import { RecipeChangeDialog } from "@/features/recipes/RecipeChangeDialog";
import { canChangeRecipe } from "@/lib/access";
import type { RecipeChangeInput } from "@/services/productionService";
import type { Product } from "@/services/productService";
import { isMix, type StockItem } from "@/services/stockService";
import { ItemPicker } from "./ItemPicker";
import {
  alternatesFor,
  changeUse,
  effectiveIngredient,
  netChanges,
  newUse,
  proposeUses,
  readReview,
  recipeChanged,
  recipeChangesOf,
  recipeOf,
  recipeProblemKey,
  reworkUses,
  leafLines,
  updateUse,
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
  cycle: { tag: "Loop in recipes", help: "This recipe leads back to itself (A → B → A). Type how much was used, or leave it empty.", warn: true },
  too_deep: { tag: "Enter amount", help: "Too many levels of premixes/blends to follow. Type how much was used.", warn: true },
  no_unit: { tag: "Unit not set", help: "This material has no unit yet — an Admin sets it on Live stock (Edit). Until then it can't be deducted.", warn: true },
};

const CHIP = "inline-flex h-6 items-center rounded-md px-2 text-[12px] font-medium whitespace-nowrap";

/** Sent with "Send for review" / "Save recipe and confirm" when a recipe was changed. */
export interface RecipeConfirm {
  recipeChanges: RecipeChangeInput[];
  reason: string;
}

const pctText = (bp: number | null | undefined) => (bp == null ? "no %" : `${bp / 100}%`);

type Tone = "ok" | "warn" | "danger" | "info";
const TONE: Record<Tone, string> = {
  ok: "bg-success-soft text-success",
  warn: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

/** The Status chip of a material line. */
function statusOf(u: UseLine, after: number | null): { tag: string; tone: Tone } {
  const s = STATUS[u.status];
  const ing = effectiveIngredient(u);
  if (u.parts) return { tag: "Mixed on the spot", tone: "info" };
  if (!ing?.code) return { tag: "New", tone: "warn" };
  if (!u.item) return { tag: u.status === "not_in_stock" ? s.tag : "Pick item", tone: "warn" };
  if (s.warn && u.status !== "not_in_stock" && !u.qty.trim()) return { tag: s.tag, tone: "warn" };
  if (after !== null && after < 0) return { tag: "Short", tone: "danger" };
  return { tag: "Available", tone: "ok" };
}

const MADE_LABEL: Record<string, string> = { product_pool: "Output product", premix: "Premix", blend: "Blend" };

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
  /** `recipe` is set when a recipe was changed in the review. */
  onConfirm: (recipe: RecipeConfirm | null) => void;
  backLabel?: string;
}) {
  const { role } = useStaff();
  const isAdmin = role === "admin";
  const changes = useMemo(() => recipeChangesOf(groups), [groups]);
  const changed = changes.length > 0;
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const confirm = () => {
    setReasonError(null);
    if (!changed) return onConfirm(null);
    if (!isAdmin && !reason.trim()) return setReasonError("Say why the recipe should change.");
    onConfirm({ recipeChanges: changes, reason });
  };
  const materials = useMemo(() => items.filter((i) => i.kind !== "product_pool"), [items]);
  const problemFor = (key: string) => problems.find((p) => p.key === key)?.message;
  const summary = useMemo(() => netChanges(readReview(groups).lines, items), [groups, items]);
  const afterOf = useMemo(() => new Map(summary.map((c) => [c.item.id, c.afterMilli])), [summary]);
  const updateGroup = (key: string, next: ReviewGroup) => onChange(groups.map((g) => (g.key === key ? next : g)));
  const [recipeOpen, setRecipeOpen] = useState(false);

  // Materials already shown (with what's left) in a recipe table aren't repeated below.
  const inTables = new Set(groups.flatMap((g) => (g.type === "production" ? leafLines(g.uses).map((l) => l.use.item?.id) : [])));
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

        <footer className="space-y-2 px-6 pt-2 pb-5">
          {changed ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-brand-orange/8 px-4 py-2.5">
              <p className="text-[13px] text-ink">
                {isAdmin ? "The new recipe is saved with this entry." : "Recipe changed — the Admin approves it before anything is saved."}
              </p>
              <Input
                aria-label="Why change the recipe"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setReasonError(null);
                }}
                maxLength={300}
                invalid={Boolean(reasonError)}
                placeholder={isAdmin ? "Reason (optional)" : "Why change the recipe?"}
                className="min-w-60 flex-1 [&_input]:h-9"
              />
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            {error || reasonError ? (
              <p role="alert" className="flex-1 text-[12px] text-danger">
                {reasonError ?? error}
              </p>
            ) : (
              <span className="flex-1" />
            )}
            <Button className="h-10 px-6" onClick={onBack} disabled={busy}>
              {backLabel}
            </Button>
            <Button variant="primary" className="h-10 px-7" onClick={confirm} loading={busy}>
              {!changed ? "Confirm and save" : isAdmin ? "Save recipe and confirm" : "Send for review"}
            </Button>
          </div>
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
  const listId = useId();
  const [changing, setChanging] = useState(false);
  const [recipeNote, setRecipeNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ code: "", percent: "" });
  const [editError, setEditError] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableSectionElement>(null);
  const mix = isMix(pool.kind);
  const owner = mix ? null : products.find((p) => p.productKey === pool.productKey && p.recipe.length > 0);
  const currentRecipe = mix ? pool.recipe : (owner?.recipe ?? []);
  const currentAlternates = mix ? pool.recipeAlternates : (owner?.recipeAlternates ?? []);
  const canChange = canChangeRecipe(role) && (mix || Boolean(pool.productKey));
  const changed = recipeChanged(g);
  const total = recipeTotalBp(recipeOf(g));
  const codes = useMemo(() => [...new Set(materials.flatMap((m) => (m.code ? [m.code] : [])))].sort(), [materials]);
  const madeMilliOf = (qty: string): number | null => {
    try {
      return qty.trim() ? parseQuantityToMilli(qty) : null;
    } catch {
      return null;
    }
  };
  const madeMilli = madeMilliOf(g.made.qty);
  const openRecipe = (open: boolean) => {
    setChanging(open);
    onRecipeDialog(open);
  };

  // Changing the amount made re-works the lines whose amount the person hasn't typed.
  const setMade = (made: ReviewLine) => {
    const milli = madeMilliOf(made.qty);
    onChange({ ...g, made, uses: milli === null ? g.uses : reworkUses(pool, milli, g.uses, items) });
  };
  const setUse = (key: string, patch: Partial<UseLine>) =>
    onChange({ ...g, uses: updateUse(g.uses, key, (u) => ({ ...u, ...patch, touched: true })) });
  const replaceUse = (key: string, next: UseLine) => onChange({ ...g, uses: g.uses.map((u) => (u.key === key ? next : u)) });

  const startEdit = (u: UseLine) => {
    setEditing(u.key);
    setEditError(null);
    setDraft({ code: u.ingredient?.code ?? "", percent: u.ingredient?.percentBp != null ? String(u.ingredient.percentBp / 100) : "" });
  };
  const cancelEdit = (u: UseLine) => {
    setEditing(null);
    setEditError(null);
    // A new line left empty goes away.
    if (!u.ingredient?.code) onChange({ ...g, uses: g.uses.filter((x) => x.key !== u.key) });
  };
  const saveEdit = (u: UseLine) => {
    const code = draft.code.trim().toLowerCase().replace(/\s+/g, " ");
    if (!code) return setEditError("Enter the material code, e.g. w150.");
    if (g.uses.some((x) => x.key !== u.key && x.ingredient?.code === code)) return setEditError(`"${code}" is already in the recipe.`);
    let percentBp: number | null = null;
    if (draft.percent.trim()) {
      const p = Number(draft.percent);
      if (!Number.isFinite(p) || p <= 0 || p > 100) return setEditError("The % must be above 0 and at most 100.");
      if (Math.round(p * 100) !== p * 100) return setEditError("At most 2 decimals in the %.");
      percentBp = Math.round(p * 100);
    }
    replaceUse(u.key, changeUse(pool, madeMilli, u, { ingredient: { code, percentBp } }, items, g.alternates));
    setEditing(null);
    setEditError(null);
  };
  const addUse = () => {
    const u = newUse(g.key);
    onChange({ ...g, uses: [...g.uses, u] });
    startEdit(u);
  };
  const focusAmount = (key: string) => tableRef.current?.querySelector<HTMLInputElement>(`[data-use="${key}"] input`)?.focus();

  const chip = changed ? (
    <span className={clsx(CHIP, "bg-brand-orange text-white")}>
      <FlaskConical className="mr-1 size-3.5" />
      Recipe changed
    </span>
  ) : (
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
        sub={MADE_LABEL[pool.kind] ?? "Output product"}
        label="Quantity to make"
        problem={problemFor(g.made.key)}
        note={recipeNote}
        extra={
          canChange && !changed ? (
            <button type="button" onClick={() => openRecipe(true)} title="Change the recipe" className="rounded-md hover:opacity-80">
              {chip}
            </button>
          ) : (
            chip
          )
        }
      >
        <QtyInput line={g.made} unit={pool.baseUnit} onChange={setMade} label="Quantity made" big />
      </ItemHeader>

      <section className="rounded-lg border border-line px-4 py-4">
        <h3 className="text-[15px] font-semibold text-ink">Recipe materials</h3>
        <p className="mb-3 text-[12px] text-ink-muted">
          {g.hasRecipe || g.uses.length > 0
            ? "Used from stock by the recipe. Change any amount, or use ✎ to change the recipe."
            : "No recipe — nothing is deducted. Add the materials it's made of."}
        </p>
        <datalist id={listId}>
          {codes.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full table-fixed border-collapse text-[13px]">
            <colgroup>
              <col className="w-[28%]" />
              <col className="w-[9%]" />
              <col className="w-[17%]" />
              <col className="w-[12%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead className="bg-canvas text-left text-[12px] text-ink-muted">
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
                const ing = effectiveIngredient(u);
                const isEditing = editing === u.key;
                const pickable = Boolean(ing?.code) && (!u.item || u.status === "not_in_stock");
                const after = u.item && !u.parts ? (afterOf.get(u.item.id) ?? u.item.onHandMilli) : null;
                const status = statusOf(u, after);
                const problem = problemFor(u.key);
                const keys = (e: React.KeyboardEvent) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveEdit(u);
                  } else if (e.key === "Escape") {
                    e.stopPropagation();
                    cancelEdit(u);
                  }
                };
                return (
                  <Fragment key={u.key}>
                  <tr className={clsx("border-t border-line align-middle", isEditing && "bg-brand-orange/[0.04]")}>
                    <td className="px-4 py-2.5">
                      {isEditing ? (
                        <Input
                          aria-label="Material code"
                          value={draft.code}
                          onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
                          onKeyDown={keys}
                          list={listId}
                          placeholder="Code, e.g. w150"
                          className="font-mono [&_input]:h-9"
                          autoFocus
                        />
                      ) : (
                        <>
                          <p className="font-mono text-[13px] font-semibold text-ink">{u.ingredient?.code || "—"}</p>
                          {u.alternates.length > 0 ? (
                            <Select
                              aria-label={`Material used for ${u.ingredient?.code}`}
                              value={u.useCode ?? ""}
                              onChange={(e) => replaceUse(u.key, changeUse(pool, madeMilli, u, { useCode: e.target.value || null }, items, g.alternates))}
                              className="mt-1 [&_select]:h-8 [&_select]:text-[12px]"
                            >
                              <option value="">
                                {u.ingredient?.code} ({pctText(u.ingredient?.percentBp)})
                              </option>
                              {u.alternates.map((a) => (
                                <option key={a.code} value={a.code}>
                                  Instead: {a.code} ({pctText(a.percentBp)})
                                </option>
                              ))}
                            </Select>
                          ) : null}
                          {pickable ? (
                            <div className="mt-1">
                              <ItemPicker items={materials} value={u.item} onChange={(item) => setUse(u.key, { item })} />
                            </div>
                          ) : u.item && u.item.name.toLowerCase() !== ing?.code ? (
                            <p className="truncate text-[12px] text-ink-muted">{u.item.name}</p>
                          ) : null}
                        </>
                      )}
                      {isEditing && editError ? <p className="mt-1 text-[12px] text-danger">{editError}</p> : null}
                      {problem ? <p className="mt-1 text-[12px] text-danger">{problem}</p> : null}
                    </td>
                    <td className="num px-3 py-2.5 text-ink-muted">
                      {isEditing ? (
                        <div className="relative">
                          <Input
                            aria-label="Recipe percent"
                            value={draft.percent}
                            onChange={(e) => setDraft((d) => ({ ...d, percent: e.target.value }))}
                            onKeyDown={keys}
                            inputMode="decimal"
                            placeholder="%"
                            className="num [&_input]:h-9 [&_input]:pr-6"
                          />
                          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[12px] text-ink-muted">%</span>
                        </div>
                      ) : ing?.code ? (
                        pctText(ing.percentBp)
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {u.parts ? (
                        <span className="num text-ink-muted" title="Made from its own recipe — the lines below are deducted instead">
                          {u.qty ? `${u.qty} ${unitWord(u.item?.baseUnit ?? "L")}` : "—"}
                        </span>
                      ) : (
                        <div data-use={u.key}>
                          <QtyInput
                            line={u}
                            unit={u.item?.baseUnit ?? "L"}
                            showUnit={Boolean(u.item)}
                            onChange={(line) => setUse(u.key, { qty: line.qty })}
                            placeholder={s.warn ? "Amount" : "0"}
                            label={`Amount of ${ing?.code || "material"} used`}
                          />
                        </div>
                      )}
                    </td>
                    <td className="num px-3 py-2.5 text-ink-muted">{u.item ? formatQuantity(u.item.onHandMilli, u.item.baseUnit) : "—"}</td>
                    <td className={clsx("num px-3 py-2.5 font-semibold", after === null ? "text-ink-faint" : after < 0 ? "text-danger" : "text-success")}>
                      {u.item && after !== null ? formatQuantity(after, u.item.baseUnit) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        title={u.parts ? "Not taken from stock — its recipe's materials are, below." : s.help}
                        className={clsx(CHIP, "h-auto min-h-6 py-0.5 whitespace-normal", TONE[status.tone])}
                      >
                        {status.tag}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-center gap-1.5">
                        {isEditing ? (
                          <>
                            <IconButton label="Save this line" onClick={() => saveEdit(u)} tone="ok">
                              <Check className="size-3.5" />
                            </IconButton>
                            <IconButton label="Cancel" onClick={() => cancelEdit(u)}>
                              <X className="size-3.5" />
                            </IconButton>
                          </>
                        ) : canChange ? (
                          <IconButton label="Change this recipe line (material and %)" onClick={() => startEdit(u)} disabled={editing !== null}>
                            <Pencil className="size-3.5" />
                          </IconButton>
                        ) : (
                          <IconButton label="Change the amount" onClick={() => focusAmount(u.key)}>
                            <Pencil className="size-3.5" />
                          </IconButton>
                        )}
                      </div>
                    </td>
                  </tr>
                  {u.parts ? (
                    <PartRows parts={u.parts} depth={1} via={u.ingredient?.code ?? ""} materials={materials} afterOf={afterOf} problemFor={problemFor} setUse={setUse} />
                  ) : null}
                  </Fragment>
                );
              })}
              <tr className="border-t border-line">
                <td colSpan={7} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-3">
                    {canChange ? (
                      <button
                        type="button"
                        onClick={addUse}
                        disabled={editing !== null}
                        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-info hover:underline disabled:opacity-50"
                      >
                        <PlusCircle className="size-4" /> Add material
                      </button>
                    ) : null}
                    <span className="flex-1" />
                    <span
                      className={clsx(
                        "num text-[12px] font-medium",
                        total === 10_000 ? "text-success" : changed ? "text-danger" : "text-ink-muted",
                      )}
                      title="A changed recipe's percents must add up to exactly 100%."
                    >
                      Recipe total {total / 100}%{changed && total !== 10_000 ? " — must be 100%" : ""}
                    </span>
                  </div>
                  {problemFor(recipeProblemKey(g.key)) ? (
                    <p className="mt-1 text-[12px] text-danger">{problemFor(recipeProblemKey(g.key))}</p>
                  ) : null}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {changing ? (
        <RecipeChangeDialog
          target={mix ? { itemId: pool.id } : { productKey: pool.productKey! }}
          productName={pool.name}
          currentRecipe={currentRecipe}
          currentAlternates={currentAlternates}
          onSent={() => setRecipeNote("Recipe change sent for approval — this run still uses the current recipe.")}
          onClose={(applied) => {
            openRecipe(false);
            if (applied) {
              // An Admin's change applies at once: use it for this run straight away.
              const recipe = parseRecipe(applied);
              const alternates = alternatesFor(pool, products);
              onChange({
                ...g,
                hasRecipe: applied.length > 0,
                originalRecipe: recipe,
                alternates,
                uses: proposeUses(pool, madeMilli, recipe, items, `${g.key}-r${Date.now()}-`, alternates),
              });
              setRecipeNote("New recipe saved and used for this run.");
            }
          }}
        />
      ) : null}
    </div>
  );
}

/** A premix/blend's own recipe lines, indented under it ("via r5"), with editable amounts. */
function PartRows({
  parts,
  depth,
  via,
  materials,
  afterOf,
  problemFor,
  setUse,
}: {
  parts: UseLine[];
  depth: number;
  via: string;
  materials: StockItem[];
  afterOf: Map<string, number>;
  problemFor: (key: string) => string | undefined;
  setUse: (key: string, patch: Partial<UseLine>) => void;
}) {
  return (
    <>
      {parts.map((u) => {
        const s = STATUS[u.status];
        const code = u.ingredient?.code ?? "—";
        const after = u.item && !u.parts ? (afterOf.get(u.item.id) ?? u.item.onHandMilli) : null;
        const status = statusOf(u, after);
        const pickable = !u.parts && (!u.item || u.status === "not_in_stock") && u.status !== "no_percent";
        const problem = problemFor(u.key);
        return (
          <Fragment key={u.key}>
            <tr className="border-t border-line/60 bg-canvas/50 align-middle text-[12px]">
              <td className="py-2 pr-4" style={{ paddingLeft: 16 + depth * 18 }}>
                <p className="flex items-baseline gap-1.5">
                  <span className="text-ink-faint">↳</span>
                  <span className="font-mono font-semibold text-ink">{code}</span>
                  <span className="truncate text-2xs text-ink-faint">via {via}</span>
                </p>
                {pickable ? (
                  <div className="mt-1">
                    <ItemPicker items={materials} value={u.item} onChange={(item) => setUse(u.key, { item })} />
                  </div>
                ) : u.item && u.item.name.toLowerCase() !== code ? (
                  <p className="truncate pl-4 text-2xs text-ink-muted">{u.item.name}</p>
                ) : null}
                {problem ? <p className="mt-1 text-danger">{problem}</p> : null}
              </td>
              <td className="num px-3 py-2 text-ink-muted">{pctText(u.ingredient?.percentBp)}</td>
              <td className="px-3 py-2">
                {u.parts ? (
                  <span className="num text-ink-muted">{u.qty ? `${u.qty} ${unitWord(u.item?.baseUnit ?? "L")}` : "—"}</span>
                ) : (
                  <QtyInput
                    line={u}
                    unit={u.item?.baseUnit ?? "L"}
                    showUnit={Boolean(u.item)}
                    onChange={(line) => setUse(u.key, { qty: line.qty })}
                    placeholder={s.warn ? "Amount" : "0"}
                    label={`Amount of ${code} used (via ${via})`}
                  />
                )}
              </td>
              <td className="num px-3 py-2 text-ink-muted">{u.item ? formatQuantity(u.item.onHandMilli, u.item.baseUnit) : "—"}</td>
              <td className={clsx("num px-3 py-2 font-semibold", after === null ? "text-ink-faint" : after < 0 ? "text-danger" : "text-success")}>
                {u.item && after !== null ? formatQuantity(after, u.item.baseUnit) : "—"}
              </td>
              <td className="px-3 py-2">
                <span title={s.help} className={clsx(CHIP, "h-auto min-h-6 py-0.5 whitespace-normal", TONE[status.tone])}>
                  {status.tag}
                </span>
              </td>
              <td />
            </tr>
            {u.parts ? (
              <PartRows parts={u.parts} depth={depth + 1} via={`${via} → ${code}`} materials={materials} afterOf={afterOf} problemFor={problemFor} setUse={setUse} />
            ) : null}
          </Fragment>
        );
      })}
    </>
  );
}

function IconButton({
  label,
  onClick,
  children,
  disabled,
  tone,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  tone?: "ok";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex size-8 items-center justify-center rounded-md border transition-colors disabled:opacity-40",
        tone === "ok"
          ? "border-success/40 bg-success-soft text-success hover:bg-success-soft/70"
          : "border-line-strong text-ink-muted hover:bg-hover hover:text-ink",
      )}
    >
      {children}
    </button>
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
