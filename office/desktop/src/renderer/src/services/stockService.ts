import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { BaseUnit } from "@technofluid/core";
import { db, functions } from "@/lib/firebase";
import { friendlyError } from "./callErrors";

/**
 * Stock: items (product pools, raw materials, consumables) and the append-only diary of
 * movements. The app only READS these directly (security rules); every change goes
 * through a Cloud Function, which checks the role and keeps on-hand and diary in step.
 * Quantities are whole milli base units (mL / g). No money here, ever.
 */

export type ItemKind = "product_pool" | "raw_material" | "consumable" | "premix" | "blend";

/** Premixes and blends: "half-made" oils with recipes of their own (Sharnya, 23 Oct 2026). */
export const isMix = (kind: ItemKind) => kind === "premix" || kind === "blend";

/** Mixed on the spot (making a product uses its raw materials) or kept in stock (taken as itself). */
export type StockMode = "breakDown" | "stocked";

const KINDS: ItemKind[] = ["product_pool", "raw_material", "consumable", "premix", "blend"];
const kindOf = (x: unknown): ItemKind => (KINDS.includes(x as ItemKind) ? (x as ItemKind) : "product_pool");

export interface StockItem {
  id: string;
  kind: ItemKind;
  name: string;
  /** Raw materials: the short name recipes use, e.g. "w150". */
  code: string | null;
  productKey: string | null;
  /** "L" when the unit isn't set yet — check `unitSet` first. */
  baseUnit: BaseUnit;
  /** false for an item imported without a unit: no stock until an Admin sets it. */
  unitSet: boolean;
  /** Premixes / blends: their own recipe ("code/percent") and Admin-set alternates. */
  recipe: string[];
  recipeAlternates: string[];
  /** Premixes / blends only; "breakDown" (mixed on the spot) unless an Admin changed it. */
  stockMode: StockMode | null;
  densityKgPerL: number | null;
  aliases: string[];
  onHandMilli: number;
  lastMovementAt: Date | null;
}

export type MovementType =
  | "OPENING"
  | "IN"
  | "OUT"
  | "COUNT_ADJUSTMENT"
  | "REVERSAL"
  | "PRODUCTION_IN"
  | "PRODUCTION_CONSUME";

export interface StockMovement {
  id: string;
  itemId: string;
  itemName: string;
  itemKind: ItemKind;
  baseUnit: BaseUnit;
  type: MovementType;
  /** Signed: + in, − out. */
  qtyMilli: number;
  onHandAfterMilli: number;
  countedMilli: number | null;
  note: string | null;
  journalDate: string;
  reversesId: string | null;
  reversedById: string | null;
  replacesId: string | null;
  /** Production: the "made" line this belongs to, and what was made (for "used" lines). */
  productionId: string | null;
  producedItemName: string | null;
  byName: string;
  createdAt: Date | null;
}

const unit = (u: unknown): BaseUnit => (u === "kg" || u === "piece" ? u : "L");
const date = (x: unknown): Date | null =>
  x && typeof (x as { toDate?: () => Date }).toDate === "function" ? (x as { toDate: () => Date }).toDate() : null;
const str = (x: unknown): string | null => (typeof x === "string" && x ? x : null);

function toItem(id: string, d: DocumentData): StockItem {
  return {
    id,
    kind: kindOf(d.kind),
    name: typeof d.name === "string" ? d.name : id,
    code: str(d.code),
    productKey: str(d.productKey),
    baseUnit: unit(d.baseUnit),
    unitSet: d.baseUnit === "L" || d.baseUnit === "kg" || d.baseUnit === "piece",
    recipe: Array.isArray(d.recipe) ? d.recipe.filter((x: unknown): x is string => typeof x === "string") : [],
    recipeAlternates: Array.isArray(d.recipeAlternates)
      ? d.recipeAlternates.filter((x: unknown): x is string => typeof x === "string")
      : [],
    stockMode: d.kind === "premix" || d.kind === "blend" ? (d.stockMode === "stocked" ? "stocked" : "breakDown") : null,
    densityKgPerL: typeof d.densityKgPerL === "number" ? d.densityKgPerL : null,
    aliases: Array.isArray(d.aliases) ? d.aliases.filter((a: unknown): a is string => typeof a === "string") : [],
    onHandMilli: typeof d.onHandMilli === "number" ? d.onHandMilli : 0,
    lastMovementAt: date(d.lastMovementAt),
  };
}

