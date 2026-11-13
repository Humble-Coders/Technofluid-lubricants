import * as admin from "firebase-admin";
import {onDocumentWritten} from "firebase-functions/v2/firestore";

import {getHlClient, HL_SECRETS} from "../ledger/getHlClient";
import {postWaitingFor} from "../money/sync";
import {cancelPurchaseInBooks, syncPurchase} from "./sync";

/**
 * Posts a purchase to Humble Ledger (asia-south1 — the Firestore database is there): a
 * PENDING purchase is posted; a cancelled one whose cancellation is PENDING is reversed
 * in the books. The function's own SYNCED / FAILED writes are then no-ops (the loop
 * guard); redeliveries are capped by the purchase's own attempts. Money paid against the
 * bill that was waiting for it goes straight after. The 10-minute reconcile is
 * reconcileLedgerSync (money/triggers.ts).
 */
export const onPurchaseWritten = onDocumentWritten(
  {document: "purchases/{purchaseId}", region: "asia-south1", retry: true, secrets: HL_SECRETS},
  async (event) => {
    const after = event.data?.after.data();
    if (!after || after.deleted === true) return;
    const db = admin.firestore();
    const hl = getHlClient();
    const id = event.params.purchaseId;
    if (after.syncStatus === "PENDING") {
      if ((await syncPurchase(db, hl, id, {fromTrigger: true})) === "synced") await postWaitingFor(db, hl, id);
    } else if (after.cancelSyncStatus === "PENDING") {
      await cancelPurchaseInBooks(db, hl, id, {fromTrigger: true});
    }
  },
);
