# Canva guide — hero image composites (client changes Aug 2026)

Everything you need is in this `canva-kit/` folder, organized per slide.
File names tell you the position: `1-FAR-LEFT-…`, `3-CENTER-…`, etc.

## Ground rules (apply to every slide)

1. **Backgrounds:** get the product-free versions of the 7 files listed below
   (they live in `frontend/public/`). Every hero slide canvas is **1536 × 1024**;
   the automotive card is **1672 × 941**. Create each Canva design at exactly
   that size and export PNG at 1× (no scaling).
2. **Remove the white background** from each product photo (Canva → Edit photo
   → BG Remover). The cutouts are clean studio shots, so this works well.
3. **Never stretch** — resize only from corner handles (keeps proportions).
4. **One baseline:** align all bottoms on a common line at about **y = 985**
   (≈40 px above the bottom edge). Products must look like they stand on the
   same floor.
5. **Overlap slightly** (10–20 px) so the group reads as one bunch; the CENTER
   item sits in front (right-click → Bring to front).
6. **Shadow:** Edit photo → Shadows → Drop. Low transparency (~25), high blur
   (~25), offset straight down. Same setting on every product.
7. **Export:** PNG, exact canvas size, and name the file exactly like the
   background you replaced (e.g. `heart-2.png`), then hand them back to me.

Heights below are starting points for a 1024-px-tall slide — the tallest item
in a bunch should be ~43–45% of slide height, matching the current slides.
Nudge visually, but KEEP THE RATIOS between products — that's what the client
cares about.

---

## 1 — Automotive category card → replaces `automobiles-card-2.png` (1672 × 941)

Use `1-automotive-card/bunch-full.png` **as one single piece** (sizing inside
it is already correct from the flyer). Remove its white bg, scale to ~85% of
card width, bottom-center.

## 2 — JCB / crane slide → replaces `crane-2.png` (1536 × 1024)

Use `2-crane-slide/bunch-full.png` as one piece. Scale to ~80% of slide width,
bottom-center, in front of the excavator. It must fully cover the old products.

## 3 — Heart slide → replaces `heart-2.png` (1536 × 1024)

Left → right, from `3-heart-slide/`:
| Pos | File | Height |
|---|---|---|
| LEFT corner | Engine Oil 15W40 5L | **400 px** |
| CENTER (front) | Engine Oil SN 5W30 3.5L | **360 px** (slightly smaller — client explicit) |
| RIGHT corner | Engine Oil SN 10W40 5L | **400 px** |

## 4 — Man / refinery slide → replaces `industry-hero.png` (1536 × 1024)

Left → right, from `4-man-slide/`. Keep the man's face + thumbs-up visible.
| Pos | File | Height |
|---|---|---|
| FAR LEFT | Hydraulic HLP AW 68, 5L can | **260 px** |
| LEFT | Q39 drum | **430 px** |
| CENTER (front) | Transformer Oil drum | **445 px** |
| RIGHT | HT 32 Premium drum | **430 px** |
| FAR RIGHT | Cutting Oil 5L can | **260 px** |

Ratio rule (from the JCB flyer): a 5L can is ~60% of a drum's height.

## 5 — Bike slide → replaces `bike-2.png` (1536 × 1024)

Left → right, from `5-bike-slide/`:
| Pos | File | Height |
|---|---|---|
| FAR LEFT | 4T 10W-30 (blue) 1L | **260 px** |
| LEFT | 4T 20W-40 (gold) 1L | **260 px** |
| CENTER (front) | Engine Oil 15W50 2.5L | **380 px** (slightly bigger — client explicit) |
| RIGHT | 4T 20W-40 Semi Synthetic 1L | **260 px** |
| FAR RIGHT | 4T 20W-50 1L | **260 px** |

(The left/right ordering of the four 1L bottles is my color-balance pick —
swap freely, only the center is fixed.)

## 6 — Spotlight slide → replaces `product-2.png` (1536 × 1024)

Left → right, from `6-spotlight-slide/`:
| Pos | File | Height |
|---|---|---|
| FAR LEFT | RPO 906 blue drum | **430 px** |
| LEFT | Hydraulic HVI AW 68 green drum | **430 px** |
| CENTER (front) | Grease AP-3 red bucket | **260 px** (client: "height equal to a 5-liter can") |
| RIGHT | Hydraulic HLP AW 68 green drum | **430 px** |
| FAR RIGHT | LUBE 320 blue drum | **430 px** |

Symmetry matters here: blue / green / bucket / green / blue.

## 7 — Molecules slide → replaces `molecules-2.png` (1536 × 1024)

Left → right, from `7-molecules-slide/`:
| Pos | File | Height |
|---|---|---|
| FAR LEFT | Submersible Motor Oil 22 drum | **420 px** |
| LEFT | Chain Oil HT drum | **420 px** |
| CENTER-LEFT (front) | Rotavator Gear 140 3L | **285 px** |
| CENTER-RIGHT (front) | Engine Oil SP 0W-20 3.5L | **285 px** (SAME size as the 3L — client explicit) |
| RIGHT | PVC Oil drum | **420 px** |
| FAR RIGHT | Semi Synthetic Cutting Oil drum | **420 px** |

---

## Checklist per slide before export
- [ ] Center item in front, group bottom-aligned on one line
- [ ] Client's explicit sizes respected (3 slides have them: heart, bike, molecules/spotlight)
- [ ] Old products fully covered by the new bunch
- [ ] Shadows consistent
- [ ] Exported at exact canvas size with the exact background filename
