import * as admin from "firebase-admin";
import {FieldPath} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {getHlClient, HL_SECRETS} from "../ledger/getHlClient";
import {HL_MAX_PAGE, plainHlMessage, type HlLedgerRow} from "../ledger/hlClient";
import {ENTITIES, bad, hlAmountToPaise, sourceGroup} from "./entityModel";

/**
 * One entity's statement for a date range, from Humble Ledger /ledger: an opening line
 * for `from`, then one row per sourceId group (a sale's legs together) with HL's running
 * balance AS GIVEN — never recomputed here (§9b.8). Amounts in integer paise.
 */

/** A real YYYY-MM-DD date (a range may end in the future). */
function dateParam(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) bad(`${label} must look like 2026-04-01.`);
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) bad(`"${value}" isn't a real date.`);
  return value;
}

const WHAT: Record<string, string> = {
  entity: "Opening balance",
  money: "Money",
  sale: "Sale",
  payment: "Payment received",
  purchase: "Purchase",
  payout: "Payment made",
};

/** "Payment received", "Balance moved to X", "Correction: …", "Reversal: …" — from `entityId`'s side. */
export function moneyLabel(m: FirebaseFirestore.DocumentData, entityId: string): string {
  if (m.reversesEntryId) return String(m.note ?? "Reversal");
  if (m.isCorrection) return `Correction: ${String(m.note ?? "")}`.trim();
  const fromMe = m.from?.kind === "PARTY" && m.from.entityId === entityId;
  if (m.from?.kind === "PARTY" && m.to?.kind === "PARTY") return fromMe ? `Balance moved to ${m.to.name}` : `Balance moved from ${m.from.name}`;
  if (fromMe) return "Payment received";
  if (m.to?.kind === "PARTY") return "Payment made";
  return "Money";
}

export const getEntityStatement = onCall({region: "us-central1", secrets: HL_SECRETS}, async (request) => {
  await requireRole(request, ["admin", "accounts"]);
  const data = request.data ?? {};
  const entityId = typeof data.entityId === "string" ? data.entityId.trim() : "";
  if (!entityId) bad("entityId is required.");
  const from = dateParam(data.from, "The start date");
  const to = dateParam(data.to, "The end date");
  if (from > to) bad("The start date is after the end date.");
  const page = Number.isInteger(data.page) && data.page > 0 ? data.page : 1;

  const d = (await admin.firestore().collection(ENTITIES).doc(entityId).get()).data();
  if (!d || d.deleted === true) throw new HttpsError("not-found", "That customer / supplier doesn't exist.");
  if (!d.hlAccountId) throw new HttpsError("failed-precondition", "Not saved to the books yet — there's no statement until it is.");

  let res;
  try {
    res = await getHlClient().getLedger({accountId: String(d.hlAccountId), from, to, page, limit: HL_MAX_PAGE});
  } catch (e) {
    throw new HttpsError("unavailable", plainHlMessage(e));
  }

  // Group consecutive rows of one source (e.g. a sale's goods + GST legs) into one line.
  const rows: {date: string; what: string; group: string; debitPaise: number; creditPaise: number; balancePaise: number; txnIds: string[]}[] = [];
  for (const r of res.rows as HlLedgerRow[]) {
    const group = r.sourceId ? sourceGroup(r.sourceId) : r.txnId;
    const last = rows[rows.length - 1];
    const debit = hlAmountToPaise(String(r.debit ?? "0"));
    const credit = hlAmountToPaise(String(r.credit ?? "0"));
    const balance = hlAmountToPaise(String(r.balance));
    if (last && last.group === group) {
      last.debitPaise += debit;
      last.creditPaise += credit;
      last.balancePaise = balance;
      last.txnIds.push(r.txnId);
    } else {
      const prefix = group.split("_")[0] ?? "";
      rows.push({date: r.date, what: WHAT[prefix] ?? r.description, group, debitPaise: debit, creditPaise: credit, balancePaise: balance, txnIds: [r.txnId]});
    }
  }
  // Money rows are labelled from the entry itself, from this party's side (brief §4).
  const moneyIds = rows.map((r) => /^money_(.+)$/.exec(r.group)?.[1]).filter((x): x is string => Boolean(x));
  const db = admin.firestore();
  for (let i = 0; i < moneyIds.length; i += 30) {
    const snap = await db.collection("moneyEntries").where(FieldPath.documentId(), "in", moneyIds.slice(i, i + 30)).get();
    const byId = new Map(snap.docs.map((x) => [x.id, x.data()]));
    for (const row of rows) {
      const m = byId.get(/^money_(.+)$/.exec(row.group)?.[1] ?? "");
      if (m) row.what = moneyLabel(m, entityId);
    }
  }
  const openingPaise = hlAmountToPaise(String(res.openingBalance ?? "0"));
  return {
    entityId,
    from,
    to,
    openingPaise,
    rows,
    closingPaise: rows.length ? rows[rows.length - 1].balancePaise : openingPaise,
    hasMore: res.hasMore,
    page,
  };
});
