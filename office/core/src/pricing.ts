import { assertPaise, multiplyPaise, type Paise } from "./money";
import { assertMilli, fromMilli, type Milli } from "./units";

/**
 * How a variant's price is quoted in the product master ("Price per" column):
 *  - PER_BASE_UNIT: per litre / per kg — bulk cans, barrels, buckets ("per litre")
 *  - PER_PACK:      per case / per bucket — the whole pack ("per case", "per bucket")
 *  - PER_PIECE:     per bottle inside a case ("per piece" on 35×500 ml cases)
 *
 * PRD open item F (confirm the multiply rule per category) is why this is explicit
 * rather than inferred: the line total must never silently depend on a guess.
 */
export type PriceBasis = "PER_BASE_UNIT" | "PER_PACK" | "PER_PIECE";

export interface PackPricing {
  basis: PriceBasis;
  pricePaise: Paise;
  /** Base units in one pack, in milli-units (26 L can → 26 000). */
  packQtyMilli: Milli;
  /** Bottles/tins in one pack — required for PER_PIECE (35 for "35x500 ml case"). */
  piecesPerPack?: number;
}

/** Price of ONE pack. */
export function packPricePaise(pricing: PackPricing): Paise {
  assertPaise(pricing.pricePaise, "price");
  assertMilli(pricing.packQtyMilli, "pack quantity");
  switch (pricing.basis) {
    case "PER_BASE_UNIT":
      return multiplyPaise(pricing.pricePaise, fromMilli(pricing.packQtyMilli));
    case "PER_PACK":
      return pricing.pricePaise;
    case "PER_PIECE": {
      const pieces = pricing.piecesPerPack;
      if (!pieces || !Number.isInteger(pieces) || pieces <= 0) {
        throw new RangeError("PER_PIECE pricing needs a whole piecesPerPack");
      }
      return multiplyPaise(pricing.pricePaise, pieces);
    }
  }
}

/** Value of `packs` packs before tax: lineTotal = packs × packPrice. */
export function lineValuePaise(pricing: PackPricing, packs: number): Paise {
  if (!Number.isInteger(packs) || packs < 1) throw new RangeError(`Packs must be a whole number ≥ 1, got ${packs}`);
  return multiplyPaise(packPricePaise(pricing), packs);
}

/** Map the master's free-text "Price per" to a basis. Unknown text throws — never guess. */
export function priceBasisFromLabel(label: string): PriceBasis {
  const key = label.trim().toLowerCase();
  if (key === "per litre" || key === "per liter" || key === "per kg") return "PER_BASE_UNIT";
  if (key === "per case" || key === "per bucket" || key === "per barrel") return "PER_PACK";
  if (key === "per piece") return "PER_PIECE";
  throw new RangeError(`Unknown "Price per" value: "${label}"`);
}

/** "35x500 ml case" / "20x1 liter case" / "4 x 5 kg" → pieces per pack; null if the pack is not a multi-pack. */
export function piecesPerPackFromLabel(packLabel: string): number | null {
  const match = /(\d+)\s*[x×]\s*\d/i.exec(packLabel);
  return match ? Number(match[1]) : null;
}
