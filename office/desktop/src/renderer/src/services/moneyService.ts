import { FirebaseError } from "firebase/app";
import { collection, doc, onSnapshot, orderBy, query, where, type DocumentData, type Unsubscribe } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { DEFAULT_REGISTERS, type ExpenseGst, type MoneyAccountRef, type RegisterKind } from "@technofluid/core";
import { db, functions } from "@/lib/firebase";
import { friendlyError } from "./callErrors";
import { newRequestId } from "./stockService";

/**
 * Money in & out (registers, expense categories, entries). Read straight from Firestore
 * (Admin + Accounts, by the rules); every change goes through a Cloud Function. Balances
 * and statements come from the books (Humble Ledger) via the same functions — never
 * stored here.
 */

export type SyncStatus = "PENDING" | "SYNCED" | "FAILED";

export interface RegisterRow {
  id: string;
  name: string;
  kind: RegisterKind;
  isActive: boolean;
  displayOrder: number;
  opening: { amountPaise: number; asOf: string; posted: boolean } | null;
  syncStatus: SyncStatus;
  hlSyncError: string | null;
  /** A stand-in for a default register whose doc doesn't exist yet. */
  placeholder: boolean;
}

export interface CategoryRow {
  id: string;
  name: string;
  isActive: boolean;
  syncStatus: SyncStatus;
}

export interface MoneyEntryRow {
  id: string;
  from: MoneyAccountRef;
  to: MoneyAccountRef;
  amountPaise: number;
  businessDay: string;
  note: string | null;
  isCorrection: boolean;
  gst: ExpenseGst | null;
  reversesEntryId: string | null;
  reversedByEntryId: string | null;
  syncStatus: SyncStatus;
  hlSyncError: string | null;
  createdBy: string;
  createdAt: Date | null;
}

const date = (x: unknown): Date | null =>
  x && typeof (x as { toDate?: () => Date }).toDate === "function" ? (x as { toDate: () => Date }).toDate() : null;
const status = (x: unknown): SyncStatus => (x === "SYNCED" || x === "FAILED" ? x : "PENDING");

const toRegister = (id: string, d: DocumentData): RegisterRow => ({
  id,
  name: String(d.name ?? id),
  kind: d.kind === "BANK" ? "BANK" : "CASH",
  isActive: d.isActive !== false,
  displayOrder: typeof d.displayOrder === "number" ? d.displayOrder : 10,
  opening: d.opening ?? null,
  syncStatus: status(d.syncStatus),
  hlSyncError: typeof d.hlSyncError === "string" ? d.hlSyncError : null,
  placeholder: false,
});

/** Cash first, then banks by their order. Defaults are stood in for until they exist. */
export function watchRegisters(onChange: (rows: RegisterRow[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, "registers"), where("deleted", "==", false)),
    (snap) => {
      const rows = snap.docs.map((d) => toRegister(d.id, d.data()));
      for (const def of DEFAULT_REGISTERS) {
        if (!rows.some((r) => r.id === def.id)) {
          rows.push({ id: def.id, name: def.name, kind: def.kind, isActive: true, displayOrder: def.displayOrder, opening: null, syncStatus: "PENDING", hlSyncError: null, placeholder: true });
        }
      }
      onChange(rows.sort((a, b) => (a.kind === b.kind ? a.displayOrder - b.displayOrder || a.name.localeCompare(b.name) : a.kind === "CASH" ? -1 : 1)));
    },
    onError,
  );
}

