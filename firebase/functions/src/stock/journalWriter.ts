import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

import {
  bad,
  ITEMS,
  REQUESTS,
  MOVEMENTS,
  nonNegativeMilli,
  note,
  positiveMilli,
  type MovementType,
} from "./stockModel";

/**
 * Checking and writing journal lines — shared by recordStockMovements (saved straight
 * away) and decideProductionRequest (saved when an Admin approves a production run
 * that came with a recipe change). See recordStockMovements for what each kind means.
 */

type LineIn = {
  itemId?: unknown;
  kind?: unknown;
  qtyMilli?: unknown;
  countedMilli?: unknown;
  forLine?: unknown;
  note?: unknown;
};

export type ParsedLine =
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

/** Checks a request's lines (count, kinds, USED → MADE links). */
export function parseJournalLines(rawLines: unknown): ParsedLine[] {
  if (!Array.isArray(rawLines) || rawLines.length === 0) bad("Add at least one line.");
  if (rawLines.length > MAX_LINES) bad(`At most ${MAX_LINES} lines at once.`);
  const lines = rawLines.map((l: LineIn, i: number) => parseLine(l, i));
  lines.forEach((l, i) => {
    if (l.kind === "USED" && lines[l.forLine]?.kind !== "MADE") {
      bad(`Line ${i + 1}: it must belong to a "made" line in the same entry.`);
    }
  });
  return lines;
}

export interface JournalResult {
  recorded: number;
  alreadyRecorded: boolean;
  skipped: { line: number; why: string }[];
  belowZero: { itemId: string; name: string; onHandMilli: number }[];
}

/** Reads every item a request touches (all reads — call before any write in the transaction). */
export async function readJournalItems(
  tx: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  reqId: string,
  lines: ParsedLine[],
) {
  const previous = await tx.get(db.collection(REQUESTS).doc(reqId));
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
  return {alreadyRecorded: previous.exists, items};
}

/**
 * Writes the lines as diary entries and updates each item's on-hand, plus the
 * stockRequests/{reqId} record that makes a retry harmless. `extra` is added to
 * every diary line (e.g. who approved it).
 */
export function writeJournal(
  tx: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  read: Awaited<ReturnType<typeof readJournalItems>>,
  args: {
    reqId: string;
    date: string;
    lines: ParsedLine[];
    by: { byUid: string; byName: string };
    fn: string;
    extra?: Record<string, unknown>;
  },
): JournalResult {
  if (read.alreadyRecorded) return {recorded: 0, alreadyRecorded: true, skipped: [], belowZero: []};
  const {reqId, date, lines, by, fn, extra = {}} = args;
  const items = read.items;
  const movementRef = (i: number) => db.collection(MOVEMENTS).doc(`${reqId}-${i}`);
  const requestRef = db.collection(REQUESTS).doc(reqId);
  const now = FieldValue.serverTimestamp();
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
      ...extra,
      createdAt: now,
    });
    recorded += 1;
  });

  tx.create(requestRef, {fn, recorded, journalDate: date, ...by, createdAt: now});

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
}
