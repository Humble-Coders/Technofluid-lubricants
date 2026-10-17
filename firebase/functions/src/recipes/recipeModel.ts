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

/** Validates a proposed recipe and returns it as "code/percent" strings. */
export function parseRecipeInput(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) bad("A recipe needs at least one ingredient.");
  if (value.length > MAX_INGREDIENTS) bad(`At most ${MAX_INGREDIENTS} ingredients.`);
  const seen = new Set<string>();
  return value.map((raw, i) => {
    const label = `Ingredient ${i + 1}`;
    if (typeof raw !== "object" || raw === null) bad(`${label} is empty.`);
    const code = typeof raw.code === "string" ? raw.code.trim().toLowerCase().replace(/\s+/g, " ") : "";
    if (!CODE_RE.test(code)) {
      bad(`${label}: use the recipe code — letters, digits, spaces, dots, dashes or brackets (e.g. w150).`);
    }
    if (seen.has(code)) bad(`"${code}" is listed twice.`);
    seen.add(code);
    const p = raw.percent;
    if (p === null || p === undefined) return `${code}/`;
    if (typeof p !== "number" || !Number.isFinite(p) || p <= 0 || p > 100) {
      bad(`${label} (${code}): the percent must be above 0 and at most 100, or left empty.`);
    }
    if (Math.round(p * 100) !== p * 100) bad(`${label} (${code}): at most 2 decimals in the percent.`);
    return `${code}/${percentText(p)}`;
  });
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

/** The pool's products (not deleted) and its current recipe. */
export async function readPool(
  tx: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  productKey: string,
): Promise<{ refs: admin.firestore.DocumentReference[]; skus: string[]; name: string; recipe: string[] }> {
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
  };
}

/** Writes an approved recipe to every product of the pool and logs it per SKU. */
export function applyRecipe(
  tx: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  pool: { refs: admin.firestore.DocumentReference[]; recipe: string[] },
  recipe: string[],
  by: { uid: string; name: string },
  requestId: string,
): void {
  const now = FieldValue.serverTimestamp();
  for (const ref of pool.refs) {
    tx.update(ref, {
      recipe,
      // Office-owned now: a later import from Gaurav's sheet must not overwrite it.
      appEdited: FieldValue.arrayUnion("recipe"),
      updatedAt: now,
      updatedBy: by,
    });
    tx.create(db.collection("productChanges").doc(), {
      sku: ref.id,
      field: "recipe",
      old: pool.recipe,
      new: recipe,
      byUid: by.uid,
      byName: by.name,
      at: now,
      reason: `Recipe change approved (request ${requestId})`,
    });
  }
}
