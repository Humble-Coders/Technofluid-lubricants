import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";

import {HlError, isNotFound, plainHlMessage, type HlClient, type HlCustomer} from "../ledger/hlClient";
import {ENTITIES, hlProfileChanged, sourceIds, type HlProfile} from "./entityModel";

/**
 * Copies an entity to Humble Ledger (brief §4): create (idempotent on externalId =
 * entity id) or update the HL customer, post the opening balance ONCE (idempotent on its
 * sourceId, booked on opening.asOf — never the sync day), then one merge write.
 *
 *  - Transient HL failure → FAILED with a plain message, then rethrown (so the trigger
 *    retries); permanent (bad data) → FAILED, not rethrown — fix the data and it re-syncs.
 *  - A stored hlCustomerId that HL no longer knows (404) → re-created, once.
 *  - The final write is a transaction: if the profile was edited while we synced, the doc
 *    stays PENDING so the edit is synced too (never lost).
 */

const profileOf = (d: FirebaseFirestore.DocumentData): HlProfile => ({
  name: String(d.name ?? ""),
  phones: Array.isArray(d.phones) ? d.phones : [],
  email: d.email ?? null,
  gstin: d.gstin ?? null,
});

/** HL payload: blanks omitted (HL rejects ""). */
const payload = (p: HlProfile) => ({
  name: p.name,
  ...(p.phones[0] ? {phone: p.phones[0]} : {}),
  ...(p.email ? {email: p.email} : {}),
  ...(p.gstin ? {gstin: p.gstin} : {}),
});

export type SyncOutcome = "synced" | "failed" | "skipped";

export async function syncEntity(
  db: admin.firestore.Firestore,
  hl: HlClient,
  entityId: string,
  opts: {rethrow?: boolean} = {},
): Promise<SyncOutcome> {
  const ref = db.collection(ENTITIES).doc(entityId);
  const snap = await ref.get();
  const d = snap.data();
  if (!snap.exists || !d || d.deleted === true) return "skipped";
  const profile = profileOf(d);

  try {
    const create = async (): Promise<HlCustomer> => {
      const r = await hl.createCustomer({...payload(profile), externalId: entityId});
      // Already there (a retry, or a re-create) — bring it up to date.
      return r.idempotent ? hl.updateCustomer(r.customer.id, payload(profile)) : r.customer;
    };

    let customer: HlCustomer;
    if (!d.hlCustomerId) {
      customer = await create();
    } else {
      try {
        customer = await hl.updateCustomer(String(d.hlCustomerId), payload(profile));
      } catch (e) {
        if (!isNotFound(e)) throw e;
        logger.warn("HL customer missing — re-creating", {entityId, hlCustomerId: d.hlCustomerId});
        customer = await create();
      }
    }

    let opening = d.opening ?? null;
    if (opening && opening.posted !== true) {
      const post = (customerId: string) =>
        hl.postOpeningBalance(customerId, {
          amountPaise: opening.amountPaise,
          direction: opening.direction === "payable" ? "PAYABLE" : "RECEIVABLE",
          date: opening.asOf,
          sourceId: sourceIds.opening(entityId),
          actorRef: String(d.createdBy?.uid ?? "system"),
        });
      let posted;
      try {
        posted = await post(customer.id);
      } catch (e) {
        if (!isNotFound(e)) throw e;
        customer = await create();
        posted = await post(customer.id);
      }
      opening = {...opening, posted: true, hlTxnId: posted.txnId};
    }

    if (d.isActive === false && customer.archived !== true) {
      await hl.archiveCustomer(customer.id).catch((e) => logger.warn("HL archive after sync failed", {entityId, error: String(e)}));
    }

    const now = FieldValue.serverTimestamp();
    await db.runTransaction(async (tx) => {
      const latest = (await tx.get(ref)).data();
      if (!latest) return;
      const editedMeanwhile = hlProfileChanged(profile, profileOf(latest));
      tx.set(
        ref,
        {
          hlCustomerId: customer.id,
          hlAccountId: customer.accountId,
          syncStatus: editedMeanwhile ? "PENDING" : "SYNCED",
          hlSyncedAt: now,
          hlSyncError: null,
          syncAttempts: 0,
          lastSyncAttemptAt: now,
          ...(opening ? {opening} : {}),
        },
        {merge: true},
      );
    });
    return "synced";
  } catch (e) {
    const transient = e instanceof HlError ? e.transient : true;
    logger.error("Entity sync to HL failed", {entityId, transient, error: e instanceof Error ? e.message : String(e)});
    await ref.set(
      {
        syncStatus: "FAILED",
        hlSyncError: plainHlMessage(e),
        syncAttempts: FieldValue.increment(1),
        lastSyncAttemptAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    if (transient && opts.rethrow) throw e;
    return "failed";
  }
}

const MAX_AUTO_ATTEMPTS = 10;
const STALE_MS = 3 * 60_000;

/** Minutes to wait after `attempts` failures before trying again: 1, 2, 4 … up to 60. */
export const backoffMinutes = (attempts: number) => Math.min(2 ** Math.max(attempts - 1, 0), 60);

/**
 * One pass of the 10-minute reconcile (also called directly by the emulator tests, since
 * the emulators run no scheduler): PENDING / FAILED entities whose last edit is over 3
 * minutes old, at most 200, backing off on syncAttempts and stopping after 10 (the app's
 * Retry still works — it resets the count).
 */
export async function reconcileOnce(db: admin.firestore.Firestore, hl: HlClient, now = Date.now()) {
  const snap = await db.collection(ENTITIES).where("syncStatus", "in", ["PENDING", "FAILED"]).limit(400).get();
  const ms = (t: unknown) => (t instanceof admin.firestore.Timestamp ? t.toMillis() : 0);
  const due = snap.docs.filter((doc) => {
    const d = doc.data();
    if (d.deleted === true) return false;
    if (now - ms(d.updatedAt) < STALE_MS) return false;
    const attempts = Number(d.syncAttempts ?? 0);
    if (attempts >= MAX_AUTO_ATTEMPTS) return false;
    return attempts === 0 || now - ms(d.lastSyncAttemptAt) >= backoffMinutes(attempts) * 60_000;
  }).slice(0, 200);

  const result = {checked: snap.size, tried: 0, synced: 0, failed: 0};
  for (const doc of due) {
    result.tried += 1;
    const outcome = await syncEntity(db, hl, doc.id);
    if (outcome === "synced") result.synced += 1;
    else if (outcome === "failed") result.failed += 1;
  }
  return result;
}
