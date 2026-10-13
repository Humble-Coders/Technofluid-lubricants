import { collection, onSnapshot, query, where, type Unsubscribe } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { BaseUnit } from "@technofluid/core";

/**
 * A sellable variant = one product, in one grade, in one pack size. Same `products`
 * documents the website reads (doc id = SKU), plus the grade-master fields
 * (grade, density, recipe) added when the importer is upgraded.
 */
export interface Product {
  sku: string;
  name: string;
  grade: string;
  /** Groups every pack size of one product+grade into one stock pool (PRD §7). */
  productKey: string;
  category: "bulk_oil" | "grease" | "retail" | string;
  packLabel: string;
  /** Base units in one pack, as a decimal (26 for a 26 L can). */
  packQty: number;
  baseUnit: BaseUnit;
  pricePer: string | null;
  /** Integer paise, or null when the price has not been set yet. */
  dealerPricePaise: number | null;
  distributorPricePaise: number | null;
  gstPct: number;
  segment: "Automotive" | "Industrial" | "Both" | null;
  densityKgPerL: number | null;
  recipe: string[];
}

function toProduct(id: string, d: Record<string, unknown>): Product {
  const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const str = (x: unknown): string => (typeof x === "string" ? x : "");
  const unit = str(d.baseUnit);
  const segment = str(d.segment);
  return {
    sku: str(d.sku) || id,
    name: str(d.product),
    grade: str(d.grade),
    productKey: str(d.productKey),
    category: str(d.category),
    packLabel: str(d.orderableUnit),
    packQty: num(d.packQty) ?? 0,
    baseUnit: unit === "kg" || unit === "piece" ? unit : "L",
    pricePer: str(d.pricePer) || null,
    dealerPricePaise: num(d.dealerPrice),
    distributorPricePaise: num(d.distributorPrice),
    gstPct: num(d.gstPct) ?? 18,
    segment: segment === "Automotive" || segment === "Industrial" || segment === "Both" ? segment : null,
    densityKgPerL: num(d.densityKgPerL),
    recipe: Array.isArray(d.recipe) ? d.recipe.filter((x): x is string => typeof x === "string") : [],
  };
}

/** Live list of every active product, sorted by name → grade → pack size. */
export function watchProducts(onChange: (products: Product[]) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, "products"), where("deleted", "==", false)),
    (snap) => {
      const list = snap.docs.map((doc) => toProduct(doc.id, doc.data()));
      list.sort(
        (a, b) =>
          a.name.localeCompare(b.name) ||
          a.grade.localeCompare(b.grade, undefined, { numeric: true }) ||
          a.packQty - b.packQty,
      );
      onChange(list);
    },
    onError,
  );
}
