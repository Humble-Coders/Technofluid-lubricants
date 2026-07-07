# Handoff: Ticket #12 — [PUB2] Public product catalog (browser, product detail, industry detail)

**Ticket:** #12 — Public product catalog — browser, product detail, industry detail pages

## Summary

Builds the three real pages behind the #9 landing page's `ComingSoon` stubs: `/products` (a filterable grid of all 36 product series), `/products/[slug]` (a series detail page with full rich content plus live pack sizes pulled from Firestore's `public_catalog`), and `/industries/[slug]` (a per-industry page listing lubricant types, linking the mapped ones to their product series). The series → live pack-size join is implemented per the ticket's design: static `catalogue.json` (words) + static `catalogue-crosswalk.json` (the join) + a new `publicCatalogService.ts` + `useSeriesPackSizes` hook (the live Firestore read), keeping Firestore access out of components per `CLAUDE.md`'s layering rule. `slugify` was exported from `productImport.ts` and reused (not reimplemented) so route slugs and `productKey`s stay derived from one source of truth. No price, tier, or dealer/distributor wording appears anywhere on these pages.

## Files changed

**Content wiring**
- `frontend/content/catalogue.json` (new) — copied from `docs/catalogue-2026.json`; 36 series, 6 flagged `aspirational`.
- `frontend/content/catalogue-crosswalk.json` (new) — copied from `docs/catalogue-master-crosswalk.json`; the series → master-family join.
- `frontend/types/content.ts` (modified) — added `CatalogueSeries`, `SpecTable`, `CrosswalkSeries`, `PublicCatalogDoc`, `CrosswalkContent`, etc., typing both new JSON files and the Firestore doc shape.
- `frontend/lib/catalogue.ts` (new) — `seriesSlug`, `findSeriesBySlug`, `findCrosswalkBySlug`, `familiesForSeries`, `productKeysForSeries`, `categorySlug`, `categoryAccent`: the single place routing + the series/family/pack-size join live.

**Data access layer**
- `frontend/lib/services/publicCatalogService.ts` (new) — `getPublicCatalogDoc` / `getPublicCatalogByKeys`, reading the `public_catalog` collection via the client SDK (no auth), batching `documentId() in [...]` queries in chunks of 30.
- `frontend/lib/hooks/useSeriesPackSizes.ts` (new) — resolves a series slug to its `productKey`s, fetches and unions their `packSizes`, exposes `{ packSizes, isLoading, error }`.
- `frontend/lib/constants.ts` (modified) — added `COLLECTIONS.PUBLIC_CATALOG = "public_catalog"`.
- `frontend/lib/services/productImport.ts` (modified) — `slugify` changed from module-private to `export`ed, so `lib/catalogue.ts` reuses the exact importer logic instead of duplicating it.

**`/products` listing**
- `frontend/app/(public)/products/page.tsx` (modified — was the `ComingSoon` stub) — server component: filters `catalogue.products` by `?category=` slug, paginates (9/page), renders the grid + "no products" empty state.
- `frontend/app/(public)/products/_components/ProductsHero.tsx`, `CategoryFilterTabs.tsx`, `ProductSeriesCard.tsx`, `ProductsPagination.tsx` (new) — hero copy, the 4-category + "All" filter tabs, the rich series card (name/type/category/blurb + "available on request" tag), and pager controls.

**`/products/[slug]` detail**
- `frontend/app/(public)/products/[slug]/page.tsx` (new) — resolves series by slug (`notFound()` → themed global 404 if unknown), renders description/benefits/applications/typical-uses/spec-tables, and `<SeriesPackSizes>` for the live packs.
- `frontend/app/(public)/products/[slug]/_components/SeriesPackSizes.tsx` (new) — consumes `useSeriesPackSizes`; shows a loading skeleton, the unioned pack-size chips, or an "Available on request" + Enquire (`/contact`) card when `aspirational`, on error, or when no packs resolve.
- `frontend/app/(public)/products/[slug]/_components/SeriesSpecTable.tsx` (new) — renders one `specTables` entry as a table.

