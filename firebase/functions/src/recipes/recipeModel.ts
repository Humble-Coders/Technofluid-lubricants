import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

/**
 * Recipe changes with Admin approval (Sharnya, 17 Oct 2026).
 *
 *  - A recipe belongs to a product STOCK POOL (product + grade): every pack size
 *    of the pool is made the same way, so an approved change updates them all.
 *  - Stored on products/{sku}.recipe in Gaurav's own format, "code/percent"
 *    ("w150/50"; "w70/" = no percent — not confirmed what it means yet).
 *  - Requests live in recipeChangeRequests/{id}: pending → approved | rejected
 *    | superseded. Only Cloud Functions write them.
 *  - An Admin's own change is approved at once (still recorded as a request).
 *  - A changed recipe's percents must add up to exactly 100% (Sharnya, 22 Oct 2026);
 *    lines with no percent don't count towards it.
 *  - Alternate materials (Sharnya, 22 Oct 2026): for a recipe line, other materials that
 *    can be used instead, each with its own percent. Only an Admin sets them; stored on
 *    products/{sku}.recipeAlternates as "main>code/percent" ("w150>w150n/46").
 *  - A recipe can also belong to a PREMIX or BLEND stock item (Sharnya, 23 Oct 2026):
 *    stockItems/{id}.recipe / .recipeAlternates, changed through the same requests.
 *    A request names its target by `productKey` (a product) or `itemId` (a premix/blend).
 */

export const REQUESTS = "recipeChangeRequests";
export type Status = "pending" | "approved" | "rejected" | "superseded";

const CODE_RE = /^[a-z0-9][a-z0-9 .()\-]{0,39}$/;
const MAX_INGREDIENTS = 30;

export function bad(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

/** "12.50" → "12.5", 50 → "50" — how the sheet writes percents. */
function percentText(p: number): string {
  return String(Math.round(p * 100) / 100);
}

const codeText = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";

function checkCode(code: string, label: string): void {
  if (!CODE_RE.test(code)) {
    bad(`${label}: use the recipe code — letters, digits, spaces, dots, dashes or brackets (e.g. w150).`);
  }
}

/** A percent above 0 and at most 100 with at most 2 decimals, in basis points. */
function percentBp(p: unknown, label: string, optional: boolean): number | null {
  if ((p === null || p === undefined) && optional) return null;
  if (typeof p !== "number" || !Number.isFinite(p) || p <= 0 || p > 100) {
    bad(`${label}: the percent must be above 0 and at most 100${optional ? ", or left empty" : ""}.`);
  }
  if (Math.round(p * 100) !== p * 100) bad(`${label}: at most 2 decimals in the percent.`);
  return Math.round(p * 100);
}

/** Validates a proposed recipe (percents must total 100%) and returns "code/percent" strings. */
export function parseRecipeInput(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) bad("A recipe needs at least one ingredient.");
  if (value.length > MAX_INGREDIENTS) bad(`At most ${MAX_INGREDIENTS} ingredients.`);
  const seen = new Set<string>();
  let totalBp = 0;
  const recipe = value.map((raw, i) => {
    const label = `Ingredient ${i + 1}`;
    if (typeof raw !== "object" || raw === null) bad(`${label} is empty.`);
    const code = codeText(raw.code);
    checkCode(code, label);
    if (seen.has(code)) bad(`"${code}" is listed twice.`);
    seen.add(code);
    const bp = percentBp(raw.percent, `${label} (${code})`, true);
    if (bp === null) return `${code}/`;
    totalBp += bp;
    return `${code}/${percentText(bp / 100)}`;
  });
  if (totalBp !== 10_000) bad(`The percents add up to ${percentText(totalBp / 100)}% — they must make exactly 100%.`);
  return recipe;
}

/** "w150/50" → "w150". */
export const recipeCode = (line: string): string => codeText(line.slice(0, Math.max(0, line.lastIndexOf("/"))) || line);

/** Validates alternate materials for `recipe`; returns "main>code/percent" strings. */
export function parseAlternatesInput(value: unknown, recipe: readonly string[]): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) bad("Alternates must be a list.");
  if (value.length > MAX_INGREDIENTS * 2) bad(`At most ${MAX_INGREDIENTS * 2} alternates.`);
  const mains = new Set(recipe.map(recipeCode));
  const seen = new Set<string>();
  return value.map((raw, i) => {
    const label = `Alternate ${i + 1}`;
    if (typeof raw !== "object" || raw === null) bad(`${label} is empty.`);
    const main = codeText(raw.for);
    if (!mains.has(main)) bad(`${label}: "${main}" isn't in the recipe.`);
    const code = codeText(raw.code);
    checkCode(code, label);
    if (code === main) bad(`${label}: an alternate must be a different material from ${main}.`);
    if (seen.has(`${main}>${code}`)) bad(`${label}: ${code} is already an alternate for ${main}.`);
    seen.add(`${main}>${code}`);
    const bp = percentBp(raw.percent, `${label} (${code})`, false) as number;
    return `${main}>${code}/${percentText(bp / 100)}`;
  });
}

/** Alternates whose main material is still in `recipe`. */
export function keepAlternates(alternates: readonly string[], recipe: readonly string[]): string[] {
  const mains = new Set(recipe.map(recipeCode));
  return alternates.filter((a) => mains.has(codeText(a.slice(0, Math.max(0, a.indexOf(">"))))));
}

