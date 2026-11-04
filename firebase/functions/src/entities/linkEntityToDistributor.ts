import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {requestId as parseRequestId} from "../stock/stockModel";
import {actorOf, historyRef, onceInTx} from "./common";
import {ENTITIES, bad} from "./entityModel";

/**
 * Admin links a customer to an APPROVED website distributor (or unlinks it).
 *
 * Only approved distributors: approveDistributorCallable re-creates a distributor under
 * a new id on approval (brief §6), so pending ids would be orphaned. The entity's own id
 * is what Humble Ledger knows, so re-linking never touches a balance. One entity per
 * distributor, checked inside the transaction. Website functions are not changed.
 */
export const linkEntityToDistributor = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin"]);
  const data = request.data ?? {};
  const reqId = parseRequestId(data.requestId);
  const entityId = typeof data.entityId === "string" ? data.entityId.trim() : "";
  if (!entityId) bad("entityId is required.");
  const distributorId = typeof data.distributorId === "string" && data.distributorId.trim() ? data.distributorId.trim() : null;

  const db = admin.firestore();
  const ref = db.collection(ENTITIES).doc(entityId);
  const by = actorOf(caller);

  return onceInTx(db, reqId, "linkEntityToDistributor", async (tx) => {
    const d = (await tx.get(ref)).data();
    if (!d || d.deleted === true) throw new HttpsError("not-found", "That customer / supplier doesn't exist.");
    if (d.isWalkIn === true) bad("The walk-in customer can't be linked.");
    if ((d.distributorId ?? null) === distributorId) return {entityId, distributorId};

    if (distributorId) {
      const dist = (await tx.get(db.collection("distributors").doc(distributorId))).data();
      if (!dist) throw new HttpsError("not-found", "That distributor doesn't exist.");
      if (dist.status !== "approved" || dist.isActive !== true || dist.deleted === true) {
        bad("Only an approved, active distributor can be linked.");
      }
      const taken = await tx.get(db.collection(ENTITIES).where("distributorId", "==", distributorId));
      const other = taken.docs.find((x) => x.id !== entityId && x.data().deleted !== true);
      if (other) throw new HttpsError("already-exists", `That distributor is already linked to ${other.data().name}.`);
    }
    const now = FieldValue.serverTimestamp();
    tx.update(ref, {distributorId, updatedBy: by, updatedAt: now});
    tx.create(historyRef(db, entityId), {
      at: now,
      by,
      action: distributorId ? "link" : "unlink",
      changes: {distributorId: {from: d.distributorId ?? null, to: distributorId}},
    });
    return {entityId, distributorId};
  });
});
