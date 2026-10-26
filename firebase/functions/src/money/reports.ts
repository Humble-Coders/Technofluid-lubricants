import * as admin from "firebase-admin";
import {FieldPath} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {hlAmountToPaise} from "../entities/entityModel";
import {getHlClient, HL_SECRETS} from "../ledger/getHlClient";
import {HL_MAX_PAGE, plainHlMessage} from "../ledger/hlClient";
import {indiaToday, realDay, text} from "./common";
import {MONEY_ENTRIES, REGISTERS, moneyDirection, type MoneyAccountRef} from "./moneyModel";

/**
 * Register balances and statements — from the books (Humble Ledger), never stored.
 * Balances come from the balance sheet matched BY hlAccountId (never by name); OUR list
 * of registers is iterated, so one the books have never seen shows ₹0, never vanishes.
 * Books unreachable → an error, never ₹0.
 */
export const getRegisterBalances = onCall({region: "us-central1", secrets: HL_SECRETS}, async (request) => {
  await requireRole(request, ["admin", "accounts"]);
  const registers = (await admin.firestore().collection(REGISTERS).where("deleted", "==", false).get()).docs;
  let sheet: Record<string, string>;
  try {
    sheet = await getHlClient().getBalanceSheet(indiaToday());
  } catch (e) {
    throw new HttpsError("unavailable", plainHlMessage(e));
  }
  const balances: Record<string, number> = {};
  for (const r of registers) {
    const acc = r.data().hlAccountId;
    balances[r.id] = acc ? hlAmountToPaise(String(sheet[String(acc)] ?? "0")) : 0;
  }
  return {balances, asOf: indiaToday()};
});

export type RowKind = "received" | "paid" | "transfer" | "expense" | "correction" | "reversal" | "opening" | "other";

export function kindOf(e: {from: MoneyAccountRef; to: MoneyAccountRef; isCorrection?: boolean; reversesEntryId?: string | null}): RowKind {
  if (e.reversesEntryId) return "reversal";
  if (e.isCorrection) return "correction";
  if (e.to.kind === "EXPENSE" || e.from.kind === "EXPENSE") return "expense";
  if (e.from.kind === "PARTY" && e.to.kind !== "PARTY") return "received";
  if (e.to.kind === "PARTY" && e.from.kind !== "PARTY") return "paid";
  return "transfer";
}

/** One register's statement for a date range: HL's running/closing balances, as given. */
export const getRegisterStatement = onCall({region: "us-central1", secrets: HL_SECRETS}, async (request) => {
  await requireRole(request, ["admin", "accounts"]);
  const data = request.data ?? {};
  const registerId = text(data.registerId, "registerId", 80);
  const from = realDay(data.from, "The start date");
  const to = realDay(data.to, "The end date");
  if (from > to) throw new HttpsError("invalid-argument", "The start date is after the end date.");
  const page = Number.isInteger(data.page) && data.page > 0 ? data.page : 1;
  const db = admin.firestore();
  const r = (await db.collection(REGISTERS).doc(registerId).get()).data();
  if (!r || r.deleted === true) throw new HttpsError("not-found", "That register doesn't exist.");
  if (!r.hlAccountId) throw new HttpsError("failed-precondition", "Not saved to the books yet — there's no history until it is.");

  let res;
  try {
    res = await getHlClient().getLedger({accountId: String(r.hlAccountId), from, to, page, limit: HL_MAX_PAGE});
  } catch (e) {
    throw new HttpsError("unavailable", plainHlMessage(e));
  }
  // Join each row to its entry by sourceId (money_<entryId>).
  const ids = [...new Set(res.rows.map((row) => /^money_(.+)$/.exec(row.sourceId ?? "")?.[1]).filter((x): x is string => Boolean(x)))];
  const entries = new Map<string, FirebaseFirestore.DocumentData>();
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    const snap = await db.collection(MONEY_ENTRIES).where(FieldPath.documentId(), "in", chunk).get();
    snap.docs.forEach((d) => entries.set(d.id, d.data()));
  }
  let inPaise = 0;
  let outPaise = 0;
  const rows = res.rows.map((row) => {
    const debit = hlAmountToPaise(String(row.debit ?? "0"));
    const credit = hlAmountToPaise(String(row.credit ?? "0"));
    inPaise += debit;
    outPaise += credit;
    const entryId = /^money_(.+)$/.exec(row.sourceId ?? "")?.[1] ?? null;
    const e = entryId ? entries.get(entryId) : undefined;
    const kind: RowKind = row.sourceId?.startsWith("register_") ? "opening" : e ? kindOf(e as never) : "other";
    const other = e ? (e.from.kind !== "ADJUSTMENT" && e.from.registerId === registerId ? e.to : e.from) : null;
    return {
      date: row.date,
      kind,
      what: row.description,
      counterpart: other && other.kind !== "ADJUSTMENT" ? String(other.name) : kind === "correction" ? "Adjustment" : null,
      note: e?.note ?? null,
      entryId,
      direction: e ? moneyDirection(e as never) : null,
      inPaise: debit,
      outPaise: credit,
      balancePaise: hlAmountToPaise(String(row.balance)),
    };
  });
  const openingPaise = hlAmountToPaise(String(res.openingBalance ?? "0"));
  return {
    registerId,
    from,
    to,
    openingPaise,
    rows,
    inPaise,
    outPaise,
    closingPaise: rows.length ? rows[rows.length - 1].balancePaise : openingPaise,
    hasMore: res.hasMore,
    page,
  };
});
