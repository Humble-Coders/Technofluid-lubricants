import * as admin from "firebase-admin";
import {onDocumentWritten} from "firebase-functions/v2/firestore";

import {getHlClient, HL_SECRETS} from "../ledger/getHlClient";
import {postWaitingFor} from "../money/sync";
import {cancelSaleInBooks, syncSale} from "./sync";

/**
 * Posts a sale to Humble Ledger (asia-south1 — the Firestore database is there): a
 * PENDING sale is posted; a cancelled one whose cancellation is PENDING is cancelled in
 * the books. The function's own SYNCED / FAILED writes are then no-ops (the loop guard);
 * redeliveries are capped by the sale's own attempts. Money received against the
 * invoice that was waiting for it goes straight after. The 10-minute reconcile is
 * reconcileLedgerSync (money/triggers.ts).
 */
export const onSaleWritten = onDocumentWritten(
  {document: "sales/{saleId}", region: "asia-south1", retry: true, secrets: HL_SECRETS},
  async (event) => {
    const after = event.data?.after.data();
    if (!after || after.deleted === true) return;
    const db = admin.firestore();
    const hl = getHlClient();
    const saleId = event.params.saleId;
    if (after.syncStatus === "PENDING") {
      if ((await syncSale(db, hl, saleId, {fromTrigger: true})) === "synced") await postWaitingFor(db, hl, saleId);
    } else if (after.cancelSyncStatus === "PENDING") {
      await cancelSaleInBooks(db, hl, saleId, {fromTrigger: true});
    }
  },
);
