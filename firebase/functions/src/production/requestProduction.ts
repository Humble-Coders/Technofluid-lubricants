import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {applyRecipe, readTarget, reasonText, sameRecipe, targetFields} from "../recipes/recipeModel";
import {parseJournalLines, readJournalItems, writeJournal, type ParsedLine} from "../stock/journalWriter";
import {bad, journalDate, poolId, requestId as parseRequestId} from "../stock/stockModel";
import {parseRecipeChanges, PRODUCTION_REQUESTS} from "./productionModel";

/**
 * Save a journal entry whose production run changed a recipe (Admin or Stock &
 * Production). Same lines as recordStockMovements, plus `recipeChanges` and a reason.
 *
 *  - Stock & Production: kept as "pending" — nothing changes in stock or recipes
 *    until an Admin approves it (decideProductionRequest).
 *  - Admin: the recipe is applied and the stock saved at once, in one transaction.
 *  - Retry-safe: the request id is the record's id; sending it again changes nothing.
 */
export const requestProduction = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin", "supervisor"]);
  const isAdmin = caller.role === "admin";
  const reqId = parseRequestId(request.data?.requestId);
  const date = journalDate(request.data?.journalDate);
  const lines = parseJournalLines(request.data?.lines);
  const changes = parseRecipeChanges(request.data?.recipeChanges);
  const reason = reasonText(request.data?.reason, isAdmin);
  const made = new Set(lines.filter((l) => l.kind === "MADE").map((l) => l.itemId));
  for (const c of changes) {
    const madeId = "productKey" in c.target ? poolId(c.target.productKey) : c.target.itemId;
    if (!made.has(madeId)) bad("A changed recipe must be for something made in this entry.");
  }

  const db = admin.firestore();
  const ref = db.collection(PRODUCTION_REQUESTS).doc(reqId);
  const by = {uid: caller.uid, name: caller.name};

  return db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) {
      return {requestId: reqId, status: existing.data()?.status, recorded: 0, alreadyRecorded: true, skipped: [], belowZero: []};
    }
    const pools = await Promise.all(changes.map((c) => readTarget(tx, db, c.target)));
    const read = await readJournalItems(tx, db, reqId, lines);
    pools.forEach((p, i) => {
      if (sameRecipe(changes[i].recipe, p.recipe)) bad(`${p.name}: that's the same as the current recipe.`);
    });

    const now = FieldValue.serverTimestamp();
    const record = {
      journalDate: date,
      lines: lines.map((l) => ({...l})),
      // What the Admin sees: item names and units as they were when asked.
      display: lines.map((l: ParsedLine) => {
        const item = read.items.get(l.itemId);
        return {
          itemId: l.itemId,
          itemName: item?.name ?? l.itemId,
          baseUnit: item?.baseUnit ?? "",
          kind: l.kind,
          qtyMilli: l.kind === "COUNT" ? l.countedMilli : l.qtyMilli,
        };
      }),
      recipeChanges: changes.map((c, i) => ({
        ...targetFields(c.target),
        productName: pools[i].name,
        currentRecipe: pools[i].recipe,
        proposedRecipe: c.recipe,
      })),
      productKeys: changes.flatMap((c) => ("productKey" in c.target ? [c.target.productKey] : [])),
      itemIds: changes.flatMap((c) => ("itemId" in c.target ? [c.target.itemId] : [])),
      reason,
      requestedBy: by,
      requestedAt: now,
    };

    if (!isAdmin) {
      tx.create(ref, {...record, status: "pending", decidedBy: null, decidedAt: null, decisionNote: null});
      return {requestId: reqId, status: "pending", recorded: 0, alreadyRecorded: false, skipped: [], belowZero: []};
    }

    const result = writeJournal(tx, db, read, {
      reqId,
      date,
      lines,
      by: {byUid: caller.uid, byName: caller.name},
      fn: "requestProduction",
    });
    pools.forEach((p, i) => applyRecipe(tx, db, p, changes[i].recipe, by, reqId));
    tx.create(ref, {
      ...record,
      status: "approved",
      decidedBy: by,
      decidedAt: now,
      decisionNote: "Saved by an Admin — applied at once.",
    });
    return {requestId: reqId, status: "approved", ...result};
  });
});
