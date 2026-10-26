import * as admin from "firebase-admin";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {logger} from "firebase-functions/v2";

import {getHlClient, HL_SECRETS} from "../ledger/getHlClient";
import {postWaitingFor, reconcileLedgerOnce, syncCategory, syncMoneyEntry, syncRegister} from "./sync";

/**
 * Background posting to Humble Ledger (asia-south1 — the Firestore database is there).
 * Each runs only for a PENDING doc; the function's own SYNCED / FAILED write is then a
 * no-op (the loop guard). Redeliveries are capped by the doc's own syncAttempts.
 */
const opts = (document: string) => ({document, region: "asia-south1", retry: true, secrets: HL_SECRETS});
const pending = (d: FirebaseFirestore.DocumentData | undefined) => Boolean(d && d.deleted !== true && d.syncStatus === "PENDING");

export const onRegisterWritten = onDocumentWritten(opts("registers/{registerId}"), async (event) => {
  if (!pending(event.data?.after.data())) return;
  const db = admin.firestore();
  const hl = getHlClient();
  const outcome = await syncRegister(db, hl, event.params.registerId, {fromTrigger: true});
  if (outcome === "synced") await postWaitingFor(db, hl, event.params.registerId);
});

export const onExpenseCategoryWritten = onDocumentWritten(opts("expenseCategories/{categoryId}"), async (event) => {
  if (!pending(event.data?.after.data())) return;
  const db = admin.firestore();
  const hl = getHlClient();
  const outcome = await syncCategory(db, hl, event.params.categoryId, {fromTrigger: true});
  if (outcome === "synced") await postWaitingFor(db, hl, event.params.categoryId);
});

export const onMoneyEntryWritten = onDocumentWritten(opts("moneyEntries/{entryId}"), async (event) => {
  if (!pending(event.data?.after.data())) return;
  await syncMoneyEntry(admin.firestore(), getHlClient(), event.params.entryId, {fromTrigger: true});
});

/** Every 10 minutes: entities → registers → categories → money entries still waiting. */
export const reconcileLedgerSync = onSchedule({schedule: "every 10 minutes", region: "asia-south1", secrets: HL_SECRETS}, async () => {
  logger.info("Ledger reconcile", await reconcileLedgerOnce(admin.firestore(), getHlClient()));
});
