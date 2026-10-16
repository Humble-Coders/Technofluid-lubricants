import {
  fromMilli,
  parseQuantityToMilli,
  parseRecipe,
  proposeConsumption,
  type ConsumptionStatus,
  type RecipeIngredient,
} from "@technofluid/core";
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
  ingredient: RecipeIngredient | null;
  status: ConsumptionStatus | "added";
  /** Edited by the person — don't recompute it when the amount made changes. */
  touched: boolean;
}

export type ReviewGroup =
  | { key: string; type: "production"; made: ReviewLine; uses: UseLine[]; hasRecipe: boolean }
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

/** Raw-material lines for `madeMilli` of `pool`, keeping lines the person already changed. */
export function proposeUses(
  pool: StockItem,
  madeMilli: number | null,
  ingredients: RecipeIngredient[],
  items: StockItem[],
  previous: UseLine[] = [],
  keyPrefix = "",
): UseLine[] {
  const find = materialFinder(items);
  const proposals =
    madeMilli === null
      ? ingredients.map((ingredient) => ({ ingredient, material: find(ingredient.code), qtyMilli: null, status: "ok" as const }))
      : proposeConsumption({
          madeMilli,
          productUnit: pool.baseUnit,
          productDensityKgPerL: pool.densityKgPerL,
          ingredients,
          findMaterial: (code) => find(code),
        });
  const fromRecipe = proposals.map((p, i): UseLine => {
    const key = `${keyPrefix}use-${i}`;
    const kept = previous.find((u) => u.key === key && u.touched);
    if (kept) return kept;
    return {
      key,
      ingredient: p.ingredient,
      item: (p.material as StockItem | null) ?? null,
      qty: text(p.qtyMilli),
      note: "",
      status: p.status,
      touched: false,
    };
  });
  const added = previous.filter((u) => u.status === "added");
  return [...fromRecipe, ...added];
}

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
        uses: proposeUses(d.item, d.qtyMilli, ingredients, items, [], `${key}-`),
        hasRecipe: ingredients.length > 0,
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
        const recipeNote = u.ingredient?.percentBp != null ? ` (recipe ${u.ingredient.percentBp / 100}%)` : "";
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
