import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {requestId as parseRequestId} from "../stock/stockModel";
import {actorOf, historyRef, onceInTx} from "./common";
import {EDITABLE_FIELDS, ENTITIES, bad, diff, hlProfileChanged, parseEntityInput, type EntityInput} from "./entityModel";

/**
 * Create or edit a customer / supplier (Admin or Accounts).
 *
 *  - Create → auto id, syncStatus PENDING (copied to Humble Ledger by onEntityWritten),
 *    deleted:false, history "create". The opening balance can only be given here.
 *  - Edit → opening, distributorId and isWalkIn can't change; history gets the diff;
 *    PENDING again when name / first phone / email / GSTIN changed, or it had FAILED.
 *  - A GSTIN already on another active entity is refused, naming it — unless an Admin
 *    passes allowSameGstin (branches of one firm). The same phone is only a warning.
 *  - The walk-in customer: only its notes can change.
 *  - Retry-safe on requestId.
 */

const sameInput = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function gstVerifiedOf(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const s = (x: unknown) => (typeof x === "string" ? x.slice(0, 200) : "");
  return {legalName: s(v.legalName), tradeName: s(v.tradeName), status: s(v.status), verifiedAt: new Date().toISOString()};
}

export const saveEntity = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin", "accounts"]);
  const data = request.data ?? {};
  const reqId = parseRequestId(data.requestId);
  const entityId = typeof data.entityId === "string" && data.entityId.trim() ? data.entityId.trim() : null;
  const raw = (data.input ?? {}) as Record<string, unknown>;
  if (entityId && ("distributorId" in raw || "isWalkIn" in raw)) bad("The linked distributor and walk-in flag can't be changed here.");
  const input: EntityInput = parseEntityInput(raw);
  const allowSameGstin = data.allowSameGstin === true;
  if (allowSameGstin && caller.role !== "admin") bad("Only an Admin can allow the same GSTIN on two entities.");

  const db = admin.firestore();
  const by = actorOf(caller);

  return onceInTx(db, reqId, "saveEntity", async (tx) => {
    const ref = entityId ? db.collection(ENTITIES).doc(entityId) : db.collection(ENTITIES).doc();
    const existing = entityId ? (await tx.get(ref)).data() : undefined;
    if (entityId && (!existing || existing.deleted === true)) throw new HttpsError("not-found", "That customer / supplier doesn't exist.");

    // Duplicate GSTIN (active, not deleted, not this one).
    if (input.gstin && input.gstin !== existing?.gstin) {
      const same = await tx.get(db.collection(ENTITIES).where("gstin", "==", input.gstin));
      const other = same.docs.find((d) => d.id !== ref.id && d.data().deleted !== true && d.data().isActive !== false);
      if (other && !allowSameGstin) {
        throw new HttpsError("already-exists", `This GSTIN is already used by ${other.data().name}.`, {entityId: other.id, name: other.data().name});
      }
    }
    // Same phone elsewhere: a warning, never a block.
    const warnings: string[] = [];
    if (input.phones.length > 0) {
      const same = await tx.get(db.collection(ENTITIES).where("phones", "array-contains-any", input.phones.slice(0, 10)));
      for (const d of same.docs) {
        if (d.id !== ref.id && d.data().deleted !== true) warnings.push(`${d.data().name} has the same phone number.`);
      }
    }

    const now = FieldValue.serverTimestamp();
    const {opening, ...profile} = input;
    if (!existing) {
      tx.create(ref, {
        ...profile,
        nameLower: profile.name.toLowerCase(),
        gstVerified: profile.gstin ? gstVerifiedOf(data.gstVerified) : null,
        distributorId: null,
        isWalkIn: false,
        isActive: true,
        deleted: false,
        opening: opening ? {...opening, posted: false, hlTxnId: null} : null,
        syncStatus: "PENDING",
        hlCustomerId: null,
        hlAccountId: null,
        hlSyncedAt: null,
        hlSyncError: null,
        syncAttempts: 0,
        createdBy: by,
        updatedBy: by,
        createdAt: now,
        updatedAt: now,
      });
      tx.create(historyRef(db, ref.id), {at: now, by, action: "create", changes: {}});
      return {entityId: ref.id, changed: true, warnings};
    }

    // Edit.
    if (raw.opening !== undefined && raw.opening !== null) {
      const was = existing.opening ? {amountPaise: existing.opening.amountPaise, direction: existing.opening.direction, asOf: existing.opening.asOf} : null;
      if (!sameInput(was, opening)) bad("The opening balance can't be changed after it's created.");
    }
    if (existing.isWalkIn === true) {
      const otherFields = EDITABLE_FIELDS.filter((f) => f !== "notes");
      if (Object.keys(diff(existing, profile, otherFields)).length > 0) bad("Only the notes of the walk-in customer can be changed.");
    }
    const changes = diff(existing, profile, EDITABLE_FIELDS);
    if (Object.keys(changes).length === 0) return {entityId: ref.id, changed: false, warnings};
    const resync = hlProfileChanged(existing as never, profile) || existing.syncStatus === "FAILED";
    tx.update(ref, {
      ...profile,
      nameLower: profile.name.toLowerCase(),
      ...(data.gstVerified !== undefined ? {gstVerified: profile.gstin ? gstVerifiedOf(data.gstVerified) : null} : {}),
      ...(resync ? {syncStatus: "PENDING", syncAttempts: 0, hlSyncError: null} : {}),
      updatedBy: by,
      updatedAt: now,
    });
    tx.create(historyRef(db, ref.id), {at: now, by, action: "edit", changes});
    return {entityId: ref.id, changed: true, warnings};
  });
});
