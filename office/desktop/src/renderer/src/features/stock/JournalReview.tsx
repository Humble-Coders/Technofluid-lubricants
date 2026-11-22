import clsx from "clsx";
import { ArrowDownToLine, ArrowUpFromLine, Check, Factory, Flag, FlaskConical, Pencil, Plus, X } from "lucide-react";
import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { formatQuantity, parseQuantityToMilli, parseRecipe, recipeTotalBp } from "@technofluid/core";
import { Badge, Banner, Button, Field, IconButton, Input, Section, Select, Table, Td, Th, Tr } from "@/components/ui";
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

/** Sent with "Send for review" / "Save recipe and confirm" when a recipe was changed. */
export interface RecipeConfirm {
  recipeChanges: RecipeChangeInput[];
  reason: string;
}

const pctText = (bp: number | null | undefined) => (bp == null ? "no %" : `${bp / 100}%`);

type Tone = "ok" | "warn" | "danger" | "info";
const TONE: Record<Tone, "success" | "warning" | "danger" | "info"> = { ok: "success", warn: "warning", danger: "danger", info: "info" };

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
  const reasonId = useId();

  // Materials already shown (with what's left) in a recipe table aren't repeated below.
  const inTables = new Set(groups.flatMap((g) => (g.type === "production" ? leafLines(g.uses).map((l) => l.use.item?.id) : [])));
  const totals = summary.filter((c) => !inTables.has(c.item.id));

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !busy && !recipeOpen && onBack();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [busy, recipeOpen, onBack]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/35 p-6" role="dialog" aria-modal="true" aria-label="Review and confirm">
      <div className="flex max-h-[90vh] w-full max-w-[1024px] flex-col overflow-hidden rounded-dialog bg-surface shadow-modal">
        <header className="flex shrink-0 items-start gap-3 bg-linear-to-r from-band-from to-band-to py-3.5 pr-3 pl-6 text-white">
          <div className="min-w-0 flex-1">
            <h2 className="text-title font-semibold">Review and confirm</h2>
            <p className="mt-0.5 text-label text-white/85">Check the stock used and what's left after this entry.</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onBack}
            disabled={busy}
            className="flex size-7 shrink-0 items-center justify-center rounded-control text-white/85 transition-colors hover:bg-white/15 hover:text-white disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
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
              <Section key={g.key}>
                <ItemHeader
                  icon={KIND_ICON[g.kind] ?? Flag}
                  name={g.line.item?.name ?? ""}
                  sub={KIND_TEXT[g.kind] ?? g.kind}
                  label="Quantity"
                  htmlFor={`review-qty-${g.key}`}
                  problem={problemFor(g.line.key)}
                >
                  <QtyInput
                    id={`review-qty-${g.key}`}
                    line={g.line}
                    unit={g.line.item?.baseUnit ?? "L"}
                    onChange={(line) => updateGroup(g.key, { ...g, line })}
                    big
                  />
                </ItemHeader>
              </Section>
            ),
          )}

          {totals.length > 0 ? (
            <Section title="Stock after saving">
              <Table>
                <thead>
                  <tr>
                    <Th>Item</Th>
                    <Th align="right">Current stock</Th>
                    <Th align="right">To be added or removed</Th>
                    <Th align="right">Stock after</Th>
                  </tr>
                </thead>
                <tbody>
                  {totals.map((c) => (
                    <StockAfterRow key={c.item.id} change={c} />
                  ))}
                </tbody>
              </Table>
            </Section>
          ) : null}
          {summary.some((c) => c.afterMilli < 0) ? (
            <Banner tone="warning" className="mt-6">
              Some items will go below zero — you can still save.
            </Banner>
          ) : null}
        </div>

        <footer className="shrink-0 space-y-3 border-t border-line px-6 py-4">
          {changed ? (
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
              <Banner tone="info" className="min-w-60 flex-1">
                {isAdmin ? "The new recipe is saved with this entry." : "Recipe changed — the Admin approves it before anything is saved."}
              </Banner>
              <Field label="Why change the recipe?" htmlFor={reasonId} optional={isAdmin} error={reasonError ?? undefined} className="w-96">
                <Input
                  id={reasonId}
                  aria-label="Why change the recipe"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setReasonError(null);
                  }}
                  maxLength={300}
                  invalid={Boolean(reasonError)}
                  placeholder={isAdmin ? "Reason (optional)" : "Why change the recipe?"}
                />
              </Field>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            {error && !reasonError ? (
              <Banner tone="danger" className="min-w-0 flex-1">
                {error}
              </Banner>
            ) : (
              <span className="flex-1" />
            )}
            <Button variant="ghost" onClick={onBack} disabled={busy}>
              {backLabel}
            </Button>
            <Button variant="primary" onClick={confirm} loading={busy}>
              {!changed ? "Confirm and save" : isAdmin ? "Save recipe and confirm" : "Send for review"}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** The item's name on the left, its labelled quantity box (and extras) on the right. */
