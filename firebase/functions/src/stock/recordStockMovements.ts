import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {
  bad,
  ITEMS,
  journalDate,
  REQUESTS,
  MOVEMENTS,
  nonNegativeMilli,
  note,
  positiveMilli,
  requestId as parseRequestId,
  type MovementType,
} from "./stockModel";

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

type LineIn = {
  itemId?: unknown;
  kind?: unknown;
  qtyMilli?: unknown;
  countedMilli?: unknown;
  forLine?: unknown;
  note?: unknown;
};

type ParsedLine =
  | { itemId: string; kind: "OPENING"; qtyMilli: number; note: string | null }
  | { itemId: string; kind: "IN" | "OUT"; qtyMilli: number; note: string }
  | { itemId: string; kind: "COUNT"; countedMilli: number; note: string }
  | { itemId: string; kind: "MADE"; qtyMilli: number; note: string | null }
  | { itemId: string; kind: "USED"; qtyMilli: number; forLine: number; note: string | null };

const MAX_LINES = 150;

function parseLine(raw: LineIn, index: number): ParsedLine {
  const label = `Line ${index + 1}`;
  if (typeof raw !== "object" || raw === null) bad(`${label} is empty.`);
  const itemId = typeof raw.itemId === "string" ? raw.itemId.trim() : "";
  if (!itemId) bad(`${label}: choose an item.`);
  switch (raw.kind) {
  case "OPENING":
    return {itemId, kind: "OPENING", qtyMilli: nonNegativeMilli(raw.qtyMilli, label), note: note(raw.note, label, true)};
  case "IN":
  case "OUT":
    return {itemId, kind: raw.kind, qtyMilli: positiveMilli(raw.qtyMilli, label), note: note(raw.note, label) as string};
  case "COUNT":
    return {itemId, kind: "COUNT", countedMilli: nonNegativeMilli(raw.countedMilli, label), note: note(raw.note, label) as string};
  case "MADE":
    return {itemId, kind: "MADE", qtyMilli: positiveMilli(raw.qtyMilli, label), note: note(raw.note, label, true)};
  case "USED":
    if (typeof raw.forLine !== "number" || !Number.isInteger(raw.forLine)) bad(`${label}: which production line is this for?`);
    return {
      itemId,
      kind: "USED",
      qtyMilli: positiveMilli(raw.qtyMilli, label),
      forLine: raw.forLine,
      note: note(raw.note, label, true),
    };
  default:
    return bad(`${label}: unknown kind "${String(raw.kind)}".`);
  }
}

