import {
  explodeRecipe,
  fromMilli,
  parseAlternates,
  parseQuantityToMilli,
  parseRecipe,
  recipeTotalBp,
  type ExplodedLine,
  type ExplodeStatus,
  type RecipeAlternate,
  type RecipeIngredient,
} from "@technofluid/core";
import type { RecipeChangeInput } from "@/services/productionService";
import type { Product } from "@/services/productService";
import { isMix, type JournalLine, type StockItem } from "@/services/stockService";

/**
 * The review step of the Daily journal: every line as it will be saved, with the raw
 * materials each production run uses proposed from the recipe. Nothing here touches the
 * database — the person edits, then confirms.
 *
 * Decisions (Sharnya, 16 Oct 2026): every product "In" in the journal is production;
 * one recipe level (mixes like r5 are deducted as themselves); recipe % by volume;
 * ingredients with no % are asked about, never deducted on their own.
 *
 * Recipe edits in the review (Sharnya, 22 Oct 2026): the pencil changes a line's
 * material and %, "Add material" adds a line. A changed recipe must total exactly 100%,
 * and the entry then goes to an Admin for approval with it. Admin-set alternates can be
 * used instead of a line; their own % decides how much is needed.
 *
 * Multi-level (Sharnya, 23 Oct 2026): a premix/blend that is mixed on the spot is
 * broken down into its own recipe ("via r5"), so only what is really taken from stock
 * is deducted; one kept in stock is deducted as itself. Premixes and blends are made
 * in the journal like products. Only the top level's recipe is edited in the review —
 * a premix/blend's own recipe is changed from its panel.
 */

export type DraftKind = "IN" | "OUT" | "COUNT" | "OPENING";

export interface DraftLine {
  item: StockItem;
  kind: DraftKind;
  qtyMilli: number;
  note: string;
}

/** One editable line in the review. Quantities are kept as typed text until confirm. */
export interface ReviewLine {
  key: string;
  item: StockItem | null;
  qty: string;
  note: string;
}

export interface UseLine extends ReviewLine {
  /** The recipe line — as loaded, or as changed in the review. */
  ingredient: RecipeIngredient | null;
  /** Admin-set materials that can replace this line, each with its own %. */
  alternates: RecipeIngredient[];
  /** The alternate in use instead of the recipe line, or null for the line itself. */
  useCode: string | null;
  status: ExplodeStatus | "added" | "no_unit";
  /** Amount typed by the person — don't recompute it when the amount made changes. */
  touched: boolean;
  /** A premix/blend mixed on the spot: its own recipe lines, deducted instead of it. */
  parts: UseLine[] | null;
}

export type ReviewGroup =
  | {
      key: string;
      type: "production";
      made: ReviewLine;
      uses: UseLine[];
      hasRecipe: boolean;
      /** The recipe as it was when the review opened — to tell whether it was changed. */
      originalRecipe: RecipeIngredient[];
      alternates: RecipeAlternate[];
    }
  | { key: string; type: "plain"; kind: DraftKind; line: ReviewLine };

const text = (milli: number | null) => (milli === null ? "" : String(fromMilli(milli)));

/** Ignoring case and spaces: "EP Additive" = "ep additive" = "epadditive". */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** Finds the stock item an ingredient code means: recipe code, other name, or name. */
export function materialFinder(items: StockItem[]) {
  const candidates = items.filter((i) => i.kind !== "product_pool");
  return (code: string): StockItem | null => {
    const c = norm(code);
    return (
      candidates.find((i) => i.code !== null && norm(i.code) === c) ??
      candidates.find((i) => i.aliases.some((a) => norm(a) === c)) ??
      candidates.find((i) => norm(i.name) === c) ??
      null
    );
  };
}

/** Whether a material is followed into its own recipe (a premix/blend mixed on the spot). */
const breakDownOf = (m: StockItem): RecipeIngredient[] | null =>
  isMix(m.kind) && m.stockMode !== "stocked" && m.unitSet && m.recipe.length > 0 ? parseRecipe(m.recipe) : null;

/** The recipe of what is made: a product stock pool (shared by its packs) or a premix/blend. */
export function recipeFor(made: StockItem, products: Product[]): RecipeIngredient[] {
  if (isMix(made.kind)) return parseRecipe(made.recipe);
  const product = products.find((p) => p.productKey === made.productKey && p.recipe.length > 0);
  return product ? parseRecipe(product.recipe) : [];
}