function toMovement(id: string, d: DocumentData): StockMovement {
  return {
    id,
    itemId: String(d.itemId ?? ""),
    itemName: String(d.itemName ?? ""),
    itemKind: kindOf(d.itemKind),
    baseUnit: unit(d.baseUnit),
    type: d.type as MovementType,
    qtyMilli: typeof d.qtyMilli === "number" ? d.qtyMilli : 0,
    onHandAfterMilli: typeof d.onHandAfterMilli === "number" ? d.onHandAfterMilli : 0,
    countedMilli: typeof d.countedMilli === "number" ? d.countedMilli : null,
    note: str(d.note),
    journalDate: String(d.journalDate ?? ""),
    reversesId: str(d.reversesId),
    reversedById: str(d.reversedById),
    replacesId: str(d.replacesId),
    productionId: str(d.productionId),
    producedItemName: str(d.producedItemName),
    byName: typeof d.byName === "string" && d.byName ? d.byName : "Someone",
    createdAt: date(d.createdAt),
  };
}

/** Every stock item that isn't deleted, sorted by name. */
export function watchStockItems(onChange: (items: StockItem[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, "stockItems"), where("deleted", "==", false)),
    (snap) => onChange(snap.docs.map((d) => toItem(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))),
    onError,
  );
}

export type MovementFilter =
  | { itemId: string }
  | { journalDate: string }
  | { latest: number }
  /** Business dates from–to, inclusive ("YYYY-MM-DD"). */
  | { from: string; to: string };

/**
 * Diary lines, newest first: for one item, one business date, a date range, or the
 * latest N. Each query filters on a single field (no composite index); sorting happens here.
 */
export function watchMovements(
  filter: MovementFilter,
  onChange: (movements: StockMovement[]) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  const constraints: QueryConstraint[] =
    "itemId" in filter
      ? [where("itemId", "==", filter.itemId)]
      : "journalDate" in filter
        ? [where("journalDate", "==", filter.journalDate)]
        : "from" in filter
          ? [
              where("journalDate", ">=", filter.from),
              where("journalDate", "<=", filter.to),
              orderBy("journalDate", "desc"),
              limit(2000),
            ]
          : [orderBy("createdAt", "desc"), limit(filter.latest)];
  return onSnapshot(
    query(collection(db, "stockMovements"), ...constraints),
    (snap) =>
      onChange(
        snap.docs
          .map((d) => toMovement(d.id, d.data({ serverTimestamps: "estimate" })))
          .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)),
      ),
    onError,
  );
}

/* ─── Changes (Cloud Functions) ────────────────────────────────────────────────── */

export type JournalLine =
  | { itemId: string; kind: "OPENING"; qtyMilli: number; note?: string }
  | { itemId: string; kind: "IN" | "OUT"; qtyMilli: number; note: string }
  | { itemId: string; kind: "COUNT"; countedMilli: number; note: string }
  /** A product made in the factory. */
  | { itemId: string; kind: "MADE"; qtyMilli: number; note?: string }
  /** Something that production run used up; `forLine` = index of its MADE line. */
  | { itemId: string; kind: "USED"; qtyMilli: number; forLine: number; note?: string };

export interface RecordResult {
  recorded: number;
  alreadyRecorded: boolean;
  skipped: { line: number; why: string }[];
  belowZero: { itemId: string; name: string; onHandMilli: number }[];
}

async function call<Req, Res>(name: string, data: Req): Promise<Res> {
  try {
    return (await httpsCallable<Req, Res>(functions, name)(data)).data;
  } catch (error) {
    throw new Error(await friendlyError(error));
  }
}

/** A fresh id for one save — sending it again (a retry) records nothing twice. */
export function newRequestId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function recordStockMovements(requestId: string, journalDate: string, lines: JournalLine[]): Promise<RecordResult> {
  return call("recordStockMovements", { requestId, journalDate, lines });
}

/** Undo a line; with `replacementQtyMilli` it's an edit (undo + corrected line). */
export function reverseStockMovement(
  movementId: string,
  note: string,
  replacementQtyMilli?: number,
): Promise<{ alreadyDone: boolean; onHandMilli: number | null; belowZero: boolean }> {
  return call("reverseStockMovement", {
    movementId,
    note,
    ...(replacementQtyMilli !== undefined ? { replacementQtyMilli } : {}),
  });
}

export interface StockItemInput {
  itemId?: string;
  kind?: "raw_material" | "consumable" | "premix" | "blend";
  /** Premixes / blends; only an Admin may change it. */
  stockMode?: StockMode;
  name: string;
  code?: string | null;
  /** null only to keep an imported item's unit unset. */
  baseUnit: BaseUnit | null;
  densityKgPerL?: number | null;
  aliases?: string[];
}

export function saveStockItem(input: StockItemInput): Promise<{ itemId: string }> {
  return call("saveStockItem", input);
}

export function deleteStockItem(itemId: string): Promise<{ itemId: string }> {
  return call("saveStockItem", { itemId, deleted: true });
}

/** Creates any missing product stock pools (one per product + grade). */
export function ensureProductPools(): Promise<{ created: number; updated: number; pools: number }> {
  return call("ensureProductPools", {});
}
