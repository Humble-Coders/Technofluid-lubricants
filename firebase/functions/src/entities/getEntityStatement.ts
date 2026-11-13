import * as admin from "firebase-admin";
import {onCall, HttpsError} from "firebase-functions/v2/https";

import {requireRole} from "../auth/requireRole";
import {getHlClient, HL_SECRETS} from "../ledger/getHlClient";
import {HL_MAX_PAGE, plainHlMessage, type HlLedgerRow} from "../ledger/hlClient";
import {txnSources, type TxnSource} from "../ledger/txnSources";
import {ENTITIES, bad, hlAmountToPaise} from "./entityModel";

/**
 * One entity's statement for a date range, from Humble Ledger /ledger: an opening line
 * for `from`, then one row per HL transaction (labelled from our own record of it) with HL's running
 * balance AS GIVEN — never recomputed here (§9b.8). Amounts in integer paise.
 */

/** A real YYYY-MM-DD date (a range may end in the future). */
function dateParam(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) bad(`${label} must look like 2026-04-01.`);
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) bad(`"${value}" isn't a real date.`);
  return value;
}

/** What a statement row is, in plain words: our record of it, else HL's posting type. */
function rowLabel(src: TxnSource | undefined, r: HlLedgerRow, entityId: string): string {
  if (src?.kind === "money") return moneyLabel(src.entry, entityId);
  if (src?.kind === "sale") return `Sale ${src.sale.invoiceNo}`;
  if (src?.kind === "salePayment") return `Payment received for ${src.sale.invoiceNo}`;
  if (src?.kind === "purchase") return `Purchase ${src.purchase.ref} (bill ${src.purchase.billNo})`;
  if (src?.kind === "purchasePayment") return `Payment made for ${src.purchase.ref} (bill ${src.purchase.billNo})`;
  if (src?.kind === "purchaseCancel") return `Purchase ${src.purchase.ref} cancelled`;
  if (src?.kind === "entityOpening") return "Opening balance";
  switch (r.postingType) {
  case "SALE":
    return "Sale";
  case "PAYMENT":
    return "Payment received";
  case "PAYOUT":
    return "Payment made";
  case "PURCHASE":
    return "Purchase";
  case "REVERSAL":
    return r.description || "Reversal";
  default:
    return r.description || "Entry";
  }
}

/** "Payment received", "Balance moved to X", "Correction: …", "Reversal: …" — from `entityId`'s side. */
export function moneyLabel(m: FirebaseFirestore.DocumentData, entityId: string): string {
  if (m.reversesEntryId) return String(m.note ?? "Reversal");
  if (m.isCorrection) return `Correction: ${String(m.note ?? "")}`.trim();
  const fromMe = m.from?.kind === "PARTY" && m.from.entityId === entityId;
  if (m.from?.kind === "PARTY" && m.to?.kind === "PARTY") return fromMe ? `Balance moved to ${m.to.name}` : `Balance moved from ${m.from.name}`;
  if (fromMe) return "Payment received";
  if (m.to?.kind === "PARTY") return m.purchaseRef ? `Payment made for ${String(m.purchaseRef)}` : "Payment made";
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

  // One row per HL transaction, labelled from OUR record of it (matched by txn id — live
  // HL's rows carry no sourceId), from this party's side.
  const sources = await txnSources(admin.firestore(), (res.rows as HlLedgerRow[]).map((r) => r.txnId));
  const rows: {date: string; what: string; group: string; debitPaise: number; creditPaise: number; balancePaise: number; txnIds: string[]}[] = [];
  for (const r of res.rows as HlLedgerRow[]) {
    const debit = hlAmountToPaise(String(r.debit ?? "0"));
    const credit = hlAmountToPaise(String(r.credit ?? "0"));
    const balance = hlAmountToPaise(String(r.balance));
    const last = rows[rows.length - 1];
    if (last && last.group === r.txnId) {
      last.debitPaise += debit;
      last.creditPaise += credit;
      last.balancePaise = balance;
      continue;
    }
    rows.push({date: r.date, what: rowLabel(sources.get(r.txnId), r, entityId), group: r.txnId, debitPaise: debit, creditPaise: credit, balancePaise: balance, txnIds: [r.txnId]});
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