export function watchCategories(onChange: (rows: CategoryRow[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, "expenseCategories"), where("deleted", "==", false)),
    (snap) =>
      onChange(
        snap.docs
          .map((d) => ({ id: d.id, name: String(d.data().name ?? d.id), isActive: d.data().isActive !== false, syncStatus: status(d.data().syncStatus) }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    onError,
  );
}

const toEntry = (id: string, d: DocumentData): MoneyEntryRow => ({
  id,
  from: d.from,
  to: d.to,
  amountPaise: Number(d.amountPaise ?? 0),
  businessDay: String(d.businessDay ?? ""),
  note: typeof d.note === "string" ? d.note : null,
  isCorrection: d.isCorrection === true,
  gst: d.gst ?? null,
  reversesEntryId: d.reversesEntryId ?? null,
  reversedByEntryId: d.reversedByEntryId ?? null,
  syncStatus: status(d.syncStatus),
  hlSyncError: typeof d.hlSyncError === "string" ? d.hlSyncError : null,
  createdBy: String(d.createdBy?.name ?? "Someone"),
  createdAt: date(d.createdAt),
});

/** Entries whose business day is in [from, to], newest first. */
export function watchMoneyEntries(from: string, to: string, onChange: (rows: MoneyEntryRow[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, "moneyEntries"), where("businessDay", ">=", from), where("businessDay", "<=", to), orderBy("businessDay", "desc")),
    (snap) =>
      onChange(
        snap.docs
          .filter((d) => d.data().deleted !== true)
          .map((d) => toEntry(d.id, d.data({ serverTimestamps: "estimate" })))
          .sort((a, b) => b.businessDay.localeCompare(a.businessDay) || (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)),
      ),
    onError,
  );
}

/** One entry, live — to show "Saving to books…" until it's SYNCED (no polling). */
export function watchMoneyEntry(entryId: string, onChange: (row: MoneyEntryRow | null) => void): Unsubscribe {
  return onSnapshot(doc(db, "moneyEntries", entryId), (snap) => onChange(snap.exists() ? toEntry(snap.id, snap.data({ serverTimestamps: "estimate" })) : null));
}

async function call<Req, Res>(name: string, data: Req): Promise<Res> {
  try {
    return (await httpsCallable<Req, Res>(functions, name)(data)).data;
  } catch (error) {
    if (error instanceof FirebaseError && error.code === "functions/unavailable" && /books/i.test(error.message)) {
      throw new Error(error.message.replace(/\s*\[\d{3}\]$/, ""));
    }
    throw new Error(await friendlyError(error));
  }
}

type Ref = MoneyAccountRef;
const strip = (r: Ref) => (r.kind === "ADJUSTMENT" ? r : { ...r });

export function recordMoneyEntry(e: { from: Ref; to: Ref; amountPaise: number; businessDay: string; note: string | null; isCorrection?: boolean }) {
  return call<unknown, { entryId: string }>("recordMoneyEntry", { requestId: newRequestId(), ...e, from: strip(e.from), to: strip(e.to) });
}

export function recordExpense(e: { categoryId: string; registerId: string; registerKind: RegisterKind; amountPaise: number; businessDay: string; note: string | null; gst: ExpenseGst | null }) {
  return call<unknown, { entryId: string }>("recordExpense", { requestId: newRequestId(), ...e });
}

export function correctBalance(target: Ref, wantedPaise: number, businessDay: string, reason: string) {
  return call<unknown, { entryId?: string; noChange: boolean; currentPaise: number }>("correctBalance", { requestId: newRequestId(), target, wantedPaise, businessDay, reason });
}

export function reverseMoneyEntry(entryId: string, reason: string) {
  return call<unknown, { entryId: string }>("reverseMoneyEntry", { requestId: newRequestId(), entryId, reason });
}

export function retryMoneyEntrySync(entryId: string) {
  return call<unknown, { entryId: string }>("retryMoneyEntrySync", { entryId });
}

export function saveRegister(r: { registerId?: string; name: string; kind?: RegisterKind; displayOrder?: number }) {
  return call<unknown, { registerId: string }>("saveRegister", { requestId: newRequestId(), ...r });
}

export function setRegisterOpening(registerId: string, amountPaise: number, asOf: string) {
  return call<unknown, { registerId: string }>("setRegisterOpening", { requestId: newRequestId(), registerId, amountPaise, asOf });
}

export function setRegisterActive(registerId: string, active: boolean, reason: string) {
  return call<unknown, { registerId: string }>("setRegisterActive", { requestId: newRequestId(), registerId, active, reason });
}

export function ensureDefaultRegisters() {
  return call<unknown, { created: string[] }>("ensureDefaultRegisters", {});
}

export function saveExpenseCategory(c: { categoryId?: string; name: string; isActive?: boolean }) {
  return call<unknown, { categoryId: string }>("saveExpenseCategory", { requestId: newRequestId(), ...c });
}

export async function getRegisterBalances(): Promise<Record<string, number>> {
  return (await call<unknown, { balances: Record<string, number> }>("getRegisterBalances", {})).balances;
}

export interface RegisterStatementRow {
  date: string;
  kind: "received" | "paid" | "transfer" | "expense" | "correction" | "reversal" | "opening" | "other";
  what: string;
  counterpart: string | null;
  note: string | null;
  entryId: string | null;
  inPaise: number;
  outPaise: number;
  balancePaise: number;
}

export interface RegisterStatement {
  registerId: string;
  from: string;
  to: string;
  openingPaise: number;
  rows: RegisterStatementRow[];
  inPaise: number;
  outPaise: number;
  closingPaise: number;
  hasMore: boolean;
}

export function getRegisterStatement(registerId: string, from: string, to: string) {
  return call<unknown, RegisterStatement>("getRegisterStatement", { registerId, from, to });
}
