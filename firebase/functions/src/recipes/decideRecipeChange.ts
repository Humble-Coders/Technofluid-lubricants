import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {applyRecipe, bad, readPool, reasonText, REQUESTS, sameRecipe} from "./recipeModel";

/**
 * Admin approves or rejects a waiting recipe change.
 *
 *  - Approve: the proposed recipe is written to every pack of the product
 *    (logged per SKU in productChanges); production follows it from then on.
 *  - If the recipe was changed some other way after the request was made, the
 *    request is refused as out of date — it would undo that change.
 *  - Reject: nothing changes; the note says why.
 *  - Only a pending request can be decided (a repeat is refused, not re-applied).
 */
export const decideRecipeChange = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin"]);
  const id = typeof request.data?.requestId === "string" ? request.data.requestId.trim() : "";
  if (!id) bad("requestId is required.");
  const decision = request.data?.decision;
  if (decision !== "approve" && decision !== "reject") bad("decision must be approve or reject.");
  const note = reasonText(request.data?.note, decision === "approve");

  const db = admin.firestore();
  const ref = db.collection(REQUESTS).doc(id);
  const by = {uid: caller.uid, name: caller.name};

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const req = snap.data();
    if (!snap.exists || !req) throw new HttpsError("not-found", "That request doesn't exist.");
    if (req.status !== "pending") {
      throw new HttpsError("failed-precondition", `That request was already ${req.status}.`);
    }
    const pool = await readPool(tx, db, String(req.productKey));
    const now = FieldValue.serverTimestamp();

    if (decision === "approve") {
      if (!sameRecipe(pool.recipe, req.currentRecipe ?? [])) {
        throw new HttpsError(
          "failed-precondition",
          "The recipe has changed since this was asked for — reject it and ask again.",
        );
      }
      // Only an Admin sets alternates, so the pool's current ones (that still fit) stay.
      applyRecipe(tx, db, pool, req.proposedRecipe as string[], by, id);
    }
    tx.update(ref, {
      status: decision === "approve" ? "approved" : "rejected",
      decidedBy: by,
      decidedAt: now,
      decisionNote: note,
    });
    return {status: decision === "approve" ? "approved" : "rejected"};
  });
});
