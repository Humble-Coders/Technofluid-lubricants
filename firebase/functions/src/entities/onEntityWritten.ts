import * as admin from "firebase-admin";
import {onDocumentWritten} from "firebase-functions/v2/firestore";

import {getHlClient, HL_SECRETS} from "../ledger/getHlClient";
import {hlProfileChanged} from "./entityModel";
import {postWaitingFor} from "../money/sync";
import {syncEntity} from "./sync";

/**
 * Background copy to Humble Ledger. Region asia-south1 — the Firestore database is there
 * and v2 Firestore triggers must match it.
 *
 * Runs only when an entity is PENDING, or SYNCED with an HL customer and a changed HL
 * profile. Anything else is a no-op — that's the loop guard: the function's own SYNCED /
 * FAILED write changes no profile field (and never rewrites a doc just to say "waiting",
 * Aromex lesson 6). Transient failures are redelivered by the platform while the doc's
 * own syncAttempts (read fresh in syncEntity — a redelivery carries the same frozen
 * event) is under 3; after that the 10-minute reconcile takes over.
 */
export const onEntityWritten = onDocumentWritten(
  {document: "entities/{entityId}", region: "asia-south1", retry: true, secrets: HL_SECRETS},
  async (event) => {
    const after = event.data?.after.data();
    if (!after || after.deleted === true) return;
    const before = event.data?.before.data();
    const pending = after.syncStatus === "PENDING";
    const profileMoved = after.syncStatus === "SYNCED" && Boolean(after.hlCustomerId) && Boolean(before) && hlProfileChanged(before as never, after as never);
    if (!pending && !profileMoved) return;
    const db = admin.firestore();
    const hl = getHlClient();
    const outcome = await syncEntity(db, hl, event.params.entityId, {fromTrigger: true});
    // Money entries that were waiting for this party to reach the books go now.
    if (outcome === "synced") await postWaitingFor(db, hl, event.params.entityId);
  },
);

// The 10-minute reconcile is reconcileLedgerSync (money/triggers.ts): entities first, then money.
