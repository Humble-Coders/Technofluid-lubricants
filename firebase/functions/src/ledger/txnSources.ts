import * as admin from "firebase-admin";

/**
 * Which of OUR records an HL ledger row came from. Live HL's /ledger rows carry only a
 * transaction id (no sourceId — Ansh HL, 27 Oct 2026), so statements match rows to the
 * txn ids we store when we post: moneyEntries.hlTxnId, sales.hlSaleTxnId /
 * paymentTxnIds, purchases.hlTxnId / paymentTxnIds / cancelHlTxnId, and the hlTxnId of
 * an entity's or register's opening balance. A txn HL
 * made itself (e.g. the mirror when an invoice is cancelled) matches nothing — the
 * statement then labels it from HL's posting type and description.
 */
export type TxnSource =
  | {kind: "money"; entryId: string; entry: FirebaseFirestore.DocumentData}
  | {kind: "sale"; saleId: string; sale: FirebaseFirestore.DocumentData}
  | {kind: "salePayment"; saleId: string; sale: FirebaseFirestore.DocumentData}
  | {kind: "purchase"; purchaseId: string; purchase: FirebaseFirestore.DocumentData}
  | {kind: "purchasePayment"; purchaseId: string; purchase: FirebaseFirestore.DocumentData}
  | {kind: "purchaseCancel"; purchaseId: string; purchase: FirebaseFirestore.DocumentData}
  | {kind: "entityOpening"; entityId: string}
  | {kind: "registerOpening"; registerId: string};

const chunks = <T>(xs: T[], n = 30) => Array.from({length: Math.ceil(xs.length / n)}, (_, i) => xs.slice(i * n, i * n + n));

export async function txnSources(db: admin.firestore.Firestore, txnIds: string[]): Promise<Map<string, TxnSource>> {
  const out = new Map<string, TxnSource>();
  const ids = [...new Set(txnIds.filter(Boolean))];
  for (const chunk of chunks(ids)) {
    const [money, sales, salePays, purchases, purchasePays, purchaseCancels, entities, registers] = await Promise.all([
      db.collection("moneyEntries").where("hlTxnId", "in", chunk).get(),
      db.collection("sales").where("hlSaleTxnId", "in", chunk).get(),
      db.collection("sales").where("paymentTxnIds", "array-contains-any", chunk).get(),
      db.collection("purchases").where("hlTxnId", "in", chunk).get(),
      db.collection("purchases").where("paymentTxnIds", "array-contains-any", chunk).get(),
      db.collection("purchases").where("cancelHlTxnId", "in", chunk).get(),
      db.collection("entities").where("opening.hlTxnId", "in", chunk).get(),
      db.collection("registers").where("opening.hlTxnId", "in", chunk).get(),
    ]);
    for (const d of money.docs) out.set(String(d.data().hlTxnId), {kind: "money", entryId: d.id, entry: d.data()});
    for (const d of sales.docs) out.set(String(d.data().hlSaleTxnId), {kind: "sale", saleId: d.id, sale: d.data()});
    for (const d of salePays.docs) {
      for (const t of (d.data().paymentTxnIds ?? []) as string[]) if (chunk.includes(t)) out.set(t, {kind: "salePayment", saleId: d.id, sale: d.data()});
    }
    for (const d of purchases.docs) out.set(String(d.data().hlTxnId), {kind: "purchase", purchaseId: d.id, purchase: d.data()});
    for (const d of purchasePays.docs) {
      for (const t of (d.data().paymentTxnIds ?? []) as string[]) if (chunk.includes(t)) out.set(t, {kind: "purchasePayment", purchaseId: d.id, purchase: d.data()});
    }
    for (const d of purchaseCancels.docs) out.set(String(d.data().cancelHlTxnId), {kind: "purchaseCancel", purchaseId: d.id, purchase: d.data()});
    for (const d of entities.docs) out.set(String(d.data().opening.hlTxnId), {kind: "entityOpening", entityId: d.id});
    for (const d of registers.docs) out.set(String(d.data().opening.hlTxnId), {kind: "registerOpening", registerId: d.id});
  }
  return out;
}
