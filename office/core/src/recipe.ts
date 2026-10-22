/**
 * Recipes: what a product is made of, and how much of each ingredient one production
 * run uses. Pure maths — no Firebase, no UI.
 *
 * Gaurav's sheet writes each ingredient as "code/percent", e.g. "w150/50". An ingredient
 * with no percent ("w70/") isn't confirmed yet (it looks like an alternative), so it is
 * never deducted automatically — the person says how much was used.
 *
 * Basis (Sharnya, 16 Oct 2026, unconfirmed by Gaurav): percentages are BY VOLUME. The
 * amount made is turned into litres, the percentage applied, and the result converted to
 * kg with the ingredient's density when that ingredient is counted in kg.
 *
 * One level only for now: an ingredient that is itself a mix (r5, g90, w150vi10kg…) is
 * deducted as that mix. Breaking mixes down needs Gaurav's Sheet2/Sheet3 (step 2 import).
 */
import { assertMilli, kgToLitresMilli, litresToKgMilli, type BaseUnit, type Milli } from "./units";

export interface RecipeIngredient {
  /** As written in the recipe, lower-cased and trimmed: "w150", "ep additive", "sn500(kg)". */
  code: string;
  /** Percent in basis points (50% → 5000), or null when the recipe gives no percent. */
  percentBp: number | null;
}

/** "w150/50" → { code: "w150", percentBp: 5000 }; "w70/" → { code: "w70", percentBp: null }. */
export function parseRecipe(entries: readonly string[]): RecipeIngredient[] {
  const out: RecipeIngredient[] = [];
  for (const raw of entries) {
    const slash = raw.lastIndexOf("/");
    const code = (slash >= 0 ? raw.slice(0, slash) : raw).trim().toLowerCase().replace(/\s+/g, " ");
    if (!code) continue;
    const pctText = slash >= 0 ? raw.slice(slash + 1).trim() : "";
    out.push({ code, percentBp: pctText ? percentToBp(pctText) : null });
  }
  return out;
}

/** "50" → 5000, "12.5" → 1250, "0.25" → 25. Exact (read from the text), at most 2 decimals. */
function percentToBp(text: string): number | null {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return bp >= 0 && bp <= 10_000 ? bp : null;
}

export interface StockMaterial {
  id: string;
  name: string;
  baseUnit: BaseUnit;
  densityKgPerL: number | null;
}

export type ConsumptionStatus =
  /** Worked out from the recipe. */
  | "ok"
  /** No percent in the recipe — the person says how much was used (or skips it). */
  | "no_percent"
  /** No stock item matches the ingredient's name or code. */
  | "not_in_stock"
  /** Needs a density that isn't known (to go between litres and kg). */
  | "needs_density"
  /** Can't be worked out from a percentage (e.g. counted in pieces). */
  | "unit_mismatch";

export interface ProposedConsumption {
  ingredient: RecipeIngredient;
  material: StockMaterial | null;
  /** In the material's base unit, or null when it couldn't be worked out. */
  qtyMilli: Milli | null;
  status: ConsumptionStatus;
}

export interface ProductionRun {
  /** How much was made, in the product's base unit (milli). */
  madeMilli: Milli;
  productUnit: BaseUnit;
  productDensityKgPerL: number | null;
  ingredients: readonly RecipeIngredient[];
  /** Finds the stock item for an ingredient code (by recipe code, other name or name). */
  findMaterial: (code: string) => StockMaterial | null;
}

/**
 * Proposed raw-material use for one production run. Every line comes back — including the
 * ones that couldn't be worked out — so the review can show and ask about each.
 */
export function proposeConsumption(run: ProductionRun): ProposedConsumption[] {
  assertMilli(run.madeMilli, "made");
  // The run in litres (volume basis), when it can be known.
  let madeLitresMilli: Milli | null = null;
  if (run.productUnit === "L") madeLitresMilli = run.madeMilli;
  else if (run.productUnit === "kg" && run.productDensityKgPerL) {
    madeLitresMilli = kgToLitresMilli(run.madeMilli, run.productDensityKgPerL);
  }

  return run.ingredients.map((ingredient) => {
    const material = run.findMaterial(ingredient.code);
    if (ingredient.percentBp === null) return { ingredient, material, qtyMilli: null, status: "no_percent" };
    if (!material) return { ingredient, material: null, qtyMilli: null, status: "not_in_stock" };
    if (material.baseUnit === "piece" || run.productUnit === "piece") {
      return { ingredient, material, qtyMilli: null, status: "unit_mismatch" };
    }
    if (madeLitresMilli === null) return { ingredient, material, qtyMilli: null, status: "needs_density" };

    const litres = Math.round((madeLitresMilli * ingredient.percentBp) / 10_000);
    if (material.baseUnit === "L") return { ingredient, material, qtyMilli: litres, status: "ok" };
    if (!material.densityKgPerL) return { ingredient, material, qtyMilli: null, status: "needs_density" };
    return { ingredient, material, qtyMilli: litresToKgMilli(litres, material.densityKgPerL), status: "ok" };
  });
}

export interface RecipeAlternate {
  /** The recipe line's own code ("w150"). */
  main: string;
  /** A material that can be used instead, with its own percent. */
  ingredient: RecipeIngredient;
}

/**
 * Alternate materials set by an Admin (Sharnya, 22 Oct 2026), stored as
 * "main>code/percent": "w150>w150n/46" → w150n at 46% can replace w150.
 */
export function parseAlternates(entries: readonly string[]): RecipeAlternate[] {
  const out: RecipeAlternate[] = [];
  for (const raw of entries) {
    const gt = raw.indexOf(">");
    if (gt <= 0) continue;
    const main = raw.slice(0, gt).trim().toLowerCase().replace(/\s+/g, " ");
    const [ingredient] = parseRecipe([raw.slice(gt + 1)]);
    if (main && ingredient) out.push({ main, ingredient });
  }
  return out;
}

/** Sum of the recipe's percentages (basis points) — 10 000 when it adds up to 100%. */
export function recipeTotalBp(ingredients: readonly RecipeIngredient[]): number {
  return ingredients.reduce((sum, i) => sum + (i.percentBp ?? 0), 0);
}
