import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import type { BalanceDirection } from "@technofluid/core";
import { functions } from "@/lib/firebase";
import { friendlyError } from "./callErrors";

/**
 * Money from the books (Humble Ledger), always through Cloud Functions — the app never
 * holds an HL token and never stores a balance. A failure is an error ("Books
 * unreachable"), never an empty list or ₹0.
 */

export interface EntityBalance {
  balancePaise: number;
  direction: BalanceDirection;
}

export interface StatementRow {
  date: string;
  what: string;
  group: string;
  debitPaise: number;
  creditPaise: number;
  /** The books' running balance, as given. */
  balancePaise: number;
  txnIds: string[];
}

export interface Statement {
  entityId: string;
  from: string;
  to: string;
  openingPaise: number;
  rows: StatementRow[];
  closingPaise: number;
  hasMore: boolean;
  page: number;
}

async function call<Req, Res>(name: string, data: Req): Promise<Res> {
  try {
    return (await httpsCallable<Req, Res>(functions, name)(data)).data;
  } catch (error) {
    // "The books couldn't be reached…" comes from the server already in plain words.
    if (error instanceof FirebaseError && error.code === "functions/unavailable" && /books/i.test(error.message)) {
      throw new Error(error.message.replace(/\s*\[\d{3}\]$/, ""));
    }
    throw new Error(await friendlyError(error));
  }
}

export async function getEntityBalances(): Promise<Record<string, EntityBalance>> {
  const r = await call<Record<string, never>, { balances: Record<string, EntityBalance> }>("getEntityBalances", {});
  return r.balances;
}

export function getEntityStatement(entityId: string, from: string, to: string, page = 1): Promise<Statement> {
  return call("getEntityStatement", { entityId, from, to, page });
}
