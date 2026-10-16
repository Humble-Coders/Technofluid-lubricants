import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {applyRecipe, bad, parseRecipeInput, readPool, reasonText, REQUESTS, sameRecipe} from "./recipeModel";

/**
 * Ask for a product's recipe to change (Admin or Stock & Production).
 *
 *  - Stock & Production: the request waits for an Admin (status "pending").
 *    Only one request per product can wait at a time.
 *  - Admin: approved and applied at once; any request still waiting for the
 *    same product is marked "superseded".
 *  - Until approved, production keeps using the current recipe.
 */
export const requestRecipeChange = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin", "supervisor"]);
  const productKey = typeof request.data?.productKey === "string" ? request.data.productKey.trim() : "";
  if (!productKey) bad("productKey is required.");
  const recipe = parseRecipeInput(request.data?.recipe);
  const reason = reasonText(request.data?.reason, caller.role === "admin");

  const db = admin.firestore();
  const ref = db.collection(REQUESTS).doc();
  const by = {uid: caller.uid, name: caller.name};

  return db.runTransaction(async (tx) => {
    const pool = await readPool(tx, db, productKey);
    const waiting = await tx.get(
      db.collection(REQUESTS).where("productKey", "==", productKey).where("status", "==", "pending"),
    );
    if (sameRecipe(recipe, pool.recipe)) bad("That's the same as the current recipe.");

    const now = FieldValue.serverTimestamp();
    const isAdmin = caller.role === "admin";
    if (!isAdmin && !waiting.empty) {
      throw new HttpsError(
        "failed-precondition",
        "A recipe change for this product is already waiting for approval.",
      );
    }

    tx.create(ref, {
      productKey,
      productName: pool.name,
      skus: pool.skus,
      currentRecipe: pool.recipe,
      proposedRecipe: recipe,
      reason,
      status: isAdmin ? "approved" : "pending",
      requestedBy: by,
      requestedAt: now,
      decidedBy: isAdmin ? by : null,
      decidedAt: isAdmin ? now : null,
      decisionNote: isAdmin ? "Changed by an Admin — applied at once." : null,
    });

    if (isAdmin) {
      applyRecipe(tx, db, pool, recipe, by, ref.id);
      for (const doc of waiting.docs) {
        tx.update(doc.ref, {
          status: "superseded",
          decidedBy: by,
          decidedAt: now,
          decisionNote: "Replaced by a newer recipe change.",
        });
      }
    }
    return {requestId: ref.id, status: isAdmin ? "approved" : "pending"};
  });
});
