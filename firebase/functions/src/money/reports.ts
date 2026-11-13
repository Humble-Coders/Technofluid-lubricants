import * as admin from "firebase-admin";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {hlAmountToPaise} from "../entities/entityModel";
import {getHlClient, HL_SECRETS} from "../ledger/getHlClient";
import {HL_MAX_PAGE, plainHlMessage} from "../ledger/hlClient";
import {txnSources} from "../ledger/txnSources";
import {indiaToday, realDay, text} from "./common";
import {REGISTERS, moneyDirection, type MoneyAccountRef} from "./moneyModel";

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

/** A txn HL made itself (no record of ours) — labelled from its posting type. */
const FALLBACK_KIND: Record<string, RowKind> = {PAYMENT: "received", PAYOUT: "paid", EXPENSE: "expense", REVERSAL: "reversal"};

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
  // Each row is matched to OUR record of it by txn id (live HL's rows carry no sourceId).
  const sources = await txnSources(db, res.rows.map((row) => row.txnId));
  let inPaise = 0;
  let outPaise = 0;
  const rows = res.rows.map((row) => {
    const debit = hlAmountToPaise(String(row.debit ?? "0"));
    const credit = hlAmountToPaise(String(row.credit ?? "0"));
    inPaise += debit;
    outPaise += credit;
    const src = sources.get(row.txnId);
    const e = src?.kind === "money" ? src.entry : undefined;
    const bill = src?.kind === "purchasePayment" ? src.purchase : null;
    const kind: RowKind =
      src?.kind === "registerOpening" ? "opening" : e ? kindOf(e as never) : src?.kind === "salePayment" ? "received" : bill ? "paid" : FALLBACK_KIND[row.postingType ?? ""] ?? "other";
    const other = e ? (e.from.kind !== "ADJUSTMENT" && e.from.registerId === registerId ? e.to : e.from) : null;
    return {
      date: row.date,
      kind,
      what: src?.kind === "salePayment" ? `Payment received for ${src.sale.invoiceNo}` : bill ? `Payment made for ${bill.ref} (bill ${bill.billNo})` : row.description,
      counterpart:
        other && other.kind !== "ADJUSTMENT" ? String(other.name) : src?.kind === "salePayment" ? String(src.sale.customer?.name ?? "") : bill ? String(bill.supplier?.name ?? "") : kind === "correction" ? "Adjustment" : null,
      note: e?.note ?? null,
      entryId: src?.kind === "money" ? src.entryId : null,
      direction: e ? moneyDirection(e as never) : src?.kind === "salePayment" ? "IN" : bill ? "OUT" : null,
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
