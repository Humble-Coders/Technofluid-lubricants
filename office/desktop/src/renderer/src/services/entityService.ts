import { collection, onSnapshot, orderBy, query, where, type DocumentData, type Unsubscribe } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { EntityAddress, EntityInput, EntityKind, OpeningBalance, PriceTier, SyncStatus } from "@technofluid/core";
import { db, functions } from "@/lib/firebase";
import { friendlyError } from "./callErrors";
import { newRequestId } from "./stockService";

/**
 * Customers & suppliers ("entities"). Profiles are read straight from Firestore (Admin +
 * Accounts, by the rules); every change goes through a Cloud Function. Balances and
 * statements are NOT here — they come from Humble Ledger via ledgerService.
 */

export interface EntityRow {
  id: string;
  name: string;
  kinds: EntityKind[];
  phones: string[];
  email: string | null;
  gstin: string | null;
  gstVerified: { legalName: string; tradeName: string; status: string; verifiedAt: string } | null;
  address: EntityAddress;
  priceTier: PriceTier | null;
  creditLimitPaise: number | null;
  notes: string | null;
  distributorId: string | null;
  isWalkIn: boolean;
  isActive: boolean;
  opening: OpeningBalance | null;
  syncStatus: SyncStatus;
  hlSyncError: string | null;
  importNotes: string[];
  createdAt: Date | null;
}

export interface EntityHistoryRow {
  id: string;
  at: Date | null;
  by: string;
  action: "create" | "edit" | "archive" | "unarchive" | "link" | "unlink";
  changes: Record<string, { from: unknown; to: unknown }>;
  reason: string | null;
}

const date = (x: unknown): Date | null =>
  x && typeof (x as { toDate?: () => Date }).toDate === "function" ? (x as { toDate: () => Date }).toDate() : null;
const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
const str = (x: unknown) => (typeof x === "string" ? x : "");

function toEntity(id: string, d: DocumentData): EntityRow {
  const a = (d.address ?? {}) as Record<string, unknown>;
  return {
    id,
    name: str(d.name) || id,
    kinds: strings(d.kinds).filter((k): k is EntityKind => k === "customer" || k === "supplier"),
    phones: strings(d.phones),
    email: typeof d.email === "string" ? d.email : null,
    gstin: typeof d.gstin === "string" ? d.gstin : null,
    gstVerified: d.gstVerified ?? null,
    address: { line1: str(a.line1), line2: str(a.line2), city: str(a.city), district: str(a.district), pincode: str(a.pincode), stateCode: str(a.stateCode) || null },
    priceTier: d.priceTier === "Dealer" || d.priceTier === "Distributor" ? d.priceTier : null,
    creditLimitPaise: typeof d.creditLimitPaise === "number" ? d.creditLimitPaise : null,
    notes: typeof d.notes === "string" ? d.notes : null,
    distributorId: typeof d.distributorId === "string" ? d.distributorId : null,
    isWalkIn: d.isWalkIn === true,
    isActive: d.isActive !== false,
    opening: d.opening ?? null,
    syncStatus: d.syncStatus === "SYNCED" || d.syncStatus === "FAILED" ? d.syncStatus : "PENDING",
    hlSyncError: typeof d.hlSyncError === "string" ? d.hlSyncError : null,
    importNotes: strings(d.importNotes),
    createdAt: date(d.createdAt),
  };
}

/** Every entity (archived too), by name. */
export function watchEntities(onChange: (rows: EntityRow[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, "entities"), where("deleted", "==", false), orderBy("nameLower")),
    (snap) => onChange(snap.docs.map((d) => toEntity(d.id, d.data({ serverTimestamps: "estimate" })))),
    onError,
  );
}

export function watchEntityHistory(entityId: string, onChange: (rows: EntityHistoryRow[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, "entities", entityId, "history"), orderBy("at", "desc")),
    (snap) =>
      onChange(
        snap.docs.map((d) => {
          const x = d.data({ serverTimestamps: "estimate" });
          return {
            id: d.id,
            at: date(x.at),
            by: str(x.by?.name) || "Someone",
            action: x.action,
            changes: x.changes ?? {},
            reason: typeof x.reason === "string" ? x.reason : null,
          } as EntityHistoryRow;
        }),
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

export interface SaveResult {
  entityId: string;
  changed: boolean;
  warnings: string[];
}

/** Create (no entityId) or edit. The opening balance can only be given on create. */
export function saveEntity(
  input: EntityInput,
  opts: { entityId?: string; allowSameGstin?: boolean; gstVerified?: EntityRow["gstVerified"]; requestId?: string } = {},
): Promise<SaveResult> {
  return call("saveEntity", {
    requestId: opts.requestId ?? newRequestId(),
    input,
    ...(opts.entityId ? { entityId: opts.entityId } : {}),
    ...(opts.allowSameGstin ? { allowSameGstin: true } : {}),
    ...(opts.gstVerified !== undefined ? { gstVerified: opts.gstVerified } : {}),
  });
}

export function setEntityActive(entityId: string, active: boolean, reason: string): Promise<{ entityId: string; active: boolean }> {
  return call("setEntityActive", { requestId: newRequestId(), entityId, active, reason });
}

export function linkEntityToDistributor(entityId: string, distributorId: string | null): Promise<{ entityId: string; distributorId: string | null }> {
  return call("linkEntityToDistributor", { requestId: newRequestId(), entityId, distributorId });
}

export interface ImportSummary {
  dryRun: boolean;
  created: { distributorId: string; entityId: string | null; name: string; stateFrom: "gstin" | "needed"; notes: string[] }[];
  skipped: { distributorId: string; name: string; reason: string }[];
  stateFromGstin: string[];
  stateNeeded: string[];
}

export function importDistributorEntities(dryRun: boolean): Promise<ImportSummary> {
  return call("importDistributorEntities", { dryRun });
}

export function ensureSystemEntities(): Promise<{ created: string[] }> {
  return call("ensureSystemEntities", {});
}

export function retryEntitySync(entityId: string): Promise<{ entityId: string; syncStatus: string }> {
  return call("retryEntitySync", { entityId });
}

export interface GstDetails {
  legalName: string;
  tradeName: string;
  status: string;
  address: string;
  stateCode: string | null;
  pincode: string;
}

/**
 * "Fill from GST" — the existing website function verifyGST (not changed here). In the
 * emulator it usually says GST lookup is disabled; then the details are typed by hand.
 */
export async function lookUpGstin(gstin: string): Promise<GstDetails> {
  const r = await call<{ gstNumber: string }, Record<string, unknown>>("verifyGST", { gstNumber: gstin });
  const s = (x: unknown) => (typeof x === "string" ? x : "");
  return {
    legalName: s(r.legalName ?? r.legal_name ?? r.lgnm),
    tradeName: s(r.tradeName ?? r.trade_name ?? r.tradeNam),
    status: s(r.status ?? r.sts),
    address: s(r.address ?? r.principalAddress),
    stateCode: gstin.slice(0, 2),
    pincode: s(r.pincode ?? r.pinCode),
  };
}

export interface DistributorChoice {
  id: string;
  name: string;
  gstNumber: string | null;
}

/** Approved, active website distributors (Admin only — for "Link distributor"). */
export function watchApprovedDistributors(onChange: (rows: DistributorChoice[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, "distributors"), where("status", "==", "approved")),
    (snap) =>
      onChange(
        snap.docs
          .filter((d) => d.data().isActive === true && d.data().deleted !== true)
          .map((d) => ({ id: d.id, name: str(d.data().name) || d.id, gstNumber: typeof d.data().gstNumber === "string" ? d.data().gstNumber : null }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    onError,
  );
}
