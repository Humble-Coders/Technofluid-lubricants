import * as admin from "firebase-admin";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {logger} from "firebase-functions/v2";

import {getHlClient, HL_SECRETS} from "../ledger/getHlClient";
import {hlProfileChanged} from "./entityModel";
import {reconcileOnce, syncEntity} from "./sync";

/**
 * Background copy to Humble Ledger. Region asia-south1 — the Firestore database is there
 * and v2 Firestore triggers must match it.
 *
 * Runs only when an entity is PENDING, or SYNCED with an HL customer and a changed HL
 * profile. Anything else is a no-op — that's the loop guard: the function's own SYNCED /
 * FAILED write changes no profile field (and never rewrites a doc just to say "waiting",
 * Aromex lesson 6). Transient failures are retried by the platform up to 3 attempts;
 * after that the 10-minute reconcile takes over.
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
    await syncEntity(admin.firestore(), getHlClient(), event.params.entityId, {rethrow: Number(after.syncAttempts ?? 0) < 3});
  },
);

/** Every 10 minutes: re-tries entities still PENDING / FAILED (see reconcileOnce). */
export const reconcileEntitySync = onSchedule(
  {schedule: "every 10 minutes", region: "asia-south1", secrets: HL_SECRETS},
  async () => {
    const result = await reconcileOnce(admin.firestore(), getHlClient());
    logger.info("Entity reconcile", result);
  },
);
