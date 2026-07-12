# Handoff: Ticket #16 — [PUB3] Product photos on catalogue pages (detail, cards, hero)

**Ticket:** #16 — Product photos on catalogue pages (detail, cards, hero)

## Summary

Wires the already-committed product photo assets (`frontend/public/product-photos/**`) and manifest (`frontend/content/product-images.json`) onto the two public catalogue pages that previously rendered text-only. `/products/[slug]` now shows a hero packshot with a clickable thumbnail gallery in a new `ProductGallery` client component; `/products` listing cards show the series' primary photo in place of the icon header. Both are driven entirely by a new `imagesForSeries(slug)` accessor in `lib/catalogue.ts`, so a series with no manifest entry (17 of 36 today) falls through to the existing text-only layout with no broken image and no layout gap. On mobile, the photo/gallery block is reordered (via CSS grid `order`) to render before the descriptive text, collapsing back to a right-hand sticky sidebar on desktop.

## Files changed

- `frontend/types/content.ts` — added `ProductImage`, `ProductImages`, `ProductImagesManifest` types matching the manifest's JSON shape.
- `frontend/lib/catalogue.ts` — imports `product-images.json` and adds `imagesForSeries(slug): ProductImages | null`, the single lookup point used by both pages.
- `frontend/app/(public)/products/[slug]/_components/ProductGallery.tsx` (new, client component) — renders the primary image large (`next/image`, `fill`, aspect-square box) with a caption, plus a thumbnail row; clicking a thumbnail swaps the main image via local `useState`. Alt text is built from the series display name + the selected image's `label`/`packSize`.
- `frontend/app/(public)/products/[slug]/page.tsx` — calls `imagesForSeries(slug)`; renders `<ProductGallery>` at the top of the sidebar only when a manifest entry exists; added `order-1 lg:order-2` / `order-2 lg:order-1` on the sidebar/content columns so the photo appears before the text on mobile.
- `frontend/app/(public)/products/_components/ProductSeriesCard.tsx` — calls `imagesForSeries(seriesSlug(series))`; when present, renders the primary photo (`next/image`, `fill`, `aspect-[4/3]` box) above the card header in place of the icon chip; alt text combines the series display name with the matching manifest image's `label` (found by matching `src === primary`). Falls back to the original icon+text card when no entry exists.

## How to test

1. `cd frontend && npm run dev`, visit in a browser (no auth needed — public routes):
   - **Covered series**, e.g. `/products/hydraulic-oil-technofluid-hydraulic-oil-hlp` — confirm a hero photo renders with a thumbnail row below it, and clicking a different thumbnail swaps the main image.
   - **Uncovered series**, e.g. `/products/grease-technofluid-calcium-base-grease` — confirm the page renders exactly as before (no photo block, no broken `<img>`, no layout gap).
   - `/products` — confirm covered series' cards show their primary photo; uncovered series' cards keep the icon+text layout.
   - `/products?category=greases` — confirm every card in this category (none have photos yet) degrades cleanly.
   - Resize to a mobile width on `/products/hydraulic-oil-technofluid-hydraulic-oil-hlp` — confirm the photo/gallery block appears above the description text, not below it.
2. `cd frontend && npm run build && npm run lint` — both clean for the files this ticket touches (pre-existing lint errors in unrelated files — `useVisits.ts`, `useSalespersonOrders.ts`, `useSalespersonDistributors.ts` — are outside this ticket's scope and were not introduced here).
3. Sanity-check "data-driven, no code change" claim: add a throwaway key to `frontend/content/product-images.json` for any currently-uncovered series slug pointing at an existing image path, reload `/products` and that series' detail page, confirm the photo appears — then revert the manifest edit.

## Acceptance criteria

- [x] A covered series (`/products/hydraulic-oil-technofluid-hydraulic-oil-hlp`) shows its primary photo + thumbnails; clicking a thumbnail swaps the main image.
- [x] An uncovered series (verified: greases, e.g. `grease-technofluid-calcium-base-grease`) renders with no broken images and no layout gap — confirmed no `product-photos` references or extra `<img>` tags in the rendered HTML for that route.
- [x] `/products` listing cards show the primary photo for covered series and degrade cleanly for the rest (verified the full `?category=greases` listing has zero photo references).
- [x] All images go through `next/image` with meaningful `alt` text; no raw `<img>` for these — both `ProductGallery` and `ProductSeriesCard` use `next/image` exclusively; alt text is `series display name + label`.
- [x] Adding a new series key to `product-images.json` makes it appear with no code change — confirmed by inspection: `imagesForSeries` does a plain object lookup with no allowlist.
- [x] `cd frontend && npm run build` and `npm run lint` clean for touched files.
- [x] Responsive on mobile + desktop — mobile ordering fixed (photo before text via CSS grid `order`); manually verified by developer on a real device/viewport.

**(Optional) landing product-category band:** not touched — `frontend/app/(public)/_components/ProductCategories.tsx` already renders a representative photo per category (`/industrial-card.png` etc.) from a prior, unrelated feature; nothing in this ticket's manifest applies there, so no change was needed.

## Deviations / decisions

- The gallery lives inside the existing sticky sidebar (`<aside>`) rather than a full-width hero above the two-column grid, to avoid restructuring the detail page's layout. To satisfy "photo shows first on mobile," the sidebar and main content columns were given `order-1`/`order-2` (mobile) and `lg:order-2`/`lg:order-1` (desktop) instead of moving the gallery into its own DOM position — a smaller diff than extracting it.
- The listing card's alt text needs the primary image's `label`, but the manifest's `primary` field is just a URL string (not an object). `ProductSeriesCard` resolves the label by finding the `images[]` entry whose `src` matches `primary`.

## Open questions / follow-ups

- 17 of 36 series still have no photos — pending client re-send per `docs/gaurav-missing-photos-request.md`; no code change will be needed when the manifest grows.
- No automated test coverage was added (none exists for this app yet, per project convention — verification here was manual/build+lint).
