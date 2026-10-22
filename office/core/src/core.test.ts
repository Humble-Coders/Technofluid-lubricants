import { describe, expect, it } from "vitest";
import {
  checkGstin,
  parseRecipe,
  proposeConsumption,
  recipeTotalBp,
  parseAlternates,
  indiaDate,
  parseQuantityToMilli,
  formatINR,
  formatQuantity,
  formatRate,
  gstinCheckChar,
  groupIndian,
  invoiceTotals,
  kgToLitresMilli,
  lineValuePaise,
  litresToKgMilli,
  multiplyPaise,
  packPricePaise,
  packsAvailable,
  packsToMilli,
  paiseToRupees,
  percentOfPaise,
  piecesPerPackFromLabel,
  priceBasisFromLabel,
  roundOffToRupee,
  rupeesToPaise,
  sumPaise,
  supplyType,
  taxLine,
  toMilli,
  fromMilli,
} from "./index";

describe("money", () => {
  it("parses typed rupees exactly, without float error", () => {
    expect(rupeesToPaise("0.29")).toBe(29);
    expect(rupeesToPaise("1,23,456.78")).toBe(12345678);
    expect(rupeesToPaise("₹ 99")).toBe(9900);
    expect(rupeesToPaise(".5")).toBe(50);
    expect(rupeesToPaise("-10.005")).toBe(-1001);
    expect(rupeesToPaise("10.004")).toBe(1000);
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
    expect(() => rupeesToPaise("abc")).toThrow();
    expect(() => rupeesToPaise("")).toThrow();
  });

  it("formats with Indian grouping and never shows float artefacts", () => {
    expect(formatINR(12345678)).toBe("₹1,23,456.78");
    expect(formatINR(5)).toBe("₹0.05");
    expect(formatINR(-150000)).toBe("−₹1,500.00");
    expect(formatINR(100000000, { decimals: false })).toBe("₹10,00,000");
    expect(groupIndian("1234567")).toBe("12,34,567");
    expect(groupIndian("999")).toBe("999");
  });

  it("rejects non-integer paise everywhere", () => {
    expect(() => formatINR(1.5)).toThrow();
    expect(() => sumPaise([1, 2.5])).toThrow();
    expect(() => paiseToRupees(0.1)).toThrow();
  });

  it("multiplies and takes percentages with half-away-from-zero rounding", () => {
    expect(multiplyPaise(11900, 26)).toBe(309400); // ₹119/L × 26 L
    expect(multiplyPaise(333, 0.5)).toBe(167);
    expect(percentOfPaise(10000, 1800)).toBe(1800);
    expect(percentOfPaise(5, 900)).toBe(0); // 0.45 paise → 0
    expect(percentOfPaise(50, 900)).toBe(5); // 4.5 paise → 5
    expect(() => percentOfPaise(100, 18.5)).toThrow();
  });

  it("rounds an invoice to the rupee and reports the round-off line", () => {
    expect(roundOffToRupee(123449)).toEqual({ total: 123400, roundOff: -49 });
    expect(roundOffToRupee(123450)).toEqual({ total: 123500, roundOff: 50 });
    expect(paiseToRupees(12345)).toBe(123.45);
  });
});

describe("units (milli base units)", () => {
  it("converts without drift over many small movements", () => {
    let onHand = 0;
    for (let i = 0; i < 10_000; i++) onHand += toMilli(0.1);
    expect(onHand).toBe(1_000_000); // exactly 1000 L, where float litres would drift
    expect(fromMilli(2500)).toBe(2.5);
  });

  it("derives packs from base units (pack sizes share one pool)", () => {
    expect(packsAvailable(toMilli(500), toMilli(26))).toBe(19);
    expect(packsAvailable(toMilli(500), toMilli(210))).toBe(2);
    expect(packsAvailable(-100, 1000)).toBe(0);
    expect(packsToMilli(3, toMilli(17.5))).toBe(52500);
    expect(() => packsToMilli(1.5, 1000)).toThrow();
  });

  it("converts litres and kg with density", () => {
    expect(litresToKgMilli(toMilli(100), 0.84)).toBe(84000); // 100 L → 84 kg
    expect(kgToLitresMilli(toMilli(84), 0.84)).toBe(100000);
    expect(() => litresToKgMilli(1000, 0)).toThrow();
  });

  it("formats quantities for people", () => {
    expect(formatQuantity(26000, "L")).toBe("26 L");
    expect(formatQuantity(17500, "L")).toBe("17.5 L");
    expect(formatQuantity(1000, "piece")).toBe("1 piece");
  });
});