function ItemHeader({
  icon: Icon,
  name,
  sub,
  label,
  htmlFor,
  problem,
  note,
  children,
  extra,
}: {
  icon: typeof Factory;
  name: string;
  sub: string;
  label: string;
  /** The id of the quantity box in `children`. */
  htmlFor: string;
  problem?: string;
  note?: string | null;
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-title font-semibold text-ink">
            <Icon className="size-4 shrink-0 text-ink-subtle" aria-hidden />
            <span className="truncate">{name}</span>
          </h3>
          <p className="mt-0.5 text-label text-ink-muted">{sub}</p>
        </div>
        {extra ? <div className="flex h-8 items-center gap-2">{extra}</div> : null}
        <Field label={label} htmlFor={htmlFor} className="w-44">
          {children}
        </Field>
      </div>
      {problem ? <p className="mt-2 text-caption text-danger">{problem}</p> : null}
      {note ? <p className="mt-2 text-caption text-ink-muted">{note}</p> : null}
    </div>
  );
}

/** Current stock · change → stock after, for one item. */
function StockAfterRow({ change: c }: { change: NetChange }) {
  const before = c.afterMilli - c.changeMilli;
  const unit = c.item.baseUnit;
  return (
    <Tr>
      <Td>
        <p className="font-medium">{c.item.name}</p>
        <p className="text-caption text-ink-muted">{c.item.kind === "product_pool" ? "Output product" : KIND_LABEL[c.item.kind]}</p>
      </Td>
      <Td num muted>
        {formatQuantity(before, unit)}
      </Td>
      <Td num>{c.changeMilli === 0 ? "—" : signedQuantity(c.changeMilli, unit)}</Td>
      <Td num>
        <span className={clsx("font-semibold", c.afterMilli < 0 && "text-danger")}>{formatQuantity(c.afterMilli, unit)}</span>
      </Td>
    </Tr>
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

  const recipeBadge = changed ? <Badge tone="brand">Recipe changed</Badge> : g.hasRecipe ? null : <Badge tone="warning">No recipe</Badge>;

  return (
    <Section>
      <ItemHeader
        icon={Factory}
        name={pool.name}
        sub={MADE_LABEL[pool.kind] ?? "Output product"}
        label="Quantity to make"
        htmlFor={`review-made-${g.key}`}
        problem={problemFor(g.made.key)}
        note={recipeNote}
        extra={
          canChange && !changed ? (
            <>
              {recipeBadge}
              <Button size="sm" icon={<FlaskConical />} onClick={() => openRecipe(true)} title="Change the recipe">
                Change recipe
              </Button>
            </>
          ) : (
            recipeBadge
          )
        }
      >
        <QtyInput id={`review-made-${g.key}`} line={g.made} unit={pool.baseUnit} onChange={setMade} label="Quantity made" big />
      </ItemHeader>

      <div className="mt-6">
        <h4 className="text-body font-semibold text-ink">Recipe materials</h4>
        <p className="mt-0.5 mb-2 text-label text-ink-muted">
          {g.hasRecipe || g.uses.length > 0
            ? "Used from stock by the recipe. Change any amount, or use ✎ to change the recipe."
            : "No recipe — nothing is deducted. Add the materials it's made of."}
        </p>
        <datalist id={listId}>
          {codes.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Table className="table-fixed">
          <colgroup>
            <col className="w-[25%]" />
            <col className="w-[9%]" />
            <col className="w-[17%]" />
            <col className="w-[12%]" />
            <col className="w-[14%]" />
            <col className="w-[15%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead>
            <tr>
              <Th>Material</Th>
              <Th align="right">Recipe %</Th>
              <Th className="whitespace-normal!">
                Required for {g.made.qty.trim() || "0"} {unitWord(pool.baseUnit)}
              </Th>
              <Th align="right">Current stock</Th>
              <Th align="right">Remaining after</Th>
              <Th>Status</Th>
              <Th className="text-center!">Action</Th>
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
                  <Tr className={clsx(isEditing && "bg-accent-50")}>
                    <Td>
                      {isEditing ? (
                        <Input
                          aria-label="Material code"
                          value={draft.code}
                          onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
                          onKeyDown={keys}
                          list={listId}
                          placeholder="Code, e.g. w150"
                          className="font-mono"
                          autoFocus
                        />
                      ) : (
                        <>
                          <p className="font-mono text-label font-semibold text-ink">{u.ingredient?.code || "—"}</p>
                          {u.alternates.length > 0 ? (
                            <Select
                              aria-label={`Material used for ${u.ingredient?.code}`}
                              value={u.useCode ?? ""}
                              onChange={(e) => replaceUse(u.key, changeUse(pool, madeMilli, u, { useCode: e.target.value || null }, items, g.alternates))}
                              className="mt-1 [&_select]:text-label"
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
                            <p className="truncate text-caption text-ink-muted">{u.item.name}</p>
                          ) : null}
                        </>
                      )}
                      {isEditing && editError ? <p className="mt-1 text-caption text-danger">{editError}</p> : null}
                      {problem ? <p className="mt-1 text-caption text-danger">{problem}</p> : null}
                    </Td>
                    <Td num muted>
                      {isEditing ? (
                        <div className="relative">
                          <Input
                            aria-label="Recipe percent"
                            value={draft.percent}
                            onChange={(e) => setDraft((d) => ({ ...d, percent: e.target.value }))}
                            onKeyDown={keys}
                            inputMode="decimal"
                            placeholder="%"
                            className="num [&_input]:pr-6"
                          />
                          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-caption text-ink-subtle">%</span>
                        </div>
                      ) : ing?.code ? (
                        pctText(ing.percentBp)
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
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
                    </Td>
                    <Td num muted>
                      {u.item ? formatQuantity(u.item.onHandMilli, u.item.baseUnit) : "—"}
                    </Td>
                    <Td num>
                      <RemainingAfter item={u.item} after={after} />
                    </Td>
                    <Td>
                      <StatusTag status={status} title={u.parts ? "Not taken from stock — its recipe's materials are, below." : s.help} />
                    </Td>
                    <Td>
                      <div className="flex justify-center gap-1">
                        {isEditing ? (
                          <>
                            <IconButton size="sm" variant="secondary" label="Save this line" onClick={() => saveEdit(u)}>
                              <Check />
                            </IconButton>
                            <IconButton size="sm" label="Cancel" onClick={() => cancelEdit(u)}>
                              <X />
                            </IconButton>
                          </>
                        ) : canChange ? (
                          <IconButton size="sm" label="Change this recipe line (material and %)" onClick={() => startEdit(u)} disabled={editing !== null}>
                            <Pencil />
                          </IconButton>
                        ) : (
                          <IconButton size="sm" label="Change the amount" onClick={() => focusAmount(u.key)}>
                            <Pencil />
                          </IconButton>
                        )}
                      </div>
                    </Td>
                  </Tr>
                  {u.parts ? (
                    <PartRows parts={u.parts} depth={1} via={u.ingredient?.code ?? ""} materials={materials} afterOf={afterOf} problemFor={problemFor} setUse={setUse} />
                  ) : null}
                </Fragment>
              );
            })}
            <tr>
              <td colSpan={7} className="py-2">
                <div className="flex min-h-7 flex-wrap items-center gap-3">
                  {canChange ? (
                    <Button variant="ghost" size="sm" className="-ml-2.5" icon={<Plus />} onClick={addUse} disabled={editing !== null}>
                      Add material
                    </Button>
                  ) : null}
                  <span className="flex-1" />
                  <span
                    className={clsx("num text-label font-medium", changed && total !== 10_000 ? "text-danger" : "text-ink-muted")}
                    title="A changed recipe's percents must add up to exactly 100%."
                  >
                    Recipe total {total / 100}%{changed && total !== 10_000 ? " — must be 100%" : ""}
                  </span>
                </div>
                {problemFor(recipeProblemKey(g.key)) ? (
                  <p className="mt-1 text-caption text-danger">{problemFor(recipeProblemKey(g.key))}</p>
                ) : null}
              </td>
            </tr>
          </tbody>
        </Table>
      </div>

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
    </Section>
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
            <Tr className="text-label">
              <Td style={{ paddingLeft: depth * 20 }}>
                <p className="flex items-baseline gap-1.5">
                  <span className="text-ink-faint" aria-hidden>
                    ↳
                  </span>
                  <span className="font-mono font-semibold text-ink">{code}</span>
                  <span className="truncate text-caption text-ink-subtle">via {via}</span>
                </p>
                {pickable ? (
                  <div className="mt-1">
                    <ItemPicker items={materials} value={u.item} onChange={(item) => setUse(u.key, { item })} />
                  </div>
                ) : u.item && u.item.name.toLowerCase() !== code ? (
                  <p className="truncate pl-4 text-caption text-ink-muted">{u.item.name}</p>
                ) : null}
                {problem ? <p className="mt-1 text-caption text-danger">{problem}</p> : null}
              </Td>
              <Td num muted>
                {pctText(u.ingredient?.percentBp)}
              </Td>
              <Td>
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
              </Td>
              <Td num muted>
                {u.item ? formatQuantity(u.item.onHandMilli, u.item.baseUnit) : "—"}
              </Td>
              <Td num>
                <RemainingAfter item={u.item} after={after} />
              </Td>
              <Td>
                <StatusTag status={status} title={s.help} />
              </Td>
              <Td />
            </Tr>
            {u.parts ? (
              <PartRows parts={u.parts} depth={depth + 1} via={`${via} → ${code}`} materials={materials} afterOf={afterOf} problemFor={problemFor} setUse={setUse} />
            ) : null}
          </Fragment>
        );
      })}
    </>
  );
}

