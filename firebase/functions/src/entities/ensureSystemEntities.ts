import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {actorOf, type Actor} from "./common";
import {ENTITIES, SELLER_STATE_CODE, WALK_IN_ENTITY_ID} from "./entityModel";

/** The walk-in / cash customer's record — one fixed id (Aromex lesson 5). */
export function walkInDoc(by: Actor) {
  const now = FieldValue.serverTimestamp();
  return {
    name: "Walk-in / cash customer",
    nameLower: "walk-in / cash customer",
    kinds: ["customer"],
    phones: [],
    email: null,
    gstin: null,
    gstVerified: null,
    address: {line1: "", line2: "", city: "", district: "", pincode: "", stateCode: SELLER_STATE_CODE},
    priceTier: "Dealer",
    creditLimitPaise: null,
    notes: null,
    distributorId: null,
    isWalkIn: true,
    isActive: true,
    deleted: false,
    opening: null,
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
  };
}

/** Admin: create the system entities if they're missing (today just the walk-in). */
export const ensureSystemEntities = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin"]);
  const db = admin.firestore();
  const ref = db.collection(ENTITIES).doc(WALK_IN_ENTITY_ID);
  const created = await db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return false;
    const by = actorOf(caller);
    tx.create(ref, walkInDoc(by));
    tx.create(ref.collection("history").doc(), {at: FieldValue.serverTimestamp(), by, action: "create", changes: {}});
    return true;
  });
  return {created: created ? [WALK_IN_ENTITY_ID] : []};
});
