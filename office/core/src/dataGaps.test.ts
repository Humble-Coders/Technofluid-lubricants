import { describe, expect, it } from "vitest";
import { dataGaps, GAP_QUESTIONS, gapCode, openGapCounts, type GapProduct, type GapStockItem } from "./dataGaps";

const product = (over: Partial<GapProduct>): GapProduct => ({
  sku: "X-26L",
  name: "HYDRAULIC OIL",
  grade: "68",
  productKey: "hydraulic-oil-68",
  packLabel: "26L cane",
  baseUnit: "L",
  dealerPricePaise: 10000,
  distributorPricePaise: 9000,
  hsnCode: "27101980",
  densityKgPerL: 0.87,
  recipe: ["h68/100"],
  fromMaster: true,
  ...over,
});
const item = (over: Partial<GapStockItem>): GapStockItem => ({
  id: "bl-h68",
  kind: "blend",
  name: "h68",
  code: "h68",
  unitSet: true,
  baseUnit: "L",
  densityKgPerL: 0.822,
  aliases: [],
  recipe: ["w150/100"],
  ...over,
});
const w150 = item({ id: "rm-w150", kind: "raw_material", name: "w150", code: "w150", recipe: [] });
const ids = (gaps: ReturnType<typeof dataGaps>) => gaps.filter((g) => g.section !== "question").map((g) => g.id);

describe("data gaps (To fill in)", () => {
  it("a complete product and its materials leave only the questions", () => {
    const gaps = dataGaps({ products: [product({})], items: [item({}), w150], decisions: [] });
    expect(ids(gaps)).toEqual([]);
    expect(gaps.filter((g) => g.section === "question").map((g) => g.id)).toEqual(GAP_QUESTIONS.map((q) => `question:${q.key}`));
  });

  it("price per pack; HSN, density and recipe once per product with all its packs", () => {
    const a = product({ sku: "A-26L", dealerPricePaise: null, hsnCode: null, densityKgPerL: null, recipe: [] });
    const b = product({ sku: "A-210L", packLabel: "210L barrel", hsnCode: "27101980", recipe: [] });
    const gaps = dataGaps({ products: [a, b], items: [item({}), w150], decisions: [] });
    expect(ids(gaps)).toEqual(["price:A-26L", "hsn:hydraulic-oil-68", "density:hydraulic-oil-68", "recipe:hydraulic-oil-68"]);
    const hsn = gaps.find((g) => g.id === "hsn:hydraulic-oil-68")!;
    expect(hsn.skus).toEqual(["A-26L", "A-210L"]);
    expect(hsn.title).toBe("HYDRAULIC OIL 68");
    expect(hsn.detail).toBe("2 packs: 26L cane, 210L barrel");
  });

  it("density only matters for litre products", () => {
    const gaps = dataGaps({ products: [product({ baseUnit: "kg", densityKgPerL: null })], items: [item({}), w150], decisions: [] });
    expect(ids(gaps)).toEqual([]);
  });

  it("stock items: unit not set; liquids without density (not packing items, not pools)", () => {
    const items = [
      item({}),
      w150,
      item({ id: "rm-tor", kind: "raw_material", name: "tor", code: "tor", unitSet: false, densityKgPerL: 0.824, recipe: [] }),
      item({ id: "rm-toy", kind: "raw_material", name: "toy", code: "toy", densityKgPerL: null, recipe: [] }),
      item({ id: "cons-cap", kind: "consumable", name: "cap", code: null, baseUnit: "L", densityKgPerL: null, recipe: [] }),
      item({ id: "pool_x", kind: "product_pool", name: "x", code: null, unitSet: false, densityKgPerL: null, recipe: [] }),
    ];
    expect(ids(dataGaps({ products: [product({})], items, decisions: [] }))).toEqual(["unit:rm-tor", "itemDensity:rm-toy"]);
  });

  it("unknown recipe codes, matched like the stock screens (code, other name or name; no case, no spaces)", () => {
    const products = [
      product({ recipe: ["EP Additive/5", "w150/95"] }),
      product({ sku: "B-26L", name: "GEAR OIL", grade: "90", productKey: "gear-oil-90", recipe: ["epadditive/4", "Toy/96"] }),
      product({ sku: "B-210L", name: "GEAR OIL", grade: "90", productKey: "gear-oil-90", recipe: ["epadditive/4", "Toy/96"] }),
    ];
    const items = [item({ recipe: ["w60/100"] }), item({ id: "rm-w150", kind: "raw_material", name: "base oil 150", code: "w150n", aliases: ["W 150"], recipe: [] })];
    const gaps = dataGaps({ products, items, decisions: [] }).filter((g) => g.section === "code");
    expect(gaps.map((g) => [g.id, g.title, g.usedBy])).toEqual([
      ["code:epadditive", "ep additive", ["GEAR OIL 90", "HYDRAULIC OIL 68"]],
      ["code:toy", "toy", ["GEAR OIL 90"]],
      ["code:w60", "w60", ["h68"]],
    ]);
    expect(gaps[0]!.detail).toBe("Used in 2 recipes");
    expect(gapCode(" EP  Additive ")).toBe("epadditive");
  });

  it("older products (not from the cleaned master) wait for keep/remove and aren't checked otherwise", () => {
    const old = product({ sku: "OLD-1", name: "Engine Oil 20W", grade: "", productKey: "engine-oil-20w", dealerPricePaise: null, hsnCode: null, recipe: [], fromMaster: false });
    const gaps = dataGaps({ products: [product({}), old], items: [item({}), w150], decisions: [] });
    expect(ids(gaps)).toEqual(["old:OLD-1"]);
    expect(gaps.find((g) => g.id === "old:OLD-1")!.detail).toBe("OLD-1 · 26L cane");
  });

  it("decisions mark gaps done; a value filled in removes the gap whatever was decided", () => {
    const a = product({ sku: "A-26L", dealerPricePaise: null, hsnCode: null });
    const decisions = [
      { gapId: "price:A-26L", action: "notNeeded" as const, value: null, note: "Not sold loose", byName: "Gaurav", at: null },
      { gapId: "question:recipe-basis", action: "answer" as const, value: "By litre", note: null, byName: "Gaurav", at: null },
      { gapId: "hsn:gone-product", action: "notNeeded" as const, value: null, note: null, byName: "Gaurav", at: null },
    ];
    const gaps = dataGaps({ products: [a], items: [item({}), w150], decisions });
    expect(gaps.find((g) => g.id === "price:A-26L")).toMatchObject({ done: true, decision: { note: "Not sold loose" } });
    expect(gaps.find((g) => g.id === "hsn:hydraulic-oil-68")!.done).toBe(false);
    expect(gaps.find((g) => g.id === "question:recipe-basis")!.decision!.value).toBe("By litre");
    expect(gaps.some((g) => g.id === "hsn:gone-product")).toBe(false);
    const counts = openGapCounts(gaps);
    expect(counts.price).toBe(0);
    expect(counts.hsn).toBe(1);
    expect(counts.question).toBe(GAP_QUESTIONS.length - 1);
  });
});