/** Two recipes are the same when they list the same ingredients with the same percents. */
export function sameRecipe(a: readonly string[], b: readonly string[]): boolean {
  const norm = (r: readonly string[]) => r.map((x) => x.trim().toLowerCase().replace(/\s+/g, " ")).sort().join("|");
  return norm(a) === norm(b);
}

export function reasonText(value: unknown, optional = false): string | null {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
    if (optional) return null;
    bad("Please say why the recipe should change.");
  }
  if (typeof value !== "string") bad("The reason must be text.");
  const t = value.replace(/\s+/g, " ").trim();
  if (t.length > 300) bad("Keep the reason under 300 characters.");
  return t;
}

/** What a recipe belongs to: a product (all its pack sizes) or a premix/blend stock item. */
export type RecipeTarget = {productKey: string} | {itemId: string};

/** Reads `productKey` or `itemId` (exactly one) from a request. */
export function parseTarget(data: unknown): RecipeTarget {
  const d = (data ?? {}) as Record<string, unknown>;
  const productKey = typeof d.productKey === "string" ? d.productKey.trim() : "";
  const itemId = typeof d.itemId === "string" ? d.itemId.trim() : "";
  if (productKey && itemId) bad("Send productKey or itemId, not both.");
  if (productKey) return {productKey};
  if (itemId) return {itemId};
  return bad("productKey (a product) or itemId (a premix or blend) is required.");
}

/** The request fields that name a target, for storing and querying. */
export const targetFields = (t: RecipeTarget) =>
  "productKey" in t ? {productKey: t.productKey, itemId: null} : {productKey: null, itemId: t.itemId};

export type RecipeOwner = Awaited<ReturnType<typeof readPool>>;

/** The target's documents, name and current recipe. A stock item must be a premix or blend. */
export async function readTarget(
  tx: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  target: RecipeTarget,
): Promise<RecipeOwner> {
  if ("productKey" in target) return readPool(tx, db, target.productKey);
  const ref = db.collection("stockItems").doc(target.itemId);
  const snap = await tx.get(ref);
  const d = snap.data();
  if (!snap.exists || !d || d.deleted === true) throw new HttpsError("not-found", "That stock item doesn't exist.");
  if (d.kind !== "premix" && d.kind !== "blend") bad("Only premixes and blends have recipes of their own.");
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : []);
  return {refs: [ref], skus: [], name: String(d.name ?? target.itemId), recipe: strings(d.recipe), alternates: strings(d.recipeAlternates)};
}

/** The pool's products (not deleted) and its current recipe. */
export async function readPool(
  tx: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  productKey: string,
): Promise<{
  refs: admin.firestore.DocumentReference[];
  skus: string[];
  name: string;
  recipe: string[];
  alternates: string[];
}> {
  const snap = await tx.get(db.collection("products").where("productKey", "==", productKey));
  const docs = snap.docs.filter((d) => d.data().deleted !== true);
  if (docs.length === 0) throw new HttpsError("not-found", "That product doesn't exist.");
  const withRecipe = docs.find((d) => Array.isArray(d.data().recipe) && d.data().recipe.length > 0);
  const first = docs[0].data();
  return {
    refs: docs.map((d) => d.ref),
    skus: docs.map((d) => d.id),
    name: [first.product, first.grade].filter((x) => typeof x === "string" && x.trim()).join(" "),
    recipe: withRecipe ? (withRecipe.data().recipe as string[]) : [],
    alternates: withRecipe && Array.isArray(withRecipe.data().recipeAlternates) ?
      (withRecipe.data().recipeAlternates as unknown[]).filter((x): x is string => typeof x === "string") :
      [],
  };
}

/** Same lines, any order. */
export function sameList(a: readonly string[], b: readonly string[]): boolean {
  const norm = (r: readonly string[]) => r.map((x) => x.trim().toLowerCase().replace(/\s+/g, " ")).sort().join("|");
  return norm(a) === norm(b);
}

/**
 * Writes an approved recipe (and its alternates) to every product of the pool and logs
 * each change per SKU. `alternates` defaults to the pool's current ones that still fit.
 */
export function applyRecipe(
  tx: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  pool: { refs: admin.firestore.DocumentReference[]; recipe: string[]; alternates: string[] },
  recipe: string[],
  by: { uid: string; name: string },
  requestId: string,
  alternates: string[] = keepAlternates(pool.alternates, recipe),
): void {
  const now = FieldValue.serverTimestamp();
  const recipeChanged = !sameRecipe(recipe, pool.recipe);
  const alternatesChanged = !sameList(alternates, pool.alternates);
  for (const ref of pool.refs) {
    tx.update(ref, {
      recipe,
      recipeAlternates: alternates,
      // Office-owned now: a later import from Gaurav's sheet must not overwrite it.
      appEdited: FieldValue.arrayUnion("recipe"),
      updatedAt: now,
      updatedBy: by,
    });
    const log = (field: string, old: string[], next: string[]) =>
      tx.create(db.collection("productChanges").doc(), {
        sku: ref.id,
        field,
        old,
        new: next,
        byUid: by.uid,
        byName: by.name,
        at: now,
        reason: `Recipe change approved (request ${requestId})`,
      });
    // Product changes are logged per SKU; a premix/blend's history is its request records.
    if (ref.parent.id !== "products") continue;
    if (recipeChanged) log("recipe", pool.recipe, recipe);
    if (alternatesChanged) log("recipeAlternates", pool.alternates, alternates);
  }
}