/** Admin-set alternates of what is made's recipe lines. */
export function alternatesFor(made: StockItem, products: Product[]): RecipeAlternate[] {
  if (isMix(made.kind)) return parseAlternates(made.recipeAlternates);
  const product = products.find((p) => p.productKey === made.productKey && p.recipe.length > 0);
  return product ? parseAlternates(product.recipeAlternates ?? []) : [];
}

/** Turns the engine's tree into review lines (keys stable so typed amounts survive). */
function toUse(line: ExplodedLine<StockItem>, key: string, previous: UseLine | undefined): Omit<UseLine, "ingredient" | "alternates" | "useCode"> {
  const item = line.material;
  if (item && !item.unitSet) return { key, item, qty: "", note: "", status: "no_unit", touched: false, parts: null };
  const parts = line.parts
    ? line.parts.map((p, i) => {
        const k = `${key}-p${i}`;
        const kept = previous?.parts?.find((x) => x.key === k && x.touched);
        return kept ?? { ingredient: p.ingredient, alternates: [], useCode: null, ...toUse(p, k, undefined) };
      })
    : null;
  return { key, item, qty: parts ? text(line.qtyMilli) : text(line.qtyMilli), note: "", status: line.status, touched: false, parts };
}

/** Works out lines for `madeMilli` of `made` — all together, so each level adds up to what was made. */
function workOutAll(made: StockItem, madeMilli: number | null, ingredients: RecipeIngredient[], items: StockItem[]) {
  return explodeRecipe<StockItem>({
    madeMilli,
    unit: made.baseUnit,
    densityKgPerL: made.densityKgPerL,
    ingredients,
    findMaterial: materialFinder(items),
    breakDown: breakDownOf,
    path: [made.id],
  });
}

/** The recipe line or the alternate being used for it. */
export function effectiveIngredient(u: UseLine): RecipeIngredient | null {
  return (u.useCode ? u.alternates.find((a) => a.code === u.useCode) : null) ?? u.ingredient;
}

/** Material lines for `madeMilli` of `made` (fresh — nothing typed yet). */
export function proposeUses(
  made: StockItem,
  madeMilli: number | null,
  ingredients: RecipeIngredient[],
  items: StockItem[],
  keyPrefix = "",
  alternates: RecipeAlternate[] = [],
): UseLine[] {
  const worked = workOutAll(made, madeMilli, ingredients, items);
  return ingredients.map((ingredient, i): UseLine => ({
    ingredient,
    alternates: alternates.filter((a) => a.main === ingredient.code).map((a) => a.ingredient),
    useCode: null,
    ...toUse(worked[i]!, `${keyPrefix}use-${i}`, undefined),
  }));
}

/** Re-works the lines whose amount the person hasn't typed (e.g. the amount made changed). */
export function reworkUses(made: StockItem, madeMilli: number | null, uses: UseLine[], items: StockItem[]): UseLine[] {
  const live = uses.filter((u) => effectiveIngredient(u)?.code);
  const worked = workOutAll(made, madeMilli, live.map((u) => effectiveIngredient(u)!), items);
  return uses.map((u) => {
    const i = live.indexOf(u);
    if (i < 0 || u.touched) return u;
    const next = toUse(worked[i]!, u.key, u);
    return { ...u, ...next };
  });
}

/** Sets one line anywhere in the tree (by key). */
export function updateUse(uses: UseLine[], key: string, fn: (u: UseLine) => UseLine): UseLine[] {
  return uses.map((u) => (u.key === key ? fn(u) : u.parts ? { ...u, parts: updateUse(u.parts, key, fn) } : u));
}

/** Every line that is actually taken from stock (broken-down lines replaced by their parts). */
export function leafLines(uses: UseLine[], via: string[] = []): { use: UseLine; via: string[] }[] {
  return uses.flatMap((u) => (u.parts ? leafLines(u.parts, [...via, u.ingredient?.code ?? "?"]) : [{ use: u, via }]));
}

