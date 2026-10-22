import { collection, limit, onSnapshot, orderBy, query, where, type DocumentData, type Unsubscribe } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { friendlyError } from "./callErrors";

/**
 * Recipe changes with Admin approval. Requests are read directly (Admin and Stock &
 * Production, by the security rules); asking and deciding go through Cloud Functions.
 * An approved recipe updates every pack size of the product + grade.
 */

export type RequestStatus = "pending" | "approved" | "rejected" | "superseded";

export interface RecipeRequest {
  id: string;
  productKey: string;
  productName: string;
  /** Gaurav's format: "code/percent" ("w70/" = no percent). */
  currentRecipe: string[];
  proposedRecipe: string[];
  reason: string | null;
  status: RequestStatus;
  requestedBy: string;
  requestedAt: Date | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
}

const date = (x: unknown): Date | null =>
  x && typeof (x as { toDate?: () => Date }).toDate === "function" ? (x as { toDate: () => Date }).toDate() : null;
const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);

function toRequest(id: string, d: DocumentData): RecipeRequest {
  return {
    id,
    productKey: String(d.productKey ?? ""),
    productName: String(d.productName ?? ""),
    currentRecipe: strings(d.currentRecipe),
    proposedRecipe: strings(d.proposedRecipe),
    reason: typeof d.reason === "string" ? d.reason : null,
    status: (["pending", "approved", "rejected", "superseded"].includes(d.status) ? d.status : "pending") as RequestStatus,
    requestedBy: typeof d.requestedBy?.name === "string" ? d.requestedBy.name : "Someone",
    requestedAt: date(d.requestedAt),
    decidedBy: typeof d.decidedBy?.name === "string" ? d.decidedBy.name : null,
    decidedAt: date(d.decidedAt),
    decisionNote: typeof d.decisionNote === "string" ? d.decisionNote : null,
  };
}

export type RequestFilter = { pending: true } | { productKey: string } | { latest: number };

/** Requests, newest first: those waiting, those for one product, or the latest N. */
export function watchRecipeRequests(
  filter: RequestFilter,
  onChange: (requests: RecipeRequest[]) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  const base = collection(db, "recipeChangeRequests");
  const q =
    "pending" in filter
      ? query(base, where("status", "==", "pending"))
      : "productKey" in filter
        ? query(base, where("productKey", "==", filter.productKey))
        : query(base, orderBy("requestedAt", "desc"), limit(filter.latest));
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

export interface RecipeLineInput {
  code: string;
  /** Percent (e.g. 12.5), or null when the recipe gives none. */
  percent: number | null;
}

async function call<Req, Res>(name: string, data: Req): Promise<Res> {
  try {
    return (await httpsCallable<Req, Res>(functions, name)(data)).data;
  } catch (error) {
    throw new Error(await friendlyError(error));
  }
}

export interface AlternateInput {
  /** The recipe line it can replace. */
  for: string;
  code: string;
  percent: number;
}

/**
 * Ask for a recipe change (percents must total 100%). An Admin's own change is
 * approved at once; only an Admin may send `alternates`.
 */
export function requestRecipeChange(
  productKey: string,
  recipe: RecipeLineInput[],
  reason: string,
  alternates?: AlternateInput[],
): Promise<{ requestId: string; status: RequestStatus }> {
  return call("requestRecipeChange", {
    productKey,
    recipe,
    ...(reason.trim() ? { reason: reason.trim() } : {}),
    ...(alternates ? { alternates } : {}),
  });
}

/** Admin approves (recipe applied to every pack) or rejects (note required). */
export function decideRecipeChange(
  requestId: string,
  decision: "approve" | "reject",
  note: string,
): Promise<{ status: RequestStatus }> {
  return call("decideRecipeChange", { requestId, decision, ...(note.trim() ? { note: note.trim() } : {}) });
}
