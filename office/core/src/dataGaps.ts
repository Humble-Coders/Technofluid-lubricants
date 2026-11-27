/**
 * "To fill in" (Sharnya, 27 Nov 2026): everything in the product master that only Gaurav
 * can supply, worked out live from the products and stock items, so a gap disappears the
 * moment its value is saved. Pure — no Firebase, no UI.
 *
 * Some details are genuinely not needed (a product that's never sold loose has no
 * price…), so a gap can be marked "not needed" instead; questions get an answer, and the
 * old products not in the cleaned master get a keep/remove decision. Those decisions are
 * stored by the `resolveDataGap` Cloud Function in `dataGaps/{gapId}`; this module only
 * reads them. A gap whose value is filled in is gone, whatever was decided.
 *
 * Gap ids are stable, and the Cloud Function checks the same shapes:
 *   price:<sku>  hsn:<productKey>  density:<productKey>  recipe:<productKey>
 *   unit:<itemId>  itemDensity:<itemId>  code:<code, no spaces>  question:<key>  old:<sku>
 */

export type GapSection = "price" | "hsn" | "density" | "unit" | "itemDensity" | "code" | "recipe" | "question" | "old";

export const GAP_SECTIONS: readonly GapSection[] = ["price", "hsn", "density", "unit", "itemDensity", "code", "recipe", "question", "old"];

/** What a product needs to be checked. Prices are integer paise or null. */
export interface GapProduct {
  sku: string;
  name: string;
  grade: string;
  productKey: string;
  packLabel: string;
  baseUnit: "L" | "kg" | "piece";
  dealerPricePaise: number | null;
  distributorPricePaise: number | null;
  hsnCode: string | null;
  densityKgPerL: number | null;
  recipe: readonly string[];
  /** From the cleaned master (6 Oct 2026). False = an older product, waiting for a keep/remove. */
  fromMaster: boolean;
}

export interface GapStockItem {
  id: string;
  kind: "product_pool" | "raw_material" | "consumable" | "premix" | "blend";
  name: string;
  code: string | null;
  /** False = imported without a unit; an Admin sets it. */
  unitSet: boolean;
  baseUnit: "L" | "kg" | "piece";
  densityKgPerL: number | null;
  aliases: readonly string[];
  recipe: readonly string[];
}

export type GapAction = "notNeeded" | "answer" | "keep" | "remove";

/** A decision from dataGaps/{gapId}. `open` ones (undone) are passed in or left out alike. */
export interface GapDecision {
  gapId: string;
  action: GapAction;
  /** The answer (questions) or null. */
  value: string | null;
  note: string | null;
  byName: string;
  at: Date | null;
}

export interface DataGap {
  id: string;
  section: GapSection;
  /** Product name + grade, item name, the code, or the question. */
  title: string;
  /** Pack, kind, "used in …", why it matters. */
  detail: string;
  /** Products the gap is about (one for a price, every pack of the product for the rest). */
  skus: string[];
  itemId: string | null;
  /** Unknown code: what uses it. */
  usedBy: string[];
  decision: GapDecision | null;
  /** True when nothing is left to do: decided (not needed / answered / keep / remove). */
  done: boolean;
}

/** Questions only Gaurav can answer. Keys are part of the gap id; the function knows them too. */
export const GAP_QUESTIONS: readonly { key: string; question: string; why: string; choices: readonly string[] }[] = [
  {
    key: "blank-percent",
    question: "A recipe line with no % (for example \"w70/\"): what does it mean?",
    why: "Many recipes have such lines. Until we know, the app never takes stock for them automatically.",
    choices: ["It can be used instead of the line before (an alternative)", "A small top-up; the amount varies", "It's a mistake; it should have a %"],
  },
  {
    key: "recipe-basis",
    question: "Are recipe percentages by litre (volume) or by kg (weight)?",
    why: "Decides how much of each raw material production takes from stock.",
    choices: ["By litre", "By kg", "Oils by litre, greases by kg"],
  },
  {
    key: "brake-fluid",
    question: "Brake fluid has no recipe. Is it bought in ready-made and only packed here?",
    why: "If yes, it's bought and sold as it is; if not, we need its recipe.",
    choices: ["Yes, bought in ready-made", "No, we make it (recipe to follow)"],
  },
];

/** Ignoring case and spaces: "EP Additive" = "ep additive" = "epadditive" (same as the stock screens). */
export const gapCode = (code: string) => code.toLowerCase().replace(/\s+/g, "");

const fullName = (p: { name: string; grade: string }) => [p.name, p.grade].filter((x) => x.trim()).join(" ");
const codeOf = (line: string) => {
  const slash = line.lastIndexOf("/");
  return (slash >= 0 ? line.slice(0, slash) : line).trim();
};

