import { collection, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { GapAction, GapDecision } from "@technofluid/core";
import { db, functions } from "@/lib/firebase";
import { friendlyError } from "./callErrors";

/**
 * "To fill in" decisions (dataGaps/{gapId}): "not needed", answers to Gaurav's questions and
 * keep/remove for older products. Admin reads them (security rules); only the
 * resolveDataGap Cloud Function writes them. Undone ("open") decisions are left out.
 */
export function watchGapDecisions(onChange: (decisions: GapDecision[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    collection(db, "dataGaps"),
    (snap) =>
      onChange(
        snap.docs
          .map((d) => d.data())
          .filter((d) => d.status === "decided" && typeof d.action === "string")
          .map((d) => ({
            gapId: String(d.gapId),
            action: d.action as GapAction,
            value: typeof d.value === "string" ? d.value : null,
            note: typeof d.note === "string" ? d.note : null,
            byName: typeof d.by?.name === "string" ? d.by.name : "",
            at: typeof d.updatedAt?.toDate === "function" ? d.updatedAt.toDate() : null,
          })),
      ),
    onError,
  );
}

export async function resolveDataGap(gapId: string, action: GapAction | "reopen", extra: { value?: string; note?: string } = {}): Promise<void> {
  try {
    await httpsCallable(functions, "resolveDataGap")({ gapId, action, ...extra });
  } catch (error) {
    throw new Error(await friendlyError(error));
  }
}
