import { collection, onSnapshot, query, where, type QueryDocumentSnapshot, type Unsubscribe } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { BaseUnit } from "@technofluid/core";
import { pricesFromDoc, watchPrices } from "./priceService";

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
  /** Tax classification code printed on invoices (4/6/8 digits), or null until set. */
  hsnCode: string | null;
  segment: "Automotive" | "Industrial" | "Both" | null;
  densityKgPerL: number | null;
  recipe: string[];
  /** false = hidden from new sales (not deleted). */
  active: boolean;
}

function toProduct(id: string, d: Record<string, unknown>, priceDoc?: Record<string, unknown>): Product {
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
    ...pricesFromDoc(priceDoc ?? d),
    gstPct: num(d.gstPct) ?? 18,
    hsnCode: str(d.hsnCode) || null,
    segment: segment === "Automotive" || segment === "Industrial" || segment === "Both" ? segment : null,
    densityKgPerL: num(d.densityKgPerL),
    recipe: Array.isArray(d.recipe) ? d.recipe.filter((x): x is string => typeof x === "string") : [],
    active: d.active !== false,
  };
}

/**
 * Live list of every active product, sorted by name → grade → pack size. With
 * `withPrices` (Admin / Accounts) each product also gets its prices; roles that can't
 * see prices never ask for them (the security rules would refuse anyway).
 */
export function watchProducts(
  options: { withPrices: boolean },
  onChange: (products: Product[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  let docs: QueryDocumentSnapshot[] | null = null;
  let prices: Map<string, Record<string, unknown>> | null = options.withPrices ? null : new Map();

  const emit = () => {
    if (!docs || !prices) return;
    const priceMap = prices;
    const list = docs.map((doc) =>
      toProduct(doc.id, options.withPrices ? doc.data() : withoutPrices(doc.data()), priceMap.get(doc.id)),
    );
    list.sort(
      (a, b) =>
        a.name.localeCompare(b.name) ||
        a.grade.localeCompare(b.grade, undefined, { numeric: true }) ||
        a.packQty - b.packQty,
    );
    onChange(list);
  };

  const stopProducts = onSnapshot(
    query(collection(db, "products"), where("deleted", "==", false)),
    (snap) => {
      docs = snap.docs;
      emit();
    },
    onError,
  );
  const stopPrices = options.withPrices
    ? watchPrices((map) => {
        prices = map;
        emit();
      }, onError)
    : () => {};

  return () => {
    stopProducts();
    stopPrices();
  };
}

/** Drops any not-yet-migrated price fields, for roles that must not see prices. */
function withoutPrices(d: Record<string, unknown>): Record<string, unknown> {
  const { pricePer: _pricePer, dealerPrice: _dealer, distributorPrice: _distributor, ...rest } = d;
  return rest;
}