describe("typed quantities and business dates", () => {
  it("parses typed quantities into exact milli-units", () => {
    expect(parseQuantityToMilli("26")).toBe(26_000);
    expect(parseQuantityToMilli("17.5")).toBe(17_500);
    expect(parseQuantityToMilli("0.001")).toBe(1);
    expect(parseQuantityToMilli("1,250.25")).toBe(1_250_250);
    expect(parseQuantityToMilli(".5")).toBe(500);
  });

  it("refuses what isn't a plain positive quantity", () => {
    for (const bad of ["", ".", "-5", "1.2345", "abc", "1e3", "2,5.0.1"]) {
      expect(() => parseQuantityToMilli(bad)).toThrow(RangeError);
    }
  });

  it("uses India's date, not the computer's", () => {
    // 20:00 UTC on 31 Oct is already 1 Nov in India (UTC+5:30).
    expect(indiaDate(new Date("2026-10-31T20:00:00Z"))).toBe("2026-11-01");
    expect(indiaDate(new Date("2026-10-31T18:00:00Z"))).toBe("2026-10-31");
  });
});

describe("GST", () => {
  it("validates real GSTIN check digits", () => {
    const first14 = "06AABCT1332L1Z";
    const gstin = first14 + gstinCheckChar(first14);
    const ok = checkGstin(gstin.toLowerCase());
    expect(ok.valid).toBe(true);
    if (ok.valid) expect(ok.stateName).toBe("Haryana");
    const typo = gstin.slice(0, 14) + (gstin[14] === "A" ? "B" : "A");
    expect(checkGstin(typo).valid).toBe(false);
    expect(checkGstin("99AABCT1332L1Z5").valid).toBe(false);
    expect(checkGstin("123").valid).toBe(false);
  });

  it("picks CGST+SGST inside Haryana and IGST outside", () => {
    expect(supplyType("06", "06")).toBe("INTRA_STATE");
    expect(supplyType("06", "03")).toBe("INTER_STATE");
    expect(() => supplyType("06", "25")).toThrow();
  });

  it("splits CGST/SGST equally, each rounded at half the rate", () => {
    const line = taxLine({ taxablePaise: 309400, gstRateBp: 1800 }, "INTRA_STATE");
    expect(line.cgstPaise).toBe(27846);
    expect(line.sgstPaise).toBe(27846);
    expect(line.igstPaise).toBe(0);
    expect(line.totalPaise).toBe(309400 + 55692);
    const inter = taxLine({ taxablePaise: 309400, gstRateBp: 1800 }, "INTER_STATE");
    expect(inter.igstPaise).toBe(55692);
    expect(() => taxLine({ taxablePaise: 100, gstRateBp: 1801 }, "INTRA_STATE")).toThrow();
  });

  it("totals an invoice with freight, a rate summary and round-off", () => {
    const t = invoiceTotals(
      [
        { taxablePaise: 309400, gstRateBp: 1800 }, // 26 L can
        { taxablePaise: 2549500, gstRateBp: 1800 }, // 210 L barrel
        { taxablePaise: 50000, gstRateBp: 1800 }, // freight
      ],
      "06",
      "07",
    );
    expect(t.supplyType).toBe("INTER_STATE");
    expect(t.taxablePaise).toBe(2908900);
    expect(t.igstPaise).toBe(523602);
    expect(t.exactTotalPaise).toBe(3432502);
    expect(t.grandTotalPaise).toBe(3432500);
    expect(t.roundOffPaise).toBe(-2);
    expect(t.byRate).toEqual([{ gstRateBp: 1800, taxablePaise: 2908900, cgstPaise: 0, sgstPaise: 0, igstPaise: 523602 }]);
    expect(formatRate(1800)).toBe("18%");
    expect(formatRate(250)).toBe("2.5%");
  });
});

