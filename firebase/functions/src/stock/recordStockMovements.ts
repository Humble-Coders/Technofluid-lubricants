import * as admin from "firebase-admin";
import {onCall} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {parseJournalLines, readJournalItems, writeJournal} from "./journalWriter";
import {journalDate, requestId as parseRequestId} from "./stockModel";

/**
 * Records stock lines — used by the Daily stock journal, Opening stock and the
 * "correct the count" box on Live stock. Admin or Stock & Production.
 *
 * Line kinds (what the person means → what is written):
 *  - OPENING {qtyMilli}: the starting count of an item that has no history yet.
 *  - IN / OUT {qtyMilli, note}: stock came in / went out, with a reason.
 *  - COUNT {countedMilli, note}: "there is actually X" → a COUNT_ADJUSTMENT line
 *    for the difference (nothing written when it already matches).
 *  - MADE {qtyMilli, note?}: a product (stock pool) made in the factory →
 *    PRODUCTION_IN. USED {qtyMilli, forLine, note?}: something that run used up
 *    → PRODUCTION_CONSUME, linked to the MADE line (`productionId`). The app
 *    proposes USED lines from the recipe and the person confirms them first
 *    (decision #20); manufacturing never touches money / Humble Ledger.
 *
 * All lines are written in ONE transaction, with each item's on-hand updated
 * in the same step. Stock may go below zero (Sharnya, 15 Oct 2026); those items
 * come back as warnings so the app can flag them.
 *
 * Retry-safe: each request leaves a stockRequests/{requestId} record in the
 * same transaction, so sending the same request again records nothing new.
 */

export const recordStockMovements = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin", "supervisor"]);
  const reqId = parseRequestId(request.data?.requestId);
  const date = journalDate(request.data?.journalDate);
  const lines = parseJournalLines(request.data?.lines);

  const db = admin.firestore();
  return db.runTransaction(async (tx) => {
    const read = await readJournalItems(tx, db, reqId, lines);
    return writeJournal(tx, db, read, {
      reqId,
      date,
      lines,
      by: {byUid: caller.uid, byName: caller.name},
      fn: "recordStockMovements",
    });
  });
});
