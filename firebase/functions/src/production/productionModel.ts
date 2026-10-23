import {bad} from "../stock/stockModel";
import {parseRecipeInput} from "../recipes/recipeModel";

/**
 * Production that comes with a recipe change (Sharnya, 22 Oct 2026).
 *
 * When Stock & Production edits a recipe while reviewing a production run, the whole
 * entry (what was made, what it used, the new recipe) waits in
 * productionRequests/{id} for an Admin. Nothing changes in stock until it's
 * approved; approving applies the recipe and saves the stock in one step, rejecting
 * saves nothing. An Admin's own entry is applied at once (still kept as a record).
 * Only Cloud Functions write this collection; Admin and Stock & Production read it.
 */

export const PRODUCTION_REQUESTS = "productionRequests";

export interface RecipeChange {
  productKey: string;
  /** "code/percent" strings; percents total 100%. */
  recipe: string[];
}

export function parseRecipeChanges(value: unknown): RecipeChange[] {
  if (!Array.isArray(value) || value.length === 0) bad("Which recipe changed?");
  if (value.length > 10) bad("At most 10 recipe changes at once.");
  const seen = new Set<string>();
  return value.map((raw, i) => {
    if (typeof raw !== "object" || raw === null) bad(`Recipe change ${i + 1} is empty.`);
    const productKey = typeof raw.productKey === "string" ? raw.productKey.trim() : "";
    if (!productKey) bad(`Recipe change ${i + 1}: productKey is required.`);
    if (seen.has(productKey)) bad("Each product's recipe can change only once per entry.");
    seen.add(productKey);
    return {productKey, recipe: parseRecipeInput(raw.recipe)};
  });
}
