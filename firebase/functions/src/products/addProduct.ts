import * as admin from "firebase-admin";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {pricesRef} from "./prices";
import {bad, parseField, text, type EditValue} from "./productEdit";
import {rebuildFamilyProjection} from "./rebuildFamilyProjection";

/**
 * Admin adds a product from Technofluid Office — either from scratch or as a
 * copy of an existing one (the way to "change" a locked field like grade or
 * pack size). Separate from `createProduct`, which the website uses.
 *
 *  - SKU format PRODUCTCODE-GRADE-PACK (the app suggests one); must be new.
 *  - productKey = slug(product + grade) = the stock pool. If the pool already
 *    has packs, the new one must use the same unit (L / kg / piece).
 *  - A copy into the same pool keeps the original's recipe.
 *  - Optionally switches the original off (not deleted) in the same step.
 *  - Logged in `productChanges` as field "created" (and "active" for the switch-off).
 */

const CATEGORIES = ["bulk_oil", "grease", "retail"] as const;
const BASE_UNITS = ["L", "kg", "piece"] as const;
const SKU_RE = /^[A-Z0-9]+(?:[-.][A-Z0-9]+)*$/;

/** Same slug rule as createProduct / the website importer. */
function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function oneOf<T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (typeof value !== "string" || !(options as readonly string[]).includes(value)) {
    bad(`${label} must be one of: ${options.join(", ")}.`);
  }
  return value as T;
}

export const addProduct = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin"]);
  const input = request.data?.product;
  if (typeof input !== "object" || input === null) bad("product is required.");

  const sku = typeof input.sku === "string" ? input.sku.trim().toUpperCase() : "";
  if (!SKU_RE.test(sku) || sku.length > 60) {
    bad("SKU must be capital letters and numbers joined by dashes, e.g. HYDAW-68-26L.");
  }

  const product = parseField("product", input.product) as string;
  const grade = input.grade === undefined || input.grade === null || String(input.grade).trim() === "" ?
    "" :
    text(input.grade, "Grade", 30);
  const category = oneOf(input.category, CATEGORIES, "Category");
  const baseUnit = oneOf(input.baseUnit, BASE_UNITS, "Unit");
  const orderableUnit = parseField("orderableUnit", input.orderableUnit) as string;
  const packQty = input.packQty;
  if (typeof packQty !== "number" || !Number.isFinite(packQty) || packQty <= 0 || packQty > 100_000) {
    bad("Pack size must be a number greater than 0.");
  }
  if (Math.round(packQty * 1000) !== packQty * 1000) {
    bad("Pack size can have at most 3 decimals.");
  }

  const fields: Record<string, EditValue> = {
    gstPct: parseField("gstPct", input.gstPct),
    hsnCode: parseField("hsnCode", input.hsnCode ?? null),
    segment: parseField("segment", input.segment),
    densityKgPerL: parseField("densityKgPerL", input.densityKgPerL ?? null),
  };
  const prices: Record<string, EditValue> = {
    pricePer: parseField("pricePer", input.pricePer),
    dealerPrice: parseField("dealerPrice", input.dealerPrice ?? null),
    distributorPrice: parseField("distributorPrice", input.distributorPrice ?? null),
  };

  const copyOf = typeof request.data?.copyOf === "string" && request.data.copyOf.trim() ?
    request.data.copyOf.trim() :
    null;
  const switchOffOriginal = request.data?.switchOffOriginal === true;
  if (switchOffOriginal && !copyOf) bad("Nothing to switch off — this isn't a copy.");

  const productKey = slugify(`${product} ${grade}`);
  if (!productKey) bad("Product name is required.");

  const db = admin.firestore();
  const ref = db.collection("products").doc(sku);
  const priceRef = pricesRef(db, sku);
  const sourceRef = copyOf ? db.collection("products").doc(copyOf) : null;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const by = {uid: caller.uid, name: caller.name};

  const affectedKeys = await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) {
      throw new HttpsError("already-exists", `SKU ${sku} is already used — choose another.`);
    }

    // All packs of one stock pool share one stock figure, so they must share a unit.
    const pool = await tx.get(
      db.collection("products").where("productKey", "==", productKey).limit(1),
    );
    const poolUnit = pool.docs[0]?.data().baseUnit;
    if (poolUnit && poolUnit !== baseUnit) {
      bad(`Other packs of ${product}${grade ? ` ${grade}` : ""} are counted in ${poolUnit} — use ${poolUnit} here too.`);
    }

    let recipe: string[] = [];
    const keys = [productKey];
    if (sourceRef) {
      const source = await tx.get(sourceRef);
      const data = source.data();
      if (!source.exists || !data || data.deleted === true) {
        throw new HttpsError("not-found", `Product "${copyOf}" doesn't exist.`);
      }
      if (data.productKey === productKey && Array.isArray(data.recipe)) recipe = data.recipe;
      if (switchOffOriginal && data.active !== false) {
        tx.update(sourceRef, {active: false, updatedAt: now, updatedBy: by});
        tx.create(db.collection("productChanges").doc(), {
          sku: copyOf, field: "active", old: true, new: false,
          byUid: caller.uid, byName: caller.name, at: now,
          reason: `Replaced by ${sku}`,
        });
        if (typeof data.productKey === "string") keys.push(data.productKey);
      }
    }

    tx.create(ref, {
      sku,
      product,
      grade,
      productKey,
      category,
      orderableUnit,
      packQty,
      baseUnit,
      ...fields,
      recipe,
      active: true,
      deleted: false,
      // Born in the office app: a later import must not overwrite these.
      appEdited: ["product", "orderableUnit", "pricePer", "dealerPrice", "distributorPrice", "gstPct", "segment"],
      createdAt: now,
      updatedAt: now,
      createdBy: by,
      updatedBy: by,
      ...(priceRef.path === ref.path ? prices : {}),
    });
    if (priceRef.path !== ref.path) tx.set(priceRef, {...prices, updatedAt: now, updatedBy: by});

    tx.create(db.collection("productChanges").doc(), {
      sku, field: "created", old: null, new: copyOf,
      byUid: caller.uid, byName: caller.name, at: now,
      reason: copyOf ? `Copied from ${copyOf}` : null,
    });

    return keys;
  });

  await Promise.all([...new Set(affectedKeys)].map((key) => rebuildFamilyProjection(db, key)));
  return {sku, productKey};
});
