# Master stock data — cleaned from Gaurav's sheet

**Source:** Google Sheet "Technofluid-Product-Master-GRADES" (id `1P2F2T0kqQtA_8qwuzpPq7rtRic02jMTP9yaEpBEhPLw`), exported 22 Oct 2026. The sheet was last edited 6 Oct 2026 — i.e. this includes our 6 Oct clean-up of the main tab. Gaurav's sheet was **not** changed.
**Regenerate:** `python3 scripts/build_master_stock_data.py <export.xlsx> office/data/master` (needs `openpyxl`). Deterministic; safe to re-run.
**For:** the step-2 importer (stock items + multi-level recipes) in Technofluid Office.

## Files
| File | What | Count |
|---|---|---|
| `raw-materials.json` | Sheet1 rows 20+ → stock items, `kind: raw_material` (base oils, additives, ready greases…) | 48 |
| `consumables.json` | Sheet1 rows 2–19 → stock items, `kind: consumable` (cans, caps, cartons; empty weight in grams) | 18 |
| `premixes.json` | Sheet2 → "VI" premixes (base oil + Lubimax 141 polymer). Header says **% in litre** | 12 |
| `blends.json` | Sheet3 → house base blends (r5, sn, g90, va17.3, h68, tq…) | 24 |
| `product-recipes.json` | Main tab cols F–L → one recipe per **stock pool** (product + grade), with its SKUs | 172 pools, 170 with a recipe |
| `resolution.json` | Every ingredient code used anywhere → what it resolves to; unresolved + ambiguous codes | 81 resolved, 13 unresolved |
| `source/sheet1.csv`, `sheet2.csv`, `sheet3.csv` | The three tabs exactly as exported (traceability) | |

## Conventions
- **Codes** are lower case with single spaces (`sae40`, `eo additive`, `c red gel`). Gaurav's other spellings are in `aliases` (e.g. `w500` ← `w600`, `hlp`, `n100`; `turbine` ← `tb`; `polymer` ← `lubimax141`). Match ingredient codes against `code` **or** `aliases`, also ignoring spaces.
- **Percentages** are integer **basis points** (`pctBp`: 45.3% → 4530). `pctBp: null` = the sheet gave no percent (meaning unconfirmed — currently read as "alternative", never auto-deducted).
- `resolvesTo: {kind, code}` on every recipe line: `raw_material` | `premix` | `blend`, or `null` if unknown.
- `flags` on every item list each assumption or gap in plain words. Nothing is guessed silently.
- Display names fix obvious typos (`caton`→`carton`, `whie`→`white`, `concenterate`→`concentrate`); the original spelling stays as an alias so recipes still match.
- Stock-pool keys use the same `productKey` slug as `products` (`slug(product + " " + grade)`), so pool id = `pool_${productKey}`.

## What checks out
- **All 12 premixes and all 23 blends with a recipe total exactly 100%.** All 170 product recipes total 100% (blank-% lines excluded).
- **132 of 170 product recipes resolve fully** down to raw materials (through blends/premixes). 38 are blocked by the codes below.
- **66 pools are one-ingredient recipes** (`singleIngredient`): filled straight from one item — e.g. Diesel 15W-40 CF4 = blend `r5`, White Oil 32 = `w150`. For ready greases (`c red gel`, `ap3`…) and brake fluid this likely means **bought in and repacked** — to confirm with Gaurav.

## Open — needs Gaurav (do not guess)
**Ingredient codes used in recipes but not defined in Sheet1/2/3:**

| Code | Used in | Examples |
|---|---|---|
| `ep additive` | 16 | blend: g140, blend: g75w90, blend: g90, blend: gl5 |
| `toy` | 10 | circulating-oil-32, electrical-insulating-oil-submersible-motor-starter-oil, hydraulic-oil-aw-32, rubber-process-oils-elastol-541 |
| `tor` | 10 | circulating-oil-32, electrical-insulating-oil-submersible-motor-starter-oil, hydraulic-oil-aw-32, rust-preventive-oil-906 |
| `w60` | 10 | circulating-oil-32, electrical-insulating-oil-submersible-motor-starter-oil, knitting-oil-non-washable-22, knitting-oil-water-soluble-22 |
| `wbt100` | 6 | coning-oil-22, coning-oil-32, knitting-oil-water-soluble-22, knitting-oil-water-soluble-32 |
| `n500vi10kg` | 4 | gear-ep-series-150, gear-ep-series-220, gear-ep-series-320, gear-ep-series-460 |
| `tb additive` | 4 | turbine-oils-100, turbine-oils-32, turbine-oils-46, turbine-oils-68 |
| `tq additive` | 2 | blend: tfsae30, blend: tq |
| `hsd` | 2 | spindle-oil-2, spindle-oil-5 |
| `utto additive` | 1 | blend: wet brake oil |
| `cutting oil` | 1 | cutting-oil |
| `ht additive` | 1 | ht-32-premium |
| `2cst` | 1 | shock-absorber-oil-2-5w |

**Ambiguous:** `n500vi10kg` could be sn500vi10kg or w500vi10kg (Gear EP 150–460) — ask Gaurav
**Assumed aliases (applied, flagged):** `nvi10kg` → `n4vi10kg`, `sn500(kg)` → `sn500`

**Other gaps:**
- Recipe **% basis**: Sheet2 header says *% in litre* (premixes = by volume). Blends and product recipes don't say — by volume assumed.
- Meaning of a **blank %** (e.g. `w70/`): alternative ingredient?
- **Intermediates** (premixes, blends): made and stocked, or always broken down to raw materials?
- **No unit** in the sheet: `sae40`, `anti oxidant`, `anti rust`, `anti wear`, `friction modifier`, `v2`, `s2`.
- **No density** (kg↔L impossible): 31 raw materials, incl. `ppd`, `mp3`, `c red gel`, `g red gel`, `slr`, `wb`, `aplr`, `ap3`….
- **Cost** columns are empty everywhere (Sheet1 cost / freight / effective cost).
- Starter-oil cartons 4×3.5 / 4×4 / 4×4.5 / 4×5 L: weight not filled ("______").
- `roll perfect 46` is both a raw material and a finished product (ROLL PERFECT 46 (SOLUBLE)) — likely bought in.
- `brake fluid` (Sheet3) has aliases DOT 3/4/5 but no recipe — a bought-in product, not a blend.
