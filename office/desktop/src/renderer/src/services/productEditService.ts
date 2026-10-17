import { collection, onSnapshot, query, where, type Unsubscribe } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { friendlyError } from "./callErrors";

/**
 * Editing a product = asking the `editProduct` Cloud Function. The app never writes
 * products itself (security rules forbid it); the function checks the role and every
 * value, then logs each change in `productChanges`.
 */

/** Field names exactly as the Cloud Function and Firestore use them. */
export interface ProductChanges {
  product?: string;
  orderableUnit?: string;
  pricePer?: string;
  /** Integer paise, or null to clear the price. */
  dealerPrice?: number | null;
  distributorPrice?: number | null;
  gstPct?: number;
  hsnCode?: string | null;
  segment?: "Automotive" | "Industrial" | "Both";
  densityKgPerL?: number | null;
  active?: boolean;
}

export type ProductField = keyof ProductChanges;

/** GST slabs the Cloud Function accepts (after the Sept 2025 rationalisation). */
export const GST_SLABS = [0, 5, 18, 40] as const;

const editProductCallable = httpsCallable<
  { sku: string; changes: ProductChanges; reason?: string },
  { changed: ProductField[] }
>(functions, "editProduct");

export async function editProduct(sku: string, changes: ProductChanges, reason?: string): Promise<ProductField[]> {
  try {
    const result = await editProductCallable({ sku, changes, ...(reason ? { reason } : {}) });
    return result.data.changed;
  } catch (error) {
    throw new Error(await friendlyError(error));
  }
}

/** One logged change to one field of a product. */
export interface ProductChange {
  id: string;
  field: string;
  old: unknown;
  new: unknown;
  byName: string;
  at: Date | null;
  reason: string | null;
}

/**
 * Changes to one product, newest first (Admin only — the log holds prices).
 * Sorted here rather than in the query, so no composite index is needed; one product
 * only ever has a handful of changes.
 */
export function watchProductChanges(
  sku: string,
  onChange: (changes: ProductChange[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, "productChanges"), where("sku", "==", sku)),
    (snap) =>
      onChange(
        snap.docs
          .map((doc) => {
            const d = doc.data({ serverTimestamps: "estimate" });
            return {
              id: doc.id,
              field: typeof d.field === "string" ? d.field : "",
              old: d.old ?? null,
              new: d.new ?? null,
              byName: typeof d.byName === "string" && d.byName ? d.byName : "Someone",
              at: typeof d.at?.toDate === "function" ? d.at.toDate() : null,
              reason: typeof d.reason === "string" ? d.reason : null,
            };
          })
          .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0)),
      ),
    onError,
  );
}

/** A new product, as the addProduct Cloud Function expects it. */
export interface NewProduct {
  sku: string;
  product: string;
  grade: string;
  category: "bulk_oil" | "grease" | "retail";
  orderableUnit: string;
  packQty: number;
  baseUnit: "L" | "kg" | "piece";
  pricePer: string;
  dealerPrice: number | null;
  distributorPrice: number | null;
  gstPct: number;
  hsnCode: string | null;
  segment: "Automotive" | "Industrial" | "Both";
  densityKgPerL: number | null;
}

const addProductCallable = httpsCallable<
  { product: NewProduct; copyOf?: string; switchOffOriginal?: boolean },
  { sku: string; productKey: string }
>(functions, "addProduct");

/** Adds a product (optionally as a copy of `copyOf`, switching the original off). Returns the new SKU. */
export async function addProduct(
  product: NewProduct,
  copy?: { of: string; switchOffOriginal: boolean },
): Promise<string> {
  try {
    const result = await addProductCallable({
      product,
      ...(copy ? { copyOf: copy.of, switchOffOriginal: copy.switchOffOriginal } : {}),
    });
    return result.data.sku;
  } catch (error) {
    throw new Error(await friendlyError(error));
  }
}

const setProductDeletedCallable = httpsCallable<
  { sku: string; deleted: boolean; reason?: string },
  { changed: boolean }
>(functions, "setProductDeleted");

/** Soft-deletes (or restores) a product. Nothing is erased; it's logged in the change history. */
export async function setProductDeleted(sku: string, deleted: boolean, reason?: string): Promise<void> {
  try {
    await setProductDeletedCallable({ sku, deleted, ...(reason ? { reason } : {}) });
  } catch (error) {
    throw new Error(await friendlyError(error));
  }
}
