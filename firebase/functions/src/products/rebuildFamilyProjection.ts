import * as admin from "firebase-admin";

import { buildPublicCatalogDoc, type PublicCatalogProduct } from "./buildPublicCatalogDoc";

/**
 * Rebuilds public_catalog/{productKey} from the family's full current
 * variant set in `products` (not just whatever batch triggered the write),
 * so a partial import/edit never drops the family's other pack sizes.
 */
export async function rebuildFamilyProjection(
  db: admin.firestore.Firestore,
  productKey: string,
): Promise<void> {
  const snap = await db
    .collection("products")
    .where("productKey", "==", productKey)
    .get();

  const familyProducts: PublicCatalogProduct[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      productKey: data.productKey,
      product: data.product,
      category: data.category,
      segment: data.segment,
      orderableUnit: data.orderableUnit,
      active: data.active ?? true,
      deleted: data.deleted ?? false,
    };
  });

  const ref = db.collection("public_catalog").doc(productKey);
  const doc = buildPublicCatalogDoc(productKey, familyProducts);
  if (doc) {
    await ref.set(doc);
  } else {
    await ref.delete();
  }
}
