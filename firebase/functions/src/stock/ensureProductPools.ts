import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {ITEMS, poolId} from "./stockModel";

/**
 * Makes sure every product STOCK POOL (product + grade, all pack sizes share
 * one figure) has a stock item, and keeps its name / density in step with the
 * products. Admin or Stock & Production; the app calls it when the stock
 * screen finds a product without a pool (e.g. after products are added).
 *
 *  - Never deletes or zeroes a pool; never touches on-hand.
 *  - The unit is only set while a pool has no stock history.
 *  - Safe to call any number of times.
 */
export const ensureProductPools = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin", "supervisor"]);
  const db = admin.firestore();

  const [products, pools] = await Promise.all([
    db.collection("products").where("deleted", "==", false).get(),
    db.collection(ITEMS).where("kind", "==", "product_pool").get(),
  ]);

  // One entry per productKey, from its products.
  const wanted = new Map<string, {name: string; baseUnit: string; density: number | null}>();
  for (const doc of products.docs) {
    const p = doc.data();
    const key = typeof p.productKey === "string" ? p.productKey : "";
    if (!key) continue;
    const name = [p.product, p.grade].filter((x) => typeof x === "string" && x.trim()).join(" ");
    const density = typeof p.densityKgPerL === "number" ? p.densityKgPerL : null;
    const prev = wanted.get(key);
    wanted.set(key, {
      name: prev?.name ?? name,
      baseUnit: prev?.baseUnit ?? String(p.baseUnit ?? "L"),
      density: prev?.density ?? density,
    });
  }

  const existing = new Map(pools.docs.map((d) => [d.id, d.data()]));
  const now = FieldValue.serverTimestamp();
  const by = {uid: caller.uid, name: caller.name};
  let created = 0;
  let updated = 0;
  let batch = db.batch();
  let ops = 0;

  for (const [key, w] of wanted) {
    const id = poolId(key);
    const current = existing.get(id);
    const ref = db.collection(ITEMS).doc(id);
    if (!current) {
      batch.set(ref, {
        kind: "product_pool",
        productKey: key,
        name: w.name,
        nameLower: w.name.toLowerCase(),
        code: null,
        baseUnit: w.baseUnit,
        densityKgPerL: w.density,
        aliases: [],
        onHandMilli: 0,
        lastMovementAt: null,
        deleted: false,
        createdAt: now,
        createdBy: by,
        updatedAt: now,
        updatedBy: by,
      });
      created += 1;
    } else {
      const noHistory = !current.lastMovementAt && (current.onHandMilli ?? 0) === 0;
      const changes: Record<string, unknown> = {};
      if (current.name !== w.name) Object.assign(changes, {name: w.name, nameLower: w.name.toLowerCase()});
      if ((current.densityKgPerL ?? null) !== w.density && w.density !== null) changes.densityKgPerL = w.density;
      if (noHistory && current.baseUnit !== w.baseUnit) changes.baseUnit = w.baseUnit;
      if (current.deleted === true) changes.deleted = false;
      if (Object.keys(changes).length === 0) continue;
      batch.update(ref, {...changes, updatedAt: now, updatedBy: by});
      updated += 1;
    }
    if (++ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();

  return {created, updated, pools: wanted.size};
});
