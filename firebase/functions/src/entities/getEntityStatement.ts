import * as admin from "firebase-admin";
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
  sale: "Sale",
  payment: "Payment received",
  purchase: "Purchase",
  payout: "Payment made",
};

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
