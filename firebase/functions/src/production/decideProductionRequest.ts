import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {applyRecipe, bad, readPool, reasonText, sameRecipe} from "../recipes/recipeModel";
import {parseJournalLines, readJournalItems, writeJournal} from "../stock/journalWriter";
import {PRODUCTION_REQUESTS} from "./productionModel";

/**
 * Admin approves or rejects a production entry that came with a recipe change.
 *
 *  - Approve: the new recipe goes on every pack of the product and the stock lines
 *    are saved (as the person who entered them, marked with who approved), in one
 *    transaction. Refused as out of date if the recipe changed in the meantime.
 *  - Reject: nothing changes; the note says why.
 *  - Only a pending entry can be decided.
 */
export const decideProductionRequest = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin"]);
  const id = typeof request.data?.requestId === "string" ? request.data.requestId.trim() : "";
  if (!id) bad("requestId is required.");
  const decision = request.data?.decision;
  if (decision !== "approve" && decision !== "reject") bad("decision must be approve or reject.");
  const note = reasonText(request.data?.note, decision === "approve");

  const db = admin.firestore();
  const ref = db.collection(PRODUCTION_REQUESTS).doc(id);
  const by = {uid: caller.uid, name: caller.name};

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const req = snap.data();
    if (!snap.exists || !req) throw new HttpsError("not-found", "That entry doesn't exist.");
    if (req.status !== "pending") throw new HttpsError("failed-precondition", `That entry was already ${req.status}.`);
    const now = FieldValue.serverTimestamp();

    if (decision === "reject") {
      tx.update(ref, {status: "rejected", decidedBy: by, decidedAt: now, decisionNote: note});
      return {status: "rejected", recorded: 0, alreadyRecorded: false, skipped: [], belowZero: []};
    }

    const changes = (req.recipeChanges ?? []) as {productKey: string; productName: string; currentRecipe: string[]; proposedRecipe: string[]}[];
    const pools = await Promise.all(changes.map((c) => readPool(tx, db, c.productKey)));
    const lines = parseJournalLines(req.lines);
    const read = await readJournalItems(tx, db, id, lines);
    pools.forEach((p, i) => {
      if (!sameRecipe(p.recipe, changes[i].currentRecipe ?? [])) {
        throw new HttpsError(
          "failed-precondition",
          `The recipe of ${changes[i].productName} has changed since this was entered — reject it and enter it again.`,
        );
      }
    });

    const result = writeJournal(tx, db, read, {
      reqId: id,
      date: String(req.journalDate),
      lines,
      by: {byUid: String(req.requestedBy?.uid ?? ""), byName: String(req.requestedBy?.name ?? "")},
      fn: "decideProductionRequest",
      extra: {approvedBy: by},
    });
    pools.forEach((p, i) => applyRecipe(tx, db, p, changes[i].proposedRecipe, by, id));
    tx.update(ref, {status: "approved", decidedBy: by, decidedAt: now, decisionNote: note});
    return {status: "approved", ...result};
  });
});