describe("pack pricing", () => {
  it("prices per litre, per pack and per piece", () => {
    const can = { basis: "PER_BASE_UNIT" as const, pricePaise: 11900, packQtyMilli: toMilli(26) };
    expect(packPricePaise(can)).toBe(309400);
    expect(lineValuePaise(can, 3)).toBe(928200);
    expect(packPricePaise({ basis: "PER_PACK", pricePaise: 181600, packQtyMilli: toMilli(12) })).toBe(181600);
    expect(packPricePaise({ basis: "PER_PIECE", pricePaise: 7500, packQtyMilli: toMilli(17.5), piecesPerPack: 35 })).toBe(262500);
    expect(() => packPricePaise({ basis: "PER_PIECE", pricePaise: 7500, packQtyMilli: 17500 })).toThrow();
    expect(() => lineValuePaise(can, 0)).toThrow();
  });

  it("reads the master's labels and refuses to guess", () => {
    expect(priceBasisFromLabel("per litre")).toBe("PER_BASE_UNIT");
    expect(priceBasisFromLabel(" Per Case ")).toBe("PER_PACK");
    expect(priceBasisFromLabel("per piece")).toBe("PER_PIECE");
    expect(() => priceBasisFromLabel("per dozen")).toThrow();
    expect(piecesPerPackFromLabel("500 ml (35x500 ml case)")).toBe(35);
    expect(piecesPerPackFromLabel("12 x 1 Kg (12 kg)")).toBe(12);
    expect(piecesPerPackFromLabel("26L cane")).toBeNull();
  });
});

describe("recipes (production)", () => {
  const items = {
    w150: { id: "raw-w150", name: "Base oil W150", baseUnit: "L" as const, densityKgPerL: 0.87 },
    ep: { id: "raw-ep", name: "EP additive", baseUnit: "kg" as const, densityKgPerL: 1.05 },
    epNoDensity: { id: "raw-ep2", name: "EP additive 2", baseUnit: "kg" as const, densityKgPerL: null },
    cans: { id: "can", name: "Empty can", baseUnit: "piece" as const, densityKgPerL: null },
  };
  const find = (code: string) =>
    code === "w150" ? items.w150 : code === "ep additive" ? items.ep : code === "ep2" ? items.epNoDensity : code === "can" ? items.cans : null;

  it("reads Gaurav's 'code/percent' format, including blanks and decimals", () => {
    expect(parseRecipe(["w150/50", " W70/ ", "ep additive/12.5", "ppd/0.25", "sn500(kg)/100"])).toEqual([
      { code: "w150", percentBp: 5000 },
      { code: "w70", percentBp: null },
      { code: "ep additive", percentBp: 1250 },
      { code: "ppd", percentBp: 25 },
      { code: "sn500(kg)", percentBp: 10000 },
    ]);
    expect(recipeTotalBp(parseRecipe(["a/50", "b/37.5", "c/12.5", "d/"]))).toBe(10_000);
  });

  it("proposes use by volume, converting to kg with the ingredient's density", () => {
    const lines = proposeConsumption({
      madeMilli: 500_000, // 500 L made
      productUnit: "L",
      productDensityKgPerL: 0.88,
      ingredients: parseRecipe(["w150/90", "ep additive/10", "w70/", "unknown/5"]),
      findMaterial: find,
    });
    expect(lines.map((l) => [l.ingredient.code, l.status, l.qtyMilli])).toEqual([
      ["w150", "ok", 450_000], // 450 L
      ["ep additive", "ok", 52_500], // 50 L × 1.05 = 52.5 kg
      ["w70", "no_percent", null],
      ["unknown", "not_in_stock", null],
    ]);
  });

  it("a product made in kg is turned into litres first; missing densities are flagged", () => {
    const [w150] = proposeConsumption({
      madeMilli: 880_000, // 880 kg at 0.88 kg/L = 1000 L
      productUnit: "kg",
      productDensityKgPerL: 0.88,
      ingredients: parseRecipe(["w150/50"]),
      findMaterial: find,
    });
    expect(w150?.qtyMilli).toBe(500_000);

    const noDensity = proposeConsumption({
      madeMilli: 100_000,
      productUnit: "kg",
      productDensityKgPerL: null,
      ingredients: parseRecipe(["w150/50", "ep2/10", "can/1"]),
      findMaterial: find,
    });
    expect(noDensity.map((l) => l.status)).toEqual(["needs_density", "needs_density", "unit_mismatch"]);
  });
});

describe("recipe alternates", () => {
  it("reads main>code/percent and skips broken entries", () => {
    expect(parseAlternates(["w150>w150n/46", " W70 > Sn 150 /12.5", "nogt/5", ">x/1"])).toEqual([
      { main: "w150", ingredient: { code: "w150n", percentBp: 4600 } },
      { main: "w70", ingredient: { code: "sn 150", percentBp: 1250 } },
    ]);
  });
});
