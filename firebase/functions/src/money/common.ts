import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";

import {MONEY_REQUESTS, bad} from "./moneyModel";

/** Runs a write once per requestId (moneyRequests); a retry returns the first result. */
export async function onceInTx<T extends Record<string, unknown>>(
  db: admin.firestore.Firestore,
  requestId: string,
  fn: string,
  work: (tx: admin.firestore.Transaction) => Promise<T>,
): Promise<T & {alreadyDone: boolean}> {
  const reqRef = db.collection(MONEY_REQUESTS).doc(requestId);
  return db.runTransaction(async (tx) => {
    const prev = await tx.get(reqRef);
    if (prev.exists) return {...(prev.data()?.result as T), alreadyDone: true};
    const result = await work(tx);
    tx.create(reqRef, {fn, result, at: FieldValue.serverTimestamp()});
    return {...result, alreadyDone: false};
  });
}

export function text(value: unknown, label: string, max: number, required = true): string {
  if (typeof value !== "string" || !value.trim()) {
    if (!required) return "";
    bad(`${label} is required.`);
  }
  const t = value.replace(/\s+/g, " ").trim();
  if (t.length > max) bad(`${label} must be ${max} characters or fewer.`);
  return t;
}

/** Today in India (YYYY-MM-DD). */
export const indiaToday = () => new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Kolkata"}).format(new Date());

export function realDay(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) bad(`${label} must look like 2026-04-01.`);
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) bad(`"${value}" isn't a real date.`);
  return value;
}
