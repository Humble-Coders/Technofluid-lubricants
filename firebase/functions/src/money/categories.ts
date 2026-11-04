import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {requestId as parseRequestId} from "../stock/stockModel";
import {onceInTx, text} from "./common";
import {EXPENSE_CATEGORIES, bad} from "./moneyModel";

/**
 * Expense categories (Freight, Electricity…). Admin + Accounts add; only an Admin renames
 * or archives. Each is pinned ONCE to its own HL EXPENSE account by
 * onExpenseCategoryWritten (resolved by id, never by name). Never hard-deleted.
 */
export const saveExpenseCategory = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin", "accounts"]);
  const data = request.data ?? {};
  const reqId = parseRequestId(data.requestId);
  const categoryId = typeof data.categoryId === "string" && data.categoryId.trim() ? data.categoryId.trim() : null;
  const name = text(data.name, "Name", 60);
  if (categoryId && caller.role !== "admin") bad("Only an Admin can rename or archive a category.");
  const db = admin.firestore();
  const by = {uid: caller.uid, name: caller.name};

  return onceInTx(db, reqId, "saveExpenseCategory", async (tx) => {
    const same = await tx.get(db.collection(EXPENSE_CATEGORIES).where("nameLower", "==", name.toLowerCase()));
    if (same.docs.some((d) => d.id !== categoryId && d.data().deleted !== true)) bad(`There's already a category called ${name}.`);
    const now = FieldValue.serverTimestamp();
    if (!categoryId) {
      const ref = db.collection(EXPENSE_CATEGORIES).doc();
      tx.create(ref, {
        name,
        nameLower: name.toLowerCase(),
        isActive: true,
        hlAccountId: null,
        syncStatus: "PENDING",
        hlSyncError: null,
        syncAttempts: 0,
        deleted: false,
        createdBy: by,
        updatedBy: by,
        createdAt: now,
        updatedAt: now,
      });
      return {categoryId: ref.id};
    }
    const ref = db.collection(EXPENSE_CATEGORIES).doc(categoryId);
    const d = (await tx.get(ref)).data();
    if (!d || d.deleted === true) throw new HttpsError("not-found", "That category doesn't exist.");
    tx.update(ref, {
      name,
      nameLower: name.toLowerCase(),
      ...(typeof data.isActive === "boolean" ? {isActive: data.isActive} : {}),
      updatedBy: by,
      updatedAt: now,
    });
    return {categoryId};
  });
});
