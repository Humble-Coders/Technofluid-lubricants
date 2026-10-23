import { formatQuantity, packsAvailable, toMilli, type BaseUnit } from "@technofluid/core";
import type { Product } from "@/services/productService";
import type { ItemKind, MovementType, StockItem } from "@/services/stockService";

export const KIND_LABEL: Record<ItemKind, string> = {
  product_pool: "Product",
  raw_material: "Raw material",
  consumable: "Consumable",
};

export const TYPE_LABEL: Record<MovementType, string> = {
  OPENING: "Opening stock",
  IN: "In",
  OUT: "Out",
  COUNT_ADJUSTMENT: "Count correction",
  REVERSAL: "Undo",
  PRODUCTION_IN: "Made",
  PRODUCTION_CONSUME: "Used in production",
};

/** Lines that can be edited (undo + corrected line); counts and undos can't. */
export const EDITABLE_TYPES: readonly MovementType[] = ["OPENING", "IN", "OUT", "PRODUCTION_IN", "PRODUCTION_CONSUME"];

/** "+26 L", "−4.5 kg" — always signed, for diary lines. */
export function signedQuantity(milli: number, unit: BaseUnit): string {
  const text = formatQuantity(Math.abs(milli), unit);
  return milli < 0 ? `−${text}` : `+${text}`;
}

/** The unit word shown next to a quantity box: "L", "kg", "pieces". */
export function unitWord(unit: BaseUnit): string {
  return unit === "piece" ? "pieces" : unit;
}

/** Products (pack sizes) that draw from one stock pool, biggest pack first. */
export function packsOfPool(item: StockItem, products: Product[]): Product[] {
  if (item.kind !== "product_pool" || !item.productKey) return [];
  return products
    .filter((p) => p.productKey === item.productKey && p.active && p.packQty > 0)
    .sort((a, b) => b.packQty - a.packQty);
}

/** ["38 × 26 L can", "4 × 210 L barrel"] — what could be filled from what's on hand. */
export function packsSummary(item: StockItem, products: Product[]): string[] {
  const packs = packsOfPool(item, products);
  if (packs.length === 0 || item.onHandMilli <= 0) return [];
  return packs.map((p) => `${packsAvailable(item.onHandMilli, toMilli(p.packQty)).toLocaleString("en-IN")} × ${p.packLabel}`);
}

/** Lower-cased text a search box matches against: name, code and other names. */
export function searchText(item: StockItem): string {
  return [item.name, item.code ?? "", ...item.aliases].join(" ").toLowerCase();
}
