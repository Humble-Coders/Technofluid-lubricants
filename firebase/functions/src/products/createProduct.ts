import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";

import { pricesRef, splitPrices } from "./prices";
import { rebuildFamilyProjection } from "./rebuildFamilyProjection";
import { validateProductRow, type ProductRowInput } from "./validateProductRow";

// Mirrors frontend/lib/services/productImport.ts's slugify, so a manually
// created product derives the same productKey the importer would.
function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export const createProduct = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "unauthenticated");
    }

    const db = admin.firestore();

    const callerDoc = await db
      .collection("users")
      .doc(request.auth.uid)
      .get();

    if (callerDoc.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "permission-denied");
    }

    const row = request.data as Partial<ProductRowInput> | undefined;
    if (!row || typeof row !== "object") {
      throw new HttpsError("invalid-argument", "product row is required");
    }

    const product = typeof row.product === "string" ? row.product.trim() : "";
    const productKey = product ? slugify(product) : "";

    const candidate: ProductRowInput = {
      sku: row.sku ?? "",
      product,
      productKey,
      category: row.category ?? "",
      orderableUnit: row.orderableUnit ?? "",
      packQty: row.packQty ?? 0,
      baseUnit: row.baseUnit ?? "",
      pricePer: row.pricePer ?? "",
      dealerPrice: row.dealerPrice ?? -1,
      distributorPrice: row.distributorPrice ?? -1,
      gstPct: row.gstPct ?? -1,
      segment: row.segment ?? "",
    };

    const result = validateProductRow(candidate);
    if (!result.valid) {
      throw new HttpsError("invalid-argument", result.reason);
    }

    const ref = db.collection("products").doc(result.product.sku);
    const existing = await ref.get();
    if (existing.exists) {
      throw new HttpsError(
        "already-exists",
        `SKU "${result.product.sku}" already exists`,
      );
    }

    // Prices go to product_prices (admin/accounts only), the rest to products.
    const { prices, rest } = splitPrices(result.product);
    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(ref, {
      ...rest,
      active: true,
      deleted: false,
      createdAt: now,
      updatedAt: now,
    });
    batch.set(pricesRef(db, result.product.sku), { ...prices, updatedAt: now });
    await batch.commit();

    await rebuildFamilyProjection(db, result.product.productKey);

    return { success: true, sku: result.product.sku };
  },
);
