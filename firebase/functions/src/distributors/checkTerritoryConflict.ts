import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";

type ConflictRequest = {
  distributorId?: string;
  states: string[];
  cities: string[];
  assignedProductIds: string[];
};

type ConflictResponse = {
  conflict: boolean;
  conflictingDistributorId?: string;
};

/**
 * Checks whether any approved distributor already covers the given
 * states + product combination.
 *
 * Note: Firestore transactions do not support collection queries, so this
 * read is non-transactional. Callers should treat the result as advisory
 * and perform the write immediately after receiving a conflict=false response
 * to minimise the TOCTOU window.
 */
export const checkTerritoryConflict = onCall(
  { region: "us-central1" },
  async (request): Promise<ConflictResponse> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "unauthenticated");
    }

    const { distributorId, states, cities, assignedProductIds } =
      request.data as ConflictRequest;

    if (!Array.isArray(states) || states.length === 0) {
      return { conflict: false };
    }
    if (!Array.isArray(assignedProductIds) || assignedProductIds.length === 0) {
      return { conflict: false };
    }

    const snap = await admin
      .firestore()
      .collection("distributors")
      .where("deleted", "!=", true)
      .get();

    for (const docSnap of snap.docs) {
      // Skip the distributor being updated (edit scenario).
      if (distributorId && docSnap.id === distributorId) continue;

      const data = docSnap.data();

      const docStates: string[] = data.territory?.states ?? [];
      const hasStateOverlap = docStates.some((s: string) => states.includes(s));
      if (!hasStateOverlap) continue;

      // City check: empty city list means the entire state is covered.
      // A conflict requires city overlap too — two distributors with non-overlapping
      // cities in the same state can coexist.
      const docCities: string[] = data.territory?.cities ?? [];
      const incomingCities: string[] = Array.isArray(cities) ? cities : [];
      const hasCityOverlap =
        incomingCities.length === 0 ||   // incoming covers whole state
        docCities.length === 0 ||         // existing covers whole state
        docCities.some((c: string) => incomingCities.includes(c));
      if (!hasCityOverlap) continue;

      const docProductIds: string[] = Array.isArray(data.assignedProducts)
        ? data.assignedProducts.map(
            (p: { productId: string }) => p.productId,
          )
        : [];

      const hasProductOverlap = assignedProductIds.some((id) =>
        docProductIds.includes(id),
      );
      if (hasProductOverlap) {
        return { conflict: true, conflictingDistributorId: docSnap.id };
      }
    }

    return { conflict: false };
  },
);