**`/industries/[slug]` detail**
- `frontend/app/(public)/industries/[slug]/page.tsx` (new) — resolves the industry from `industries.json` by slug (`notFound()` if unknown), splits `types[]` into "available now" (linked to `/products/[seriesSlug]`) vs. "available on request" (plain text), and lists related industries in the same sector.

## How to test

1. `cd frontend && npm install` (if not already) and confirm `.env.local` points at the `techno-fluid` Firebase project.
2. `npm run dev`, then in an **incognito window** (no auth):
   - Visit `/products` — expect 36 series cards. Click through `?category=industrial-oils`, `?category=automotive-lubricants`, `?category=greases`, `?category=specialty-oils` (the same slugs the #9 landing page links to) and confirm the grid filters accordingly.
   - Open a **mapped** series (e.g. an Industrial Gear Oils card) — confirm description/benefits/applications/spec table render, and the pack-size chips appear. Cross-check one shown pack size against the matching `public_catalog/{productKey}` doc in the Firestore console (admin Import/Products page, ticket #7, is what populates this collection).
   - Open an **aspirational** series (6 exist — e.g. search for one flagged `aspirational: true` in `frontend/content/catalogue.json`) — confirm "Available on request" + Enquire button, no packs, no price.
   - Visit `/industries/<any-slug-from-industries.json>` — confirm the industry's lubricant types render, linked types navigate to their `/products/[seriesSlug]`, and related-industries chips work.
   - Try an unknown `/products/does-not-exist` and `/industries/does-not-exist` — confirm the themed 404 (`frontend/app/not-found.tsx`), not a crash.
3. `grep -rniE "price|dealer|distributor" frontend/app/\(public\)/products frontend/app/\(public\)/industries` — expect no matches.
4. `grep -rn "getDoc\|getDocs" frontend/app/\(public\)` — expect no direct Firestore calls outside `lib/services/`.
5. `cd frontend && npm run lint && npm run build` — both clean for the files this ticket touches (pre-existing lint errors in unrelated files — `useSalespersonDistributors.ts`, `useSalespersonOrders.ts`, `useVisits.ts`, `useProducts.ts` — are outside this ticket's scope and were not introduced here).

## Acceptance criteria

- [x] `/products` shows 36 series cards; `?category=` filtering works for all 4 slugs; cards open `/products/[slug]`.
- [x] A mapped series detail page shows rich content **and** real pack sizes via `public_catalog`; no price appears.
- [x] An aspirational series shows "Available on request" + Enquire link, no packs, no price. (Verified: 6 series flagged `aspirational: true` in `catalogue.json`.)
- [x] `/industries/[slug]` renders lubricant types; linked types navigate to the matching `/products/[seriesSlug]`.
- [x] Firestore access goes through `publicCatalogService.ts` + `useSeriesPackSizes` — grep confirms no direct `getDoc`/`getDocs` on `public_catalog` in pages/components; reads work with no auth (client SDK, public rule).
- [x] No prices, tiers, or dealer/distributor wording anywhere on these pages — grep clean.
- [x] Unknown `/products/[slug]` or `/industries/[slug]` → themed 404 (`notFound()` renders the app-level `not-found.tsx`, not Next's default).
- [x] `npm run build` and `npm run lint` clean for touched files.

## Deviations / decisions

- None from the ticket's design — content wiring, service/hook layering, and slug reuse all followed the ticket's prescribed approach.
- The themed 404 criterion is satisfied by the **existing** app-level `frontend/app/not-found.tsx` (added in an earlier ticket) rather than a new per-route `not-found.tsx`; `notFound()` in both detail pages correctly falls through to it.

## Open questions / follow-ups

- Per-series product imagery is still placeholder/TODO — out of scope per the ticket, but worth a follow-up ticket once real shots exist.
- The 6 crosswalk entries flagged `needsConfirmation` are a content/naming decision upstream, not something this ticket resolves.
- Contact form backend (spam-safe Cloud Function) and Firebase Hosting deploy remain separate tickets, as scoped.
