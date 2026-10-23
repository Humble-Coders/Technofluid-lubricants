import {
  fromMilli,
  parseAlternates,
  parseQuantityToMilli,
  parseRecipe,
  proposeConsumption,
  recipeTotalBp,
  type ConsumptionStatus,
  type RecipeAlternate,
  type RecipeIngredient,
} from "@technofluid/core";
import type { RecipeChangeInput } from "@/services/productionService";
import type { Product } from "@/services/productService";
import type { JournalLine, StockItem } from "@/services/stockService";

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
  status: ConsumptionStatus | "added" | "no_unit";
  /** Amount typed by the person — don't recompute it when the amount made changes. */
  touched: boolean;
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

/** Finds the stock item an ingredient code means: recipe code, other name, or name. */
export function materialFinder(items: StockItem[]) {
  const candidates = items.filter((i) => i.kind !== "product_pool");
  return (code: string): StockItem | null => {
    const c = code.toLowerCase();
    return (
      candidates.find((i) => i.code === c) ??
      candidates.find((i) => i.aliases.some((a) => a.toLowerCase() === c)) ??
      candidates.find((i) => i.name.toLowerCase() === c) ??
      null
    );
  };
}

/** The recipe of a product stock pool (every pack of a pool shares one recipe). */
export function recipeFor(pool: StockItem, products: Product[]): RecipeIngredient[] {
  const product = products.find((p) => p.productKey === pool.productKey && p.recipe.length > 0);
  return product ? parseRecipe(product.recipe) : [];
}

/** Admin-set alternates of a product stock pool's recipe lines. */
export function alternatesFor(pool: StockItem, products: Product[]): RecipeAlternate[] {
  const product = products.find((p) => p.productKey === pool.productKey && p.recipe.length > 0);
  return product ? parseAlternates(product.recipeAlternates ?? []) : [];
}

/** What one recipe line (or alternate) needs for `madeMilli` of `pool`. */
function workOut(pool: StockItem, madeMilli: number | null, ingredient: RecipeIngredient, items: StockItem[]) {
  const find = materialFinder(items);
  const found = find(ingredient.code);
  if (found && !found.unitSet) return { item: found, qty: "", status: "no_unit" as const };
  if (madeMilli === null) return { item: found, qty: "", status: "ok" as const };
  const [p] = proposeConsumption({
    madeMilli,
    productUnit: pool.baseUnit,
    productDensityKgPerL: pool.densityKgPerL,
    ingredients: [ingredient],
    findMaterial: (code) => find(code),
  });
  return { item: (p!.material as StockItem | null) ?? null, qty: text(p!.qtyMilli), status: p!.status };
}

/** The recipe line or the alternate being used for it. */
export function effectiveIngredient(u: UseLine): RecipeIngredient | null {
  return (u.useCode ? u.alternates.find((a) => a.code === u.useCode) : null) ?? u.ingredient;
}

/** Raw-material lines for `madeMilli` of `pool` (fresh — nothing typed yet). */
export function proposeUses(
  pool: StockItem,
  madeMilli: number | null,
  ingredients: RecipeIngredient[],
  items: StockItem[],
  keyPrefix = "",
  alternates: RecipeAlternate[] = [],
): UseLine[] {
  return ingredients.map((ingredient, i): UseLine => ({
    key: `${keyPrefix}use-${i}`,
    ingredient,
    alternates: alternates.filter((a) => a.main === ingredient.code).map((a) => a.ingredient),
    useCode: null,
    note: "",
    touched: false,
    ...workOut(pool, madeMilli, ingredient, items),
  }));
}

/** Re-works the lines whose amount the person hasn't typed (e.g. the amount made changed). */
export function reworkUses(pool: StockItem, madeMilli: number | null, uses: UseLine[], items: StockItem[]): UseLine[] {
  return uses.map((u) => {
    const ing = effectiveIngredient(u);
    if (u.touched || !ing?.code) return u;
    return { ...u, ...workOut(pool, madeMilli, ing, items) };
  });
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
  if (!ing?.code) return { ...next, item: null, qty: "", status: "added", touched: false };
  return { ...next, ...workOut(pool, madeMilli, ing, items), touched: false };
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

/** The products whose recipe was changed in this review, ready to send. */
export function recipeChangesOf(groups: ReviewGroup[]): RecipeChangeInput[] {
  return groups.flatMap((g) =>
    g.type === "production" && recipeChanged(g) && g.made.item?.productKey
      ? [
          {
            productKey: g.made.item.productKey,
            recipe: recipeOf(g).map((i) => ({ code: i.code, percent: i.percentBp === null ? null : i.percentBp / 100 })),
          },
        ]
      : [],
  );
}

/** Problem key for a production run's recipe as a whole (e.g. the total isn't 100%). */
export const recipeProblemKey = (groupKey: string) => `${groupKey}-recipe`;

/** Turns the journal's lines into the review: production runs with their proposed uses. */
export function buildReview(drafts: DraftLine[], items: StockItem[], products: Product[]): ReviewGroup[] {
  return drafts.map((d, i): ReviewGroup => {
    const key = `g${i}`;
    if (d.item.kind === "product_pool" && d.kind === "IN") {
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
      for (const u of g.uses) {
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
          note: u.note.trim() || `Used to make ${g.made.qty.trim()} ${unitLabel(g.made.item!)} ${madeName}${recipeNote}`,
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
