import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {bad, BASE_UNITS, ITEMS, type BaseUnit} from "./stockModel";

/**
 * Add, edit, delete or restore a RAW MATERIAL or CONSUMABLE stock item
 * (decision #21). Admin or Stock & Production. Product stock pools come from
 * the products themselves (ensureProductPools) and can't be edited here.
 *
 *  - `code` (raw materials): the short name recipes use, e.g. "w150" — unique.
 *  - Names are unique within a kind, so a journal line can't pick the wrong one.
 *  - The unit can't change once the item has stock history.
 *  - Delete is soft and only when nothing is on hand (count it to 0 first).
 */

const KINDS = ["raw_material", "consumable"] as const;

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) bad(`${label} is required.`);
  const t = value.replace(/\s+/g, " ").trim();
  if (t.length > max) bad(`${label} must be ${max} characters or fewer.`);
  return t;
}

export const saveStockItem = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin", "supervisor"]);
  const data = request.data ?? {};
  const itemId = typeof data.itemId === "string" && data.itemId.trim() ? data.itemId.trim() : null;

  const db = admin.firestore();
  const now = FieldValue.serverTimestamp();
  const by = {uid: caller.uid, name: caller.name};

  return db.runTransaction(async (tx) => {
    const ref = itemId ? db.collection(ITEMS).doc(itemId) : db.collection(ITEMS).doc();
    const existingSnap = itemId ? await tx.get(ref) : null;
    const existing = existingSnap?.data();
    if (itemId && (!existingSnap?.exists || !existing)) {
      throw new HttpsError("not-found", "That stock item doesn't exist.");
    }
    if (existing && existing.kind === "product_pool") {
      bad("Product stock pools come from the products — edit the product instead.");
    }
    const hasHistory = Boolean(existing?.lastMovementAt) || (existing?.onHandMilli ?? 0) !== 0;

    // Delete / restore only.
    if (existing && typeof data.deleted === "boolean" && Object.keys(data).every((k) => ["itemId", "deleted"].includes(k))) {
      if (data.deleted && (existing.onHandMilli ?? 0) !== 0) {
        bad(`${existing.name} still has stock — correct the count to 0 before deleting it.`);
      }
      if (existing.deleted !== data.deleted) {
        tx.update(ref, {deleted: data.deleted, updatedAt: now, updatedBy: by});
      }
      return {itemId: ref.id};
    }

    const kind = existing ? existing.kind : data.kind;
    if (!(KINDS as readonly string[]).includes(kind)) bad("Kind must be raw material or consumable.");
    const name = text(data.name, "Name", 80);
    if (!(BASE_UNITS as readonly string[]).includes(data.baseUnit)) bad("Unit must be L, kg or piece.");
    const baseUnit = data.baseUnit as BaseUnit;
    if (existing && hasHistory && existing.baseUnit !== baseUnit) {
      bad(`${existing.name} already has stock history in ${existing.baseUnit} — its unit can't change.`);
    }

    let code: string | null = null;
    if (kind === "raw_material" && data.code !== undefined && data.code !== null && String(data.code).trim()) {
      code = String(data.code).trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9.\-]{0,23}$/.test(code)) {
        bad("Code: letters, digits, dots or dashes, up to 24 characters (e.g. w150).");
      }
    }

    let density: number | null = null;
    if (data.densityKgPerL !== undefined && data.densityKgPerL !== null) {
      const d = data.densityKgPerL;
      if (typeof d !== "number" || !Number.isFinite(d) || d < 0.3 || d > 3) bad("Density must be between 0.3 and 3 kg per litre.");
      density = Math.round(d * 10_000) / 10_000;
    }

    const aliases = Array.isArray(data.aliases) ?
      [...new Set(data.aliases.filter((a: unknown) => typeof a === "string" && a.trim()).map((a: string) => a.trim().slice(0, 40)))].slice(0, 20) :
      [];

    // Uniqueness: name within the kind, code among raw materials (deleted items ignored).
    const sameName = await tx.get(db.collection(ITEMS).where("kind", "==", kind).where("nameLower", "==", name.toLowerCase()));
    if (sameName.docs.some((d) => d.id !== ref.id && d.data().deleted !== true)) bad(`There's already a ${kind === "raw_material" ? "raw material" : "consumable"} called ${name}.`);
    if (code) {
      const sameCode = await tx.get(db.collection(ITEMS).where("code", "==", code));
      if (sameCode.docs.some((d) => d.id !== ref.id && d.data().deleted !== true)) bad(`Code "${code}" is already used.`);
    }

    const fields = {
      kind,
      name,
      nameLower: name.toLowerCase(),
      code,
      baseUnit,
      densityKgPerL: density,
      aliases,
      updatedAt: now,
      updatedBy: by,
    };
    if (existing) {
      tx.update(ref, fields);
    } else {
      tx.create(ref, {
        ...fields,
        productKey: null,
        onHandMilli: 0,
        lastMovementAt: null,
        deleted: false,
        createdAt: now,
        createdBy: by,
      });
    }
    return {itemId: ref.id};
  });
});