/** One line with its recipe material / % changed, or a different alternate chosen. */
export function changeUse(
  pool: StockItem,
  madeMilli: number | null,
  u: UseLine,
  change: { ingredient: RecipeIngredient } | { useCode: string | null },
  items: StockItem[],
  alternates: RecipeAlternate[],
): UseLine {
  const next: UseLine =
    "ingredient" in change
      ? {
          ...u,
          ingredient: change.ingredient,
          alternates: alternates.filter((a) => a.main === change.ingredient.code).map((a) => a.ingredient),
          useCode: null,
        }
      : { ...u, useCode: change.useCode };
  const ing = effectiveIngredient(next);
  if (!ing?.code) return { ...next, item: null, qty: "", status: "added", touched: false, parts: null };
  return { ...next, ...toUse(workOutAll(pool, madeMilli, [ing], items)[0]!, u.key, undefined) };
}

/** A new, empty recipe line (filled in with the pencil). */
export function newUse(groupKey: string): UseLine {
  return {
    key: `${groupKey}-added-${Date.now()}`,
    item: null,
    qty: "",
    note: "",
    ingredient: { code: "", percentBp: null },
    alternates: [],
    useCode: null,
    status: "added",
    touched: false,
    parts: null,
  };
}

/** The recipe as it stands in the review (lines without a material code left out). */
export function recipeOf(g: Extract<ReviewGroup, { type: "production" }>): RecipeIngredient[] {
  return g.uses.flatMap((u) => (u.ingredient?.code ? [u.ingredient] : []));
}

const recipeKey = (list: RecipeIngredient[]) =>
  list
    .map((i) => `${i.code}/${i.percentBp ?? ""}`)
    .sort()
    .join("|");

export function recipeChanged(g: ReviewGroup): boolean {
  return g.type === "production" && recipeKey(recipeOf(g)) !== recipeKey(g.originalRecipe);
}

/** The recipes changed in this review (products, premixes, blends), ready to send. */
export function recipeChangesOf(groups: ReviewGroup[]): RecipeChangeInput[] {
  return groups.flatMap((g): RecipeChangeInput[] => {
    if (g.type !== "production" || !recipeChanged(g) || !g.made.item) return [];
    const recipe = recipeOf(g).map((i) => ({ code: i.code, percent: i.percentBp === null ? null : i.percentBp / 100 }));
    if (isMix(g.made.item.kind)) return [{ itemId: g.made.item.id, recipe }];
    return g.made.item.productKey ? [{ productKey: g.made.item.productKey, recipe }] : [];
  });
}

/** Can this be made in the factory (a journal "In" that uses a recipe)? */
export const isMade = (item: StockItem) => item.kind === "product_pool" || isMix(item.kind);

/** Problem key for a production run's recipe as a whole (e.g. the total isn't 100%). */
export const recipeProblemKey = (groupKey: string) => `${groupKey}-recipe`;

/** Turns the journal's lines into the review: production runs with their proposed uses. */
export function buildReview(drafts: DraftLine[], items: StockItem[], products: Product[]): ReviewGroup[] {
  return drafts.map((d, i): ReviewGroup => {
    const key = `g${i}`;
    if (isMade(d.item) && d.kind === "IN") {
      const ingredients = recipeFor(d.item, products);
      return {
        key,
        type: "production",
        made: { key: `${key}-made`, item: d.item, qty: text(d.qtyMilli), note: d.note },
        uses: proposeUses(d.item, d.qtyMilli, ingredients, items, `${key}-`, alternatesFor(d.item, products)),
        hasRecipe: ingredients.length > 0,
        originalRecipe: ingredients,
        alternates: alternatesFor(d.item, products),
      };
    }
    return { key, type: "plain", kind: d.kind, line: { key: `${key}-line`, item: d.item, qty: text(d.qtyMilli), note: d.note } };
  });
}

export interface ReviewProblem {
  key: string;
  message: string;
}

/**
 * Checks the review and builds what will be saved. Use lines left empty are skipped
 * (that's how the person says "not used"); a filled one needs an item.
 */
