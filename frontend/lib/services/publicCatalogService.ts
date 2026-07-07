// File: frontend/lib/services/publicCatalogService.ts
import { doc, getDoc, getDocs, query, collection, where, documentId } from "firebase/firestore";

import { COLLECTIONS } from "@/lib/constants";
import { db } from "@/lib/firebase";
import type { PublicCatalogDoc } from "@/types/content";

function mapPublicCatalogDoc(
  id: string,
  data: Record<string, unknown>,
): PublicCatalogDoc {
  return {
    productKey: String(data.productKey ?? id),
    product: String(data.product ?? ""),
    category: String(data.category ?? ""),
    segment: String(data.segment ?? ""),
    packSizes: Array.isArray(data.packSizes) ? data.packSizes.map(String) : [],
  };
}

export async function getPublicCatalogDoc(
  key: string,
): Promise<PublicCatalogDoc | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.PUBLIC_CATALOG, key));
  if (!snap.exists()) return null;
  return mapPublicCatalogDoc(snap.id, snap.data());
}

const FIRESTORE_IN_QUERY_LIMIT = 30;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function getPublicCatalogByKeys(
  keys: string[],
): Promise<PublicCatalogDoc[]> {
  const uniqueKeys = Array.from(new Set(keys)).filter(Boolean);
  if (uniqueKeys.length === 0) return [];

  const results = await Promise.all(
    chunk(uniqueKeys, FIRESTORE_IN_QUERY_LIMIT).map(async (batch) => {
      const snap = await getDocs(
        query(
          collection(db, COLLECTIONS.PUBLIC_CATALOG),
          where(documentId(), "in", batch),
        ),
      );
      return snap.docs.map((d) => mapPublicCatalogDoc(d.id, d.data()));
    }),
  );

  return results.flat();
}