/** What's left of a material after this entry — red only when it goes below zero. */
function RemainingAfter({ item, after }: { item: StockItem | null; after: number | null }) {
  if (!item || after === null) return <span className="text-ink-faint">—</span>;
  return <span className={clsx("font-semibold", after < 0 && "text-danger")}>{formatQuantity(after, item.baseUnit)}</span>;
}

/** A material line's status: plain words when all is well, a badge for anything that needs a look. */
function StatusTag({ status, title }: { status: { tag: string; tone: Tone }; title: string }) {
  if (status.tone === "ok") {
    return (
      <span title={title} className="text-label text-ink-muted">
        {status.tag}
      </span>
    );
  }
  return (
    <Badge tone={TONE[status.tone]} title={title} className="h-auto! min-h-[22px] py-0.5 whitespace-normal!">
      {status.tag}
    </Badge>
  );
}

/** A quantity box with its unit in a separate box on the right. */
function QtyInput({
  id,
  line,
  unit,
  onChange,
  label = "Quantity",
  placeholder = "0",
  showUnit = true,
  big = false,
}: {
  id?: string;
  line: ReviewLine;
  unit: StockItem["baseUnit"];
  onChange: (line: ReviewLine) => void;
  label?: string;
  placeholder?: string;
  showUnit?: boolean;
  /** The bolder figure used for the amount made. */
  big?: boolean;
}) {
  return (
    <div className="flex">
      <Input
        id={id}
        aria-label={label}
        value={line.qty}
        onChange={(e) => onChange({ ...line, qty: e.target.value })}
        inputMode="decimal"
        placeholder={placeholder}
        className={clsx("num min-w-0 flex-1", showUnit && "[&_input]:rounded-r-none", big && "[&_input]:font-semibold")}
      />
      {showUnit ? (
        <span className="inline-flex h-8 min-w-10 items-center justify-center rounded-r-control border border-l-0 border-line-strong bg-surface-alt px-2.5 text-label text-ink-muted">
          {unitWord(unit)}
        </span>
      ) : null}
    </div>
  );
}
