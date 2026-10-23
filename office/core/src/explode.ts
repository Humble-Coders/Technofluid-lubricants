/**
 * Multi-level recipes (Sharnya, 23 Oct 2026): a product's recipe can name a BLEND (r5,
 * g90, va13.7…) or a PREMIX (w150vi10kg…), and those have recipes of their own — up to
 * raw materials → premix → blend → product. Pure maths — no Firebase, no UI.
 *
 *  - A premix/blend that is "mixed on the spot" (breakDown) is followed into its own
 *    recipe, so making a product deducts the raw materials it is really made of.
 *    One that is "kept in stock" is deducted as itself, like a raw material.
 *  - Basis: percentages are BY VOLUME (unconfirmed by Gaurav). A line whose code ends
 *    in "(kg)" — "sn500(kg)" in grease recipes — is BY WEIGHT instead.
 *  - Never guessed: a line with no % ("w70/"), a code no stock item has, a missing
 *    density, pieces, a loop (A → B → A) or a chain deeper than MAX_DEPTH all come back
 *    with no amount, for the person to fill in or skip.
 *  - Rounding: whole milli units; at each level the lines' amounts are split so they
 *    add up exactly to what was made (largest remainder), before any kg ↔ L change.
 */
import { kgToLitresMilli, litresToKgMilli, type BaseUnit, type Milli } from "./units";
import type { ConsumptionStatus, RecipeIngredient, StockMaterial } from "./recipe";

export const MAX_DEPTH = 6;

export type ExplodeStatus = ConsumptionStatus | "cycle" | "too_deep";

export interface ExplodedLine<M extends StockMaterial = StockMaterial> {
  ingredient: RecipeIngredient;
  material: M | null;
  /** In the material's own unit, or null when it can't be worked out. */
  qtyMilli: Milli | null;
  status: ExplodeStatus;
  /** The material's own recipe lines, when it is mixed on the spot and was broken down. */
  parts: ExplodedLine<M>[] | null;
}

export interface ExplodeRun<M extends StockMaterial> {
  /** How much is being made, in `unit` (milli). Null = unknown yet (amounts left empty). */
  madeMilli: Milli | null;
  unit: BaseUnit;
  densityKgPerL: number | null;
  ingredients: readonly RecipeIngredient[];
  /** Finds the stock item for a recipe code (by code, other name or name). */
  findMaterial: (code: string) => M | null;
  /** The recipe to follow for a material that is mixed on the spot; null = deduct it as itself. */
  breakDown: (material: M) => readonly RecipeIngredient[] | null;
  /** Ids of what is being made, outermost first — for loop detection. */
  path?: readonly string[];
}

/** "sn500(kg)" → by weight. */
export const isWeightLine = (code: string) => /\(kg\)\s*$/.test(code);

/** Splits `total` by basis points so the parts add up to round(total × Σbp / 10 000). */
function split(total: Milli, bps: number[]): Milli[] {
  const exact = bps.map((bp) => (total * bp) / 10_000);
  const parts = exact.map(Math.floor);
  let left = Math.round(exact.reduce((a, b) => a + b, 0)) - parts.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    parts[i]! += 1;
    left -= 1;
  }
  return parts;
}

/** The amount being made, in litres or kg (milli), when it can be known. */
function asBasis(made: Milli, unit: BaseUnit, density: number | null, basis: "L" | "kg"): Milli | null {
  if (unit === "piece") return null;
  if (unit === basis) return made;
  if (!density) return null;
  return basis === "kg" ? litresToKgMilli(made, density) : kgToLitresMilli(made, density);
}

/** One recipe, followed down through every premix/blend that is mixed on the spot. */
export function explodeRecipe<M extends StockMaterial>(run: ExplodeRun<M>): ExplodedLine<M>[] {
  const path = run.path ?? [];
  const lines = run.ingredients.map((ingredient) => ({ ingredient, material: run.findMaterial(ingredient.code) }));

  // Each line's share in its basis unit (L for volume, kg for "(kg)" lines), split per basis.
  const share = new Map<number, Milli | null>();
  for (const basis of ["L", "kg"] as const) {
    const idx = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.ingredient.percentBp !== null && (isWeightLine(l.ingredient.code) ? basis === "kg" : basis === "L"))
      .map(({ i }) => i);
    if (idx.length === 0) continue;
    const total = run.madeMilli === null ? null : asBasis(run.madeMilli, run.unit, run.densityKgPerL, basis);
    const parts = total === null ? idx.map(() => null) : split(total, idx.map((i) => lines[i]!.ingredient.percentBp!));
    idx.forEach((i, k) => share.set(i, parts[k] ?? null));
  }

  return lines.map(({ ingredient, material }, i): ExplodedLine<M> => {
    const none = (status: ExplodeStatus): ExplodedLine<M> => ({ ingredient, material, qtyMilli: null, status, parts: null });
    if (ingredient.percentBp === null) return none("no_percent");
    if (!material) return none("not_in_stock");
    if (material.baseUnit === "piece" || run.unit === "piece") return none("unit_mismatch");
    if (path.includes(material.id)) return none("cycle");

    // This line's amount, in the material's own unit.
    const basis: "L" | "kg" = isWeightLine(ingredient.code) ? "kg" : "L";
    const amount = share.get(i) ?? null;
    let qty: Milli | null = null;
    if (amount !== null) {
      if (material.baseUnit === basis) qty = amount;
      else if (material.densityKgPerL) {
        qty = basis === "L" ? litresToKgMilli(amount, material.densityKgPerL) : kgToLitresMilli(amount, material.densityKgPerL);
      } else {
        return none("needs_density");
      }
    } else if (run.madeMilli !== null) {
      return none("needs_density");
    }

    const recipe = run.breakDown(material);
    if (!recipe || recipe.length === 0) return { ingredient, material, qtyMilli: qty, status: "ok", parts: null };
    if (path.length + 1 >= MAX_DEPTH) return { ingredient, material, qtyMilli: qty, status: "too_deep", parts: null };
    const parts = explodeRecipe({
      ...run,
      madeMilli: qty,
      unit: material.baseUnit,
      densityKgPerL: material.densityKgPerL,
      ingredients: recipe,
      path: [...path, material.id],
    });
    return { ingredient, material, qtyMilli: qty, status: "ok", parts };
  });
}

export interface LeafUse<M extends StockMaterial = StockMaterial> {
  material: M;
  qtyMilli: Milli;
  /** Codes of the premixes/blends it was reached through, outermost first. */
  via: string[];
}

/** What is actually taken from stock: every line that wasn't broken down, with its route. */
export function leafUses<M extends StockMaterial>(lines: readonly ExplodedLine<M>[], via: string[] = []): LeafUse<M>[] {
  return lines.flatMap((l) =>
    l.parts
      ? leafUses(l.parts, [...via, l.ingredient.code])
      : l.material && l.qtyMilli !== null && l.status === "ok"
        ? [{ material: l.material, qtyMilli: l.qtyMilli, via }]
        : [],
  );
}

/** Lines anywhere in the tree that need the person (no %, not in stock, no density…). */
export function needsAttention<M extends StockMaterial>(lines: readonly ExplodedLine<M>[]): ExplodedLine<M>[] {
  return lines.flatMap((l) => (l.parts ? needsAttention(l.parts) : l.status === "ok" ? [] : [l]));
}
