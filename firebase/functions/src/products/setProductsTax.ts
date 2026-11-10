import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {bad, currentValue, parseField, type EditValue} from "./productEdit";

/** At most this many products in one call (the app sends what's shown on screen). */
export const MAX_TAX_SKUS = 2000;
/** Products per transaction: 1 product update + up to 2 change logs each, under Firestore's 500 writes. */
const CHUNK = 150;

/**
 * Admin sets the GST % and/or the HSN code on many products at once (Technofluid Office,
 * Products → "Change GST / HSN"), e.g. when the CA's real rates arrive.
 *
 * Same rules as `editProduct` for these two fields: GST must be a current slab; HSN is
 * 4, 6 or 8 digits (or null to clear). Each changed value is logged in `productChanges`
 * and added to `appEdited`, so a later import from Gaurav's sheet keeps it. Neither field
 * is in the public catalogue, so nothing there is rebuilt. Retry-safe: values are
 * absolute, unchanged products are skipped and log nothing.
 *
 * Request: {skus: string[], gstPct?: number, hsnCode?: string | null, reason?: string}
 * (send `hsnCode` only to change it). Returns {changed, unchanged, missing}.
 */
export const setProductsTax = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin"]);
  const data = (request.data ?? {}) as Record<string, unknown>;

  const raw = Array.isArray(data.skus) ? data.skus : [];
  const skus = [...new Set(raw.filter((s): s is string => typeof s === "string").map((s) => s.trim()).filter(Boolean))];
  if (skus.length === 0) bad("Choose at least one product.");
  if (skus.length > MAX_TAX_SKUS) bad(`At most ${MAX_TAX_SKUS} products at a time.`);

  const changes: {field: "gstPct" | "hsnCode"; value: EditValue}[] = [];
  if (data.gstPct !== undefined) changes.push({field: "gstPct", value: parseField("gstPct", data.gstPct)});
  if (Object.prototype.hasOwnProperty.call(data, "hsnCode")) {
    const hsn = typeof data.hsnCode === "string" && !data.hsnCode.trim() ? null : data.hsnCode;
    changes.push({field: "hsnCode", value: parseField("hsnCode", hsn)});
  }
  if (changes.length === 0) bad("Say what to change: the GST %, the HSN code, or both.");

  const reason = typeof data.reason === "string" && data.reason.trim() ? data.reason.trim().slice(0, 200) : null;
  const db = admin.firestore();
  const by = {uid: caller.uid, name: caller.name};
  let changed = 0;
  let unchanged = 0;
  const missing: string[] = [];

  for (let i = 0; i < skus.length; i += CHUNK) {
    const part = skus.slice(i, i + CHUNK);
    const r = await db.runTransaction(async (tx) => {
      const refs = part.map((sku) => db.collection("products").doc(sku));
      const snaps = await tx.getAll(...refs);
      const out = {changed: 0, unchanged: 0, missing: [] as string[]};
      const now = FieldValue.serverTimestamp();
      snaps.forEach((snap, j) => {
        const p = snap.data();
        if (!snap.exists || !p || p.deleted === true) {
          out.missing.push(part[j]);
          return;
        }
        const diff = changes.filter((c) => currentValue(p, c.field) !== c.value);
        if (diff.length === 0) {
          out.unchanged++;
          return;
        }
        const update: Record<string, unknown> = {updatedAt: now, updatedBy: by, appEdited: FieldValue.arrayUnion(...diff.map((c) => c.field))};
        for (const c of diff) {
          update[c.field] = c.value;
          tx.create(db.collection("productChanges").doc(), {
            sku: part[j], field: c.field, old: currentValue(p, c.field), new: c.value,
            byUid: caller.uid, byName: caller.name, at: now, reason, bulk: true,
          });
        }
        tx.update(refs[j], update);
        out.changed++;
      });
      return out;
    });
    changed += r.changed;
    unchanged += r.unchanged;
    missing.push(...r.missing);
  }

  if (changed === 0 && missing.length === skus.length) throw new HttpsError("not-found", "None of those products exist.");
  return {changed, unchanged, missing};
});