export function dataGaps(input: { products: readonly GapProduct[]; items: readonly GapStockItem[]; decisions: readonly GapDecision[] }): DataGap[] {
  const decided = new Map(input.decisions.map((d) => [d.gapId, d]));
  const out: DataGap[] = [];
  const add = (g: Omit<DataGap, "decision" | "done">) => {
    const decision = decided.get(g.id) ?? null;
    out.push({ ...g, decision, done: decision !== null });
  };

  const master = input.products.filter((p) => p.fromMaster);
  const pools = new Map<string, GapProduct[]>();
  for (const p of master) {
    if (!p.productKey) continue;
    pools.set(p.productKey, [...(pools.get(p.productKey) ?? []), p]);
  }
  const packs = (list: GapProduct[]) => `${list.length} pack${list.length === 1 ? "" : "s"}: ${list.map((p) => p.packLabel).join(", ")}`;

  // 1. Prices: per pack (each pack has its own price).
  for (const p of master) {
    if (p.dealerPricePaise !== null && p.distributorPricePaise !== null) continue;
    add({ id: `price:${p.sku}`, section: "price", title: fullName(p), detail: p.packLabel, skus: [p.sku], itemId: null, usedBy: [] });
  }
  // 2–4. Per product (every pack shares it): HSN, density (litre products), recipe.
  for (const [key, list] of pools) {
    const title = fullName(list[0]!);
    const skus = list.map((p) => p.sku);
    if (list.some((p) => !p.hsnCode)) add({ id: `hsn:${key}`, section: "hsn", title, detail: packs(list), skus, itemId: null, usedBy: [] });
    if (list.some((p) => p.baseUnit === "L" && p.densityKgPerL === null)) add({ id: `density:${key}`, section: "density", title, detail: packs(list), skus, itemId: null, usedBy: [] });
    if (list.every((p) => p.recipe.length === 0)) add({ id: `recipe:${key}`, section: "recipe", title, detail: packs(list), skus, itemId: null, usedBy: [] });
  }

  // 5–6. Stock items: unit not set; liquids (raw materials, premixes, blends) without a density.
  const materials = input.items.filter((i) => i.kind !== "product_pool");
  for (const i of materials) {
    const what = i.kind.replace("_", " ");
    if (!i.unitSet) add({ id: `unit:${i.id}`, section: "unit", title: i.name, detail: what, skus: [], itemId: i.id, usedBy: [] });
    if (i.kind !== "consumable" && i.unitSet && i.baseUnit === "L" && i.densityKgPerL === null) {
      add({ id: `itemDensity:${i.id}`, section: "itemDensity", title: i.name, detail: what, skus: [], itemId: i.id, usedBy: [] });
    }
  }

  // 7. Recipe codes no stock item has (by code, other name or name — like the stock screens).
  const known = new Set<string>();
  for (const i of materials) for (const n of [i.code, ...i.aliases, i.name]) if (n) known.add(gapCode(n));
  const unknown = new Map<string, { shown: string; users: Set<string> }>();
  const check = (recipe: readonly string[], user: string) => {
    for (const line of recipe) {
      const shown = codeOf(line);
      const c = gapCode(shown);
      if (!c || known.has(c)) continue;
      const u = unknown.get(c) ?? { shown: shown.toLowerCase(), users: new Set<string>() };
      u.users.add(user);
      unknown.set(c, u);
    }
  };
  for (const [, list] of pools) check(list.find((p) => p.recipe.length > 0)?.recipe ?? [], fullName(list[0]!));
  for (const i of materials) check(i.recipe, i.name);
  for (const [c, u] of [...unknown].sort((a, b) => b[1].users.size - a[1].users.size || a[0].localeCompare(b[0]))) {
    const users = [...u.users].sort();
    add({ id: `code:${c}`, section: "code", title: u.shown, detail: `Used in ${users.length} recipe${users.length === 1 ? "" : "s"}`, skus: [], itemId: null, usedBy: users });
  }

  // 8. Questions.
  for (const q of GAP_QUESTIONS) add({ id: `question:${q.key}`, section: "question", title: q.question, detail: q.why, skus: [], itemId: null, usedBy: [] });

  // 9. Older products not in the cleaned master: keep or remove (removal itself is done later, by Ansh).
  for (const p of input.products.filter((x) => !x.fromMaster)) {
    add({ id: `old:${p.sku}`, section: "old", title: fullName(p) || p.sku, detail: `${p.sku} · ${p.packLabel}`, skus: [p.sku], itemId: null, usedBy: [] });
  }
  return out;
}

/** Open (still to do) gaps per section. */
export function openGapCounts(gaps: readonly DataGap[]): Record<GapSection, number> {
  const counts = Object.fromEntries(GAP_SECTIONS.map((s) => [s, 0])) as Record<GapSection, number>;
  for (const g of gaps) if (!g.done) counts[g.section] += 1;
  return counts;
}
