// File: frontend/app/(public)/_components/industryIcons.tsx
// Maps each industry to a photo + sector by keyword-matching its slug.
// Structural UI logic only — grouping is visual, not client copy.

const RULES: { test: RegExp; sector: string }[] = [
  { test: /mining|stone-crusher/, sector: "Mining & Quarrying" },
  { test: /earth-movers/, sector: "Earthmoving & Construction" },
  { test: /automobile-plants/, sector: "Automotive Manufacturing" },
  { test: /cement-plants/, sector: "Cement & Building Materials" },
  { test: /textile-and-garment/, sector: "Textile & Garment" },
  {
    test: /chemical-and-petrochemical|fertilizer|plastic-and-polymer|rubber-industry/,
    sector: "Chemical & Process",
  },
  {
    test: /food-processing|sugar-industry|agriculture-and-farming/,
    sector: "Food, Sugar & Agriculture",
  },
  { test: /pharmaceutical-units/, sector: "Pharmaceutical" },
  {
    test: /paper-industry|printing-industry|packaging-industry/,
    sector: "Paper, Printing & Packaging",
  },
  { test: /marine-and-shipping/, sector: "Marine & Shipping" },
  { test: /aviation-industry/, sector: "Aviation" },
  { test: /power-generation/, sector: "Power Generation" },
  { test: /glass-industry/, sector: "Glass" },
  {
    test: /furnace|steel-plants|sponge-iron|alloy-steel|rolling-mills|foundries|cold-rolling/,
    sector: "Metals & Steel",
  },
];

const DEFAULT_SECTOR = "General Manufacturing";

// Real photos supplied per industry, keyed by slug keyword — falls back to
// a general-manufacturing shot for industries without a dedicated photo yet.
const IMAGE_RULES: { test: RegExp; image: string }[] = [
  { test: /alloy-steel/, image: "/industries/alloy-steel.png" },
  { test: /electric-arc-furnace/, image: "/industries/electric-arc-furnace.png" },
  { test: /sponge-iron/, image: "/industries/iron-sponge.png" },
  { test: /^mining$/, image: "/industries/mining.png" },
  { test: /rolling-mills/, image: "/industries/rolling-mill.png" },
  { test: /cold-rolling/, image: "/industries/colc-rolling.png" },
  { test: /rubber-industry/, image: "/industries/rubber.png" },
  { test: /integrated-steel-plants/, image: "/industries/steel-plant.png" },
  { test: /earth-movers/, image: "/industries/earth-movers.png" },
  { test: /automobile-plants/, image: "/industries/automobile.png" },
  { test: /foundries/, image: "/industries/foundries.png" },
  { test: /cement-plants/, image: "/industries/cement.png" },
  { test: /textile-and-garment/, image: "/industries/textile.png" },
  { test: /chemical-and-petrochemical/, image: "/industries/chemical.png" },
  { test: /paper-industry/, image: "/industries/paper.png" },
  { test: /stone-crusher/, image: "/industries/stone-crusher.png" },
  { test: /sugar-industry/, image: "/industries/sugar.png" },
  { test: /marine-and-shipping/, image: "/industries/marine.png" },
  { test: /power-generation/, image: "/industries/thermal.png" },
  { test: /agriculture-and-farming/, image: "/industries/agriculture.png" },
  { test: /food-processing/, image: "/industries/food.png" },
  { test: /pharmaceutical-units/, image: "/industries/pharma.png" },
  { test: /plastic-and-polymer/, image: "/industries/plastic.png" },
  { test: /aviation-industry/, image: "/industries/aviation.png" },
  { test: /glass-industry/, image: "/industries/glass.png" },
  { test: /fertilizer-industry/, image: "/industries/fertilizers.png" },
  { test: /packaging-industry/, image: "/industries/packaging.png" },
  { test: /printing-industry/, image: "/industries/printing.png" },
];

// Every current industry has a dedicated photo (see IMAGE_RULES above); this
// only guards against a future industry being added without one.
const DEFAULT_IMAGE = "/industries/foundries.png";

export function getIndustryImage(slug: string): string {
  return IMAGE_RULES.find((r) => r.test.test(slug))?.image ?? DEFAULT_IMAGE;
}

// UI-only grouping for the industries filter — not client copy, mirrors the
// icon keyword-match above so every industry has exactly one sector.
export function getIndustrySector(slug: string): string {
  const rule = RULES.find((r) => r.test.test(slug));
  return rule?.sector ?? DEFAULT_SECTOR;
}
