import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";

import {ENTITY_REQUESTS, bad} from "./entityModel";

/**
 * Runs a write once per requestId: a retry returns the first result (alreadyDone) and
 * writes nothing. The entityRequests record is created in the same transaction.
 */
export async function onceInTx<T extends Record<string, unknown>>(
  db: admin.firestore.Firestore,
  requestId: string,
  fn: string,
  work: (tx: admin.firestore.Transaction) => Promise<T>,
): Promise<T & {alreadyDone: boolean}> {
  const reqRef = db.collection(ENTITY_REQUESTS).doc(requestId);
  return db.runTransaction(async (tx) => {
    const prev = await tx.get(reqRef);
    if (prev.exists) return {...(prev.data()?.result as T), alreadyDone: true};
    const result = await work(tx);
    tx.create(reqRef, {fn, result, at: FieldValue.serverTimestamp()});
    return {...result, alreadyDone: false};
  });
}

export function reasonText(value: unknown, label = "reason"): string {
  if (typeof value !== "string" || !value.trim()) bad(`Please give a ${label}.`);
  const t = value.replace(/\s+/g, " ").trim();
  if (t.length > 300) bad(`Keep the ${label} under 300 characters.`);
  return t;
}

export function historyRef(db: admin.firestore.Firestore, entityId: string) {
  return db.collection("entities").doc(entityId).collection("history").doc();
}

export type Actor = {uid: string; name: string};
export const actorOf = (c: {uid: string; name: string}): Actor => ({uid: c.uid, name: c.name});
