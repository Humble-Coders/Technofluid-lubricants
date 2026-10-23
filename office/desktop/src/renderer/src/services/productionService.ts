import { collection, limit, onSnapshot, orderBy, query, where, type DocumentData, type Unsubscribe } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { friendlyError } from "./callErrors";
import type { RecipeLineInput, RecipeTarget } from "./recipeService";
import type { JournalLine, RecordResult } from "./stockService";

/**
 * Production entries that changed a recipe (Sharnya, 22 Oct 2026). Stock & Production's
 * entry waits here for an Admin — nothing changes in stock until it's approved. Read
 * directly (Admin and Stock & Production, by the rules); written only by Cloud Functions.
 */

export type ProductionStatus = "pending" | "approved" | "rejected";

export interface ProductionRequest {
  id: string;
  journalDate: string;
  /** What will be saved, as names and units when it was entered. */
  display: { itemId: string; itemName: string; baseUnit: string; kind: string; qtyMilli: number }[];
  recipeChanges: { key: string; productName: string; currentRecipe: string[]; proposedRecipe: string[] }[];
  reason: string | null;
  status: ProductionStatus;
  requestedBy: string;
  requestedAt: Date | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
}

const date = (x: unknown): Date | null =>
  x && typeof (x as { toDate?: () => Date }).toDate === "function" ? (x as { toDate: () => Date }).toDate() : null;
const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
const list = (x: unknown): Record<string, unknown>[] =>
  Array.isArray(x) ? x.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null) : [];

function toRequest(id: string, d: DocumentData): ProductionRequest {
  return {
    id,
    journalDate: String(d.journalDate ?? ""),
    display: list(d.display).map((l) => ({
      itemId: String(l.itemId ?? ""),
      itemName: String(l.itemName ?? ""),
      baseUnit: String(l.baseUnit ?? ""),
      kind: String(l.kind ?? ""),
      qtyMilli: typeof l.qtyMilli === "number" ? l.qtyMilli : 0,
    })),
    recipeChanges: list(d.recipeChanges).map((c) => ({
      key: String(c.productKey ?? c.itemId ?? ""),
      productName: String(c.productName ?? ""),
      currentRecipe: strings(c.currentRecipe),
      proposedRecipe: strings(c.proposedRecipe),
    })),
    reason: typeof d.reason === "string" ? d.reason : null,
    status: (["pending", "approved", "rejected"].includes(d.status) ? d.status : "pending") as ProductionStatus,
    requestedBy: typeof d.requestedBy?.name === "string" ? d.requestedBy.name : "Someone",
    requestedAt: date(d.requestedAt),
    decidedBy: typeof d.decidedBy?.name === "string" ? d.decidedBy.name : null,
    decidedAt: date(d.decidedAt),
    decisionNote: typeof d.decisionNote === "string" ? d.decisionNote : null,
  };
}

export type ProductionFilter = { pending: true } | { latest: number };

/** Entries newest first: the ones waiting, or the latest N. */
export function watchProductionRequests(
  filter: ProductionFilter,
  onChange: (requests: ProductionRequest[]) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  const base = collection(db, "productionRequests");
  const q = "pending" in filter ? query(base, where("status", "==", "pending")) : query(base, orderBy("requestedAt", "desc"), limit(filter.latest));
  return onSnapshot(
    q,
    (snap) =>
      onChange(
        snap.docs
          .map((d) => toRequest(d.id, d.data({ serverTimestamps: "estimate" })))
          .sort((a, b) => (b.requestedAt?.getTime() ?? 0) - (a.requestedAt?.getTime() ?? 0)),
      ),
    onError,
  );
}

async function call<Req, Res>(name: string, data: Req): Promise<Res> {
  try {
    return (await httpsCallable<Req, Res>(functions, name)(data)).data;
  } catch (error) {
    throw new Error(await friendlyError(error));
  }
}

export type RecipeChangeInput = RecipeTarget & { recipe: RecipeLineInput[] };

export type ProductionResult = RecordResult & { requestId: string; status: ProductionStatus };

/**
 * Save a journal entry whose production run changed a recipe. Stock & Production's
 * waits for an Admin ("pending"); an Admin's is applied at once ("approved").
 */
export function requestProduction(
  requestId: string,
  journalDate: string,
  lines: JournalLine[],
  recipeChanges: RecipeChangeInput[],
  reason: string,
): Promise<ProductionResult> {
  return call("requestProduction", {
    requestId,
    journalDate,
    lines,
    recipeChanges,
    ...(reason.trim() ? { reason: reason.trim() } : {}),
  });
}

/** Admin approves (recipe + stock saved together) or rejects (note required). */
export function decideProductionRequest(
  requestId: string,
  decision: "approve" | "reject",
  note: string,
): Promise<RecordResult & { status: ProductionStatus }> {
  return call("decideProductionRequest", { requestId, decision, ...(note.trim() ? { note: note.trim() } : {}) });
}
