import { describe, expect, it } from "vitest";
import { explodeRecipe, leafUses, MAX_DEPTH, needsAttention, parseRecipe, type ExplodeRun, type StockMaterial } from "./index";

type Item = StockMaterial & { code: string; aliases?: string[]; recipe?: string[]; stocked?: boolean };

const ITEMS: Item[] = [
  { id: "rm-sae40", code: "sae40", name: "sae40", baseUnit: "L", densityKgPerL: 0.89 },
  { id: "rm-w150", code: "w150", name: "w150", baseUnit: "L", densityKgPerL: 0.84 },
  { id: "rm-turbine", code: "turbine", aliases: ["tb"], name: "turbine", baseUnit: "L", densityKgPerL: 0.86 },
  { id: "rm-ppd", code: "ppd", name: "ppd", baseUnit: "L", densityKgPerL: null },
  { id: "rm-eo", code: "eo additive", name: "eo additive", baseUnit: "kg", densityKgPerL: 1.16 },
  { id: "rm-polymer", code: "polymer", aliases: ["lubimax141"], name: "polymer", baseUnit: "kg", densityKgPerL: 0.86 },
  { id: "rm-va", code: "va", name: "va", baseUnit: "L", densityKgPerL: 0.85 },
  { id: "rm-sn500", code: "sn500", aliases: ["sn500(kg)"], name: "sn500", baseUnit: "L", densityKgPerL: 0.88 },
  { id: "rm-mp3", code: "mp3", name: "mp3", baseUnit: "kg", densityKgPerL: null },
  { id: "pm-w150vi10kg", code: "w150vi10kg", name: "w150vi10kg", baseUnit: "L", densityKgPerL: null, recipe: ["w150/94.48", "lubimax141/5.52"] },
  { id: "pm-vavi10kg", code: "vavi10kg", name: "vavi10kg", baseUnit: "L", densityKgPerL: null, recipe: ["va/94.48", "lubimax141/5.52"] },
  { id: "pm-vavi5kg", code: "vavi5kg", name: "vavi5kg", baseUnit: "L", densityKgPerL: null, recipe: ["va/50", "vavi10kg/50", "lubimax141/"] },
  {
    id: "bl-r5",
    code: "r5",
    aliases: ["cf4"],
    name: "r5",
    baseUnit: "L",
    densityKgPerL: null,
    recipe: ["SAE40/45.3", "w150/15", "sn500/", "ppd/0.2", "TB/32", "w150vi10kg/7", "eo additive/0.5"],
  },
  { id: "bl-loop-a", code: "loop a", name: "loop a", baseUnit: "L", densityKgPerL: null, recipe: ["loop b/100"] },
  { id: "bl-loop-b", code: "loop b", name: "loop b", baseUnit: "L", densityKgPerL: null, recipe: ["loop a/100"] },
];

const find = (code: string) => {
  const c = code.toLowerCase().replace(/\s+/g, "");
  return ITEMS.find((i) => [i.code, ...(i.aliases ?? [])].some((x) => x.replace(/\s+/g, "") === c)) ?? null;
};
const run = (made: number | null, recipe: string[], opts: Partial<ExplodeRun<Item>> = {}): ExplodeRun<Item> => ({
  madeMilli: made,
  unit: "L",
  densityKgPerL: null,
  ingredients: parseRecipe(recipe),
  findMaterial: find,
  breakDown: (m) => (m.recipe && !m.stocked ? parseRecipe(m.recipe) : null),
  ...opts,
});
const totals = (lines: ReturnType<typeof explodeRecipe<Item>>) => {
  const out: Record<string, number> = {};
  for (const u of leafUses(lines)) out[u.material.code] = (out[u.material.code] ?? 0) + u.qtyMilli;
  return out;
};