export function readReview(groups: ReviewGroup[]): { lines: JournalLine[]; problems: ReviewProblem[] } {
  const lines: JournalLine[] = [];
  const problems: ReviewProblem[] = [];
  const qtyOf = (l: ReviewLine, allowZero: boolean): number | null => {
    const t = l.qty.trim();
    if (!t) return null;
    try {
      const milli = parseQuantityToMilli(t);
      if (milli === 0 && !allowZero) return null;
      return milli;
    } catch {
      problems.push({ key: l.key, message: "Enter a quantity like 26 or 17.5." });
      return null;
    }
  };

  for (const g of groups) {
    if (g.type === "production") {
      if (recipeChanged(g)) {
        const recipe = recipeOf(g);
        const total = recipeTotalBp(recipe);
        const codes = recipe.map((i) => i.code);
        const twice = codes.find((c, i) => codes.indexOf(c) !== i);
        if (twice) problems.push({ key: recipeProblemKey(g.key), message: `"${twice}" is in the recipe twice.` });
        else if (total !== 10_000) {
          problems.push({ key: recipeProblemKey(g.key), message: `The recipe adds up to ${total / 100}% — it must make exactly 100%.` });
        }
      }
      for (const u of g.uses) {
        if (!u.ingredient?.code && u.ingredient?.percentBp != null) problems.push({ key: u.key, message: "Enter the material code." });
      }
      const made = qtyOf(g.made, false);
      if (made === null) {
        if (!problems.some((p) => p.key === g.made.key)) problems.push({ key: g.made.key, message: "How much was made?" });
        continue;
      }
      const madeIndex = lines.length;
      const madeName = g.made.item!.name;
      lines.push({ itemId: g.made.item!.id, kind: "MADE", qtyMilli: made, ...(g.made.note.trim() ? { note: g.made.note.trim() } : {}) });
      for (const { use: u, via } of leafLines(g.uses)) {
        const qty = qtyOf(u, true);
        if (qty === null || qty === 0) continue;
        if (!u.item) {
          problems.push({ key: u.key, message: "Pick which stock item this is, or clear the quantity to skip it." });
          continue;
        }
        if (!u.item.unitSet) {
          problems.push({ key: u.key, message: `${u.item.name} has no unit yet — an Admin must set it, or clear the amount to skip it.` });
          continue;
        }
        const ing = effectiveIngredient(u);
        const recipeNote =
          u.useCode && u.ingredient
            ? ` (instead of ${u.ingredient.code}${ing?.percentBp != null ? `, ${ing.percentBp / 100}%` : ""})`
            : ing?.percentBp != null
              ? ` (recipe ${ing.percentBp / 100}%)`
              : "";
        lines.push({
          itemId: u.item.id,
          kind: "USED",
          qtyMilli: qty,
          forLine: madeIndex,
          note:
            u.note.trim() ||
            `Used to make ${g.made.qty.trim()} ${unitLabel(g.made.item!)} ${madeName}${via.length ? ` (via ${via.join(" → ")})` : ""}${recipeNote}`,
        });
      }
    } else {
      const allowZero = g.kind === "COUNT" || g.kind === "OPENING";
      const qty = qtyOf(g.line, allowZero);
      if (qty === null) {
        if (!problems.some((p) => p.key === g.line.key)) problems.push({ key: g.line.key, message: "Enter a quantity." });
        continue;
      }
      const item = g.line.item!;
      const note = g.line.note.trim();
      lines.push(
        g.kind === "COUNT"
          ? { itemId: item.id, kind: "COUNT", countedMilli: qty, note }
          : g.kind === "OPENING"
            ? { itemId: item.id, kind: "OPENING", qtyMilli: qty, ...(note ? { note } : {}) }
            : { itemId: item.id, kind: g.kind, qtyMilli: qty, note },
      );
    }
  }
  return { lines, problems };
}

function unitLabel(item: StockItem): string {
  return item.baseUnit === "piece" ? "pieces" : item.baseUnit;
}

export interface NetChange {
  item: StockItem;
  changeMilli: number;
  afterMilli: number;
  /** Counts set a value rather than add to it. */
  setTo: number | null;
}

/** What each item's stock will be once saved (counts set the value; others add). */
export function netChanges(lines: JournalLine[], items: StockItem[]): NetChange[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const result = new Map<string, NetChange>();
  for (const l of lines) {
    const item = byId.get(l.itemId);
    if (!item) continue;
    const current = result.get(l.itemId) ?? { item, changeMilli: 0, afterMilli: item.onHandMilli, setTo: null };
    let after = current.afterMilli;
    if (l.kind === "COUNT") after = l.countedMilli;
    else if (l.kind === "OUT" || l.kind === "USED") after -= l.qtyMilli;
    else after += l.qtyMilli;
    result.set(l.itemId, {
      item,
      afterMilli: after,
      changeMilli: after - item.onHandMilli,
      setTo: l.kind === "COUNT" ? l.countedMilli : current.setTo,
    });
  }
  return [...result.values()];
}
