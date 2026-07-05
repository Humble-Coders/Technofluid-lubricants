// File: frontend/app/(public)/_components/industryIcons.tsx
// Maps each industry to a recognisable icon by keyword-matching its slug.
// Structural UI logic only — grouping is visual, not client copy.

const ICONS = {
  factory: (
    <path
      d="M3 21V10l6 3V10l6 3V6l6 4v11H3Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  furnace: (
    <>
      <path d="M5 21V9l7-5 7 5v12H5Z" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M12 12c1.5 1.7 1.5 3.3 0 5-1.5-1.7-1.5-3.3 0-5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  mountain: (
    <path
      d="m3 20 6-11 4 6 2-3 6 8H3Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  truck: (
    <>
      <path d="M3 16v-3l2-4h9v7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 11h4l3 3v2h-7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="17" cy="18" r="1.6" />
    </>
  ),
  car: (
    <>
      <path
        d="M3 16v-3l2-4h14l2 4v3M5 16h14M7 16v3M17 16v3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6 9l1.5-3h9L18 9" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  building: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1" strokeLinecap="round" />
    </>
  ),
  spool: (
    <>
      <path d="M6 3h12M6 21h12" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M7 3c0 6 10 12 10 18M17 3c0 6-10 12-10 18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  flask: (
    <>
      <path
        d="M9 2h6M10 2v6l-5.5 10a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 8V2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7.5 15h9" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  wheat: (
    <path
      d="M12 22V9m0 0c-3 0-4-2-4-4 2 0 4 1 4 4Zm0 0c3 0 4-2 4-4-2 0-4 1-4 4Zm0 5c-3 0-4-2-4-4 2 0 4 1 4 4Zm0 0c3 0 4-2 4-4-2 0-4 1-4 4Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  pill: (
    <>
      <rect
        x="4"
        y="9"
        width="16"
        height="7.5"
        rx="3.75"
        transform="rotate(-35 12 12.75)"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 9.5 14.5 16"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="rotate(-35 12 12.75)"
      />
    </>
  ),
  document: (
    <>
      <path
        d="M7 2h7l4 4v16H7V2Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 2v4h4M9 13h6M9 17h6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  anchor: (
    <>
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v14M7 13H3a9 9 0 0 0 9 8 9 9 0 0 0 9-8h-4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  plane: (
    <path
      d="M12 2v20M4 8l16 6M4 18l8-4 8 4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  bolt: (
    <path
      d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  glass: (
    <path
      d="M6 3h12l-1.5 14a4.5 4.5 0 0 1-9 0L6 3Zm0 5h12"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

const RULES: { test: RegExp; icon: keyof typeof ICONS; sector: string }[] = [
  { test: /mining|stone-crusher/, icon: "mountain", sector: "Mining & Quarrying" },
  { test: /earth-movers/, icon: "truck", sector: "Earthmoving & Construction" },
  { test: /automobile-plants/, icon: "car", sector: "Automotive Manufacturing" },
  { test: /cement-plants/, icon: "building", sector: "Cement & Building Materials" },
  { test: /textile-and-garment/, icon: "spool", sector: "Textile & Garment" },
  {
    test: /chemical-and-petrochemical|fertilizer|plastic-and-polymer|rubber-industry/,
    icon: "flask",
    sector: "Chemical & Process",
  },
  {
    test: /food-processing|sugar-industry|agriculture-and-farming/,
    icon: "wheat",
    sector: "Food, Sugar & Agriculture",
  },
  { test: /pharmaceutical-units/, icon: "pill", sector: "Pharmaceutical" },
  {
    test: /paper-industry|printing-industry|packaging-industry/,
    icon: "document",
    sector: "Paper, Printing & Packaging",
  },
  { test: /marine-and-shipping/, icon: "anchor", sector: "Marine & Shipping" },
  { test: /aviation-industry/, icon: "plane", sector: "Aviation" },
  { test: /power-generation/, icon: "bolt", sector: "Power Generation" },
  { test: /glass-industry/, icon: "glass", sector: "Glass" },
  {
    test: /furnace|steel-plants|sponge-iron|alloy-steel|rolling-mills|foundries|cold-rolling/,
    icon: "furnace",
    sector: "Metals & Steel",
  },
];

const DEFAULT_SECTOR = "General Manufacturing";

export function getIndustryIcon(slug: string) {
  const rule = RULES.find((r) => r.test.test(slug));
  return ICONS[rule?.icon ?? "factory"];
}

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