describe("multi-level recipes", () => {
  it("1000 L of a product that is 100% r5 breaks down through r5 and its premix to raw materials", () => {
    const lines = explodeRecipe(run(1_000_000, ["r5/100"]));
    expect(lines[0]!.parts?.map((p) => [p.ingredient.code, p.status, p.qtyMilli])).toEqual([
      ["sae40", "ok", 453_000],
      ["w150", "ok", 150_000],
      ["sn500", "no_percent", null],
      ["ppd", "ok", 2_000],
      ["tb", "ok", 320_000],
      ["w150vi10kg", "ok", 70_000],
      ["eo additive", "ok", 5_800], // 5 L × 1.16 kg/L
    ]);
    expect(totals(lines)).toEqual({
      sae40: 453_000,
      w150: 150_000 + 66_136, // direct + through the premix
      ppd: 2_000,
      turbine: 320_000,
      polymer: 3_323, // 3.864 L × 0.86
      "eo additive": 5_800,
    });
    expect(leafUses(lines).find((u) => u.material.code === "polymer")?.via).toEqual(["r5", "w150vi10kg"]);
    expect(needsAttention(lines).map((l) => l.ingredient.code)).toEqual(["sn500"]);
  });

  it("a premix kept in stock is taken as itself", () => {
    const stocked = (m: Item) => (m.recipe && m.code !== "w150vi10kg" ? parseRecipe(m.recipe) : null);
    const lines = explodeRecipe(run(1_000_000, ["r5/100"], { breakDown: stocked }));
    expect(totals(lines)).toMatchObject({ w150: 150_000, w150vi10kg: 70_000 });
    expect(totals(lines).polymer).toBeUndefined();
  });

  it("nested premixes (5 kg → 10 kg) break down to raw materials; blank % lines are left for the person", () => {
    const lines = explodeRecipe(run(1_000_000, ["vavi5kg/100"]));
    expect(totals(lines)).toEqual({ va: 500_000 + 472_400, polymer: litres(27_600, 0.86) });
    expect(needsAttention(lines).map((l) => [l.ingredient.code, l.status])).toEqual([["lubimax141", "no_percent"]]);
  });

  it("each level adds up exactly to what was made", () => {
    const lines = explodeRecipe(run(10, ["sae40/33.33", "w150/33.33", "va/33.34"]));
    expect(lines.map((l) => l.qtyMilli)).toEqual([3, 3, 4]);
    expect(explodeRecipe(run(70_001, ["w150vi10kg/100"]))[0]!.parts!.map((p) => p.qtyMilli)).toEqual([66_137, 3_323]);
  });

  it("'(kg)' lines are by weight: 80 kg of sn500 counted in litres", () => {
    const lines = explodeRecipe(run(100_000, ["sn500(kg)/80", "mp3/20"], { unit: "kg", densityKgPerL: null }));
    expect(lines.map((l) => [l.ingredient.code, l.status, l.qtyMilli])).toEqual([
      ["sn500(kg)", "ok", 90_909], // 80 kg ÷ 0.88
      ["mp3", "needs_density", null], // volume line, product in kg, no density to turn it into litres
    ]);
  });

  it("unknown codes, loops and over-deep chains are never guessed", () => {
    expect(explodeRecipe(run(1_000, ["wbt100/100"]))[0]!.status).toBe("not_in_stock");
    const loop = explodeRecipe(run(1_000, ["loop a/100"]));
    expect(loop[0]!.parts![0]!.parts![0]!.status).toBe("cycle");
    const deep = explodeRecipe(run(1_000, ["r5/100"], { path: Array.from({ length: MAX_DEPTH - 1 }, (_, i) => `x${i}`) }));
    expect(deep[0]!.status).toBe("too_deep");
  });

  it("with no amount yet, the tree is shown with empty amounts", () => {
    const lines = explodeRecipe(run(null, ["r5/100"]));
    expect(lines[0]!.parts?.length).toBe(7);
    expect(leafUses(lines)).toEqual([]);
  });
});

function litres(millilitres: number, density: number) {
  return Math.round(millilitres * density);
}
