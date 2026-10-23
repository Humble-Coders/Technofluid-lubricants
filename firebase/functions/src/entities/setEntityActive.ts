import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {getHlClient, HL_SECRETS} from "../ledger/getHlClient";
import {hasBalanceError, isNotFound, plainHlMessage} from "../ledger/hlClient";
import {requestId as parseRequestId} from "../stock/stockModel";
import {actorOf, historyRef, onceInTx, reasonText} from "./common";
import {ENTITIES, WALK_IN_ENTITY_ID, bad, formatRupees, hlAmountToPaise} from "./entityModel";

/**
 * Archive or un-archive a customer / supplier, with a reason (Admin or Accounts).
 *
 * Archiving asks Humble Ledger for the balance and refuses unless it is zero ("Settle
 * ₹X first"), then archives the HL customer too — so the books and the app agree and the
 * balance never silently drops out of totals (Aromex lesson 3). The walk-in can't be
 * archived. Retry-safe on requestId.
 */
export const setEntityActive = onCall({region: "us-central1", secrets: HL_SECRETS}, async (request) => {
  const caller = await requireRole(request, ["admin", "accounts"]);
  const data = request.data ?? {};
  const reqId = parseRequestId(data.requestId);
  const entityId = typeof data.entityId === "string" ? data.entityId.trim() : "";
  if (!entityId) bad("entityId is required.");
  if (typeof data.active !== "boolean") bad("active must be true or false.");
  const active: boolean = data.active;
  const reason = reasonText(data.reason);
  if (entityId === WALK_IN_ENTITY_ID) bad("The walk-in customer can't be archived.");

  const db = admin.firestore();
  const ref = db.collection(ENTITIES).doc(entityId);
  const snap = await ref.get();
  const d = snap.data();
  if (!snap.exists || !d || d.deleted === true) throw new HttpsError("not-found", "That customer / supplier doesn't exist.");
  if (d.isWalkIn === true) bad("The walk-in customer can't be archived.");
  if ((d.isActive !== false) === active) return {entityId, active, alreadyDone: true};

  const hl = getHlClient();
  try {
    if (d.hlCustomerId) {
      if (!active) {
        const customer = await hl.getCustomer(String(d.hlCustomerId)).catch((e) => (isNotFound(e) ? null : Promise.reject(e)));
        if (customer) {
          const balance = hlAmountToPaise(String(customer.balance ?? customer.outstanding ?? "0"));
          if (balance !== 0) {
            const who = balance > 0 ? "they owe us" : "we owe them";
            throw new HttpsError("failed-precondition", `Settle ${formatRupees(Math.abs(balance))} first (${who}) — only a zero balance can be archived.`);
          }
          // Already archived in the books (e.g. a retry) — nothing to do there.
          if (customer.isActive !== false) await hl.archiveCustomer(customer.id);
        }
      } else {
        await hl.unarchiveCustomer(String(d.hlCustomerId)).catch((e) => (isNotFound(e) ? undefined : Promise.reject(e)));
      }
    } else if (!active && d.opening && d.opening.posted !== true) {
      throw new HttpsError("failed-precondition", "Its opening balance isn't in the books yet — wait until it's saved, then settle it first.");
    }
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    if (hasBalanceError(e)) throw new HttpsError("failed-precondition", "The books still show a balance — settle it first.");
    throw new HttpsError("unavailable", plainHlMessage(e));
  }

  const by = actorOf(caller);
  return onceInTx(db, reqId, "setEntityActive", async (tx) => {
    const now = FieldValue.serverTimestamp();
    tx.update(ref, {isActive: active, updatedBy: by, updatedAt: now});
    tx.create(historyRef(db, entityId), {at: now, by, action: active ? "unarchive" : "archive", changes: {isActive: {from: !active, to: active}}, reason});
    return {entityId, active};
  });
});
