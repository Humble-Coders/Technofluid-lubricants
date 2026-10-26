import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {ENTITIES, bad} from "./entityModel";

/**
 * "Retry" on an entity that couldn't be saved to the books: back to PENDING with the
 * attempt count reset, which wakes onEntityWritten (clients can't write entities).
 */
export const retryEntitySync = onCall({region: "us-central1"}, async (request) => {
  await requireRole(request, ["admin", "accounts"]);
  const entityId = typeof request.data?.entityId === "string" ? request.data.entityId.trim() : "";
  if (!entityId) bad("entityId is required.");
  const db = admin.firestore();
  const ref = db.collection(ENTITIES).doc(entityId);
  return db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data();
    if (!d || d.deleted === true) throw new HttpsError("not-found", "That customer / supplier doesn't exist.");
    if (d.syncStatus === "SYNCED") return {entityId, syncStatus: "SYNCED"};
    tx.update(ref, {syncStatus: "PENDING", syncAttempts: 0, hlSyncError: null, retryRequestedAt: FieldValue.serverTimestamp()});
    return {entityId, syncStatus: "PENDING"};
  });
});