export const recordStockMovements = onCall({region: "us-central1"}, async (request) => {
  const caller = await requireRole(request, ["admin", "supervisor"]);
  const reqId = parseRequestId(request.data?.requestId);
  const date = journalDate(request.data?.journalDate);
  const rawLines = request.data?.lines;
  if (!Array.isArray(rawLines) || rawLines.length === 0) bad("Add at least one line.");
  if (rawLines.length > MAX_LINES) bad(`At most ${MAX_LINES} lines at once.`);
  const lines = rawLines.map((l: LineIn, i: number) => parseLine(l, i));
  lines.forEach((l, i) => {
    if (l.kind === "USED" && lines[l.forLine]?.kind !== "MADE") {
      bad(`Line ${i + 1}: it must belong to a "made" line in the same entry.`);
    }
  });

  const db = admin.firestore();
  const movementRef = (i: number) => db.collection(MOVEMENTS).doc(`${reqId}-${i}`);
  const requestRef = db.collection(REQUESTS).doc(reqId);

  return db.runTransaction(async (tx) => {
    // Already recorded (a retry)? Then answer without writing anything.
    const previous = await tx.get(requestRef);
    if (previous.exists) return {recorded: 0, alreadyRecorded: true, skipped: [], belowZero: []};

    // Read every item once.
    const ids = [...new Set(lines.map((l) => l.itemId))];
    const snaps = await Promise.all(ids.map((id) => tx.get(db.collection(ITEMS).doc(id))));
    const items = new Map<string, {name: string; kind: string; baseUnit: string; onHand: number; hasHistory: boolean}>();
    snaps.forEach((snap, i) => {
      const d = snap.data();
      if (!snap.exists || !d || d.deleted === true) {
        throw new HttpsError("not-found", `Stock item "${ids[i]}" doesn't exist.`);
      }
      items.set(ids[i], {
        name: String(d.name ?? ids[i]),
        kind: String(d.kind ?? ""),
        baseUnit: String(d.baseUnit ?? ""),
        onHand: typeof d.onHandMilli === "number" ? d.onHandMilli : 0,
        hasHistory: Boolean(d.lastMovementAt),
      });
    });

    const now = FieldValue.serverTimestamp();
    const by = {byUid: caller.uid, byName: caller.name};
    const skipped: { line: number; why: string }[] = [];
    const touched = new Set<string>();
    let recorded = 0;

    lines.forEach((line, i) => {
      const item = items.get(line.itemId)!;
      let type: MovementType;
      let qty: number;
      if (line.kind === "OPENING") {
        if (item.hasHistory || item.onHand !== 0) {
          bad(`Line ${i + 1}: ${item.name} already has stock history — use a count correction instead.`);
        }
        type = "OPENING";
        qty = line.qtyMilli;
        item.hasHistory = true;
      } else if (line.kind === "IN" || line.kind === "OUT") {
        type = line.kind;
        qty = line.kind === "IN" ? line.qtyMilli : -line.qtyMilli;
      } else if (line.kind === "MADE") {
        if (item.kind !== "product_pool") bad(`Line ${i + 1}: only products are made — ${item.name} isn't a product.`);
        type = "PRODUCTION_IN";
        qty = line.qtyMilli;
      } else if (line.kind === "USED") {
        type = "PRODUCTION_CONSUME";
        qty = -line.qtyMilli;
      } else if (line.kind === "COUNT") {
        qty = line.countedMilli - item.onHand;
        if (qty === 0) {
          skipped.push({line: i + 1, why: `${item.name} already shows that amount`});
          return;
        }
        type = "COUNT_ADJUSTMENT";
      } else {
        return;
      }
      if (qty === 0) {
        skipped.push({line: i + 1, why: "nothing to record"});
        return;
      }
      item.onHand += qty;
      item.hasHistory = true;
      touched.add(line.itemId);
      tx.create(movementRef(i), {
        itemId: line.itemId,
        itemName: item.name,
        itemKind: item.kind,
        baseUnit: item.baseUnit,
        type,
        qtyMilli: qty,
        onHandAfterMilli: item.onHand,
        ...(line.kind === "COUNT" ? {countedMilli: line.countedMilli} : {}),
        ...(line.kind === "MADE" ? {productionId: movementRef(i).id} : {}),
        ...(line.kind === "USED" ?
          {productionId: movementRef(line.forLine).id, producedItemName: items.get(lines[line.forLine].itemId)?.name ?? null} :
          {}),
        note: line.note ?? (line.kind === "MADE" ? "Made in factory" : line.kind === "USED" ? "Used in production" : null),
        journalDate: date,
        requestId: reqId,
        reversesId: null,
        reversedById: null,
        ...by,
        createdAt: now,
      });
      recorded += 1;
    });

    tx.create(requestRef, {fn: "recordStockMovements", recorded, journalDate: date, ...by, createdAt: now});

    for (const id of touched) {
      const item = items.get(id)!;
      tx.update(db.collection(ITEMS).doc(id), {
        onHandMilli: item.onHand,
        lastMovementAt: now,
        updatedAt: now,
      });
    }

    const belowZero = [...items.entries()]
      .filter(([id, item]) => touched.has(id) && item.onHand < 0)
      .map(([id, item]) => ({itemId: id, name: item.name, onHandMilli: item.onHand}));
    return {recorded, alreadyRecorded: false, skipped, belowZero};
  });
});
