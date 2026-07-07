---
name: Feature / Task ticket
about: A unit of work for a developer (built with Claude Code)
title: "[PUB2] Public product catalog — browser, product detail, industry detail pages"
labels: ["public-site"]
assignees: []
---

## 📖 Story / Why

The public landing page (#9) ships with its product-category cards, "View all industries", and industry links all pointing at **`ComingSoon` stubs**. This ticket builds the pages behind those links — the actual **price-free product catalog** and the **per-industry pages** — so a visitor can browse what we make, see real pack sizes, and see which of our products suit their industry.

Three surfaces:
1. **`/products`** — browse our ~36 product **series** (rich cards), filterable by the 4 categories.
2. **`/products/[slug]`** — a product-series detail page: full description / benefits / applications / spec table, **plus the real pack sizes it's sold in** (fetched live). The 6 "aspirational" series show **"available on request"** (no packs).
3. **`/industries/[slug]`** — a per-industry page listing the lubricant types that industry needs, with the matched ones **linking to the real product series**.

The design is yours (consistent with the #9 landing page). This ticket fixes **what each page shows and exactly where each piece of data comes from.**

## 🧭 Context

**The core idea — "words are static files, pack sizes are live from Firestore, a crosswalk joins them."** Three data sources:

- **Rich product content (the words):** `docs/catalogue-2026.json` — 36 product **series**, each with `title`, `displayName`, `commercialName`, `productType`, `category` (one of `Industrial Oils` / `Automotive Lubricants` / `Greases` / `Specialty Oils`), `aspirational` (bool), `sections` (`description` / `benefits` / `applications` / `typicalUses` arrays), and `specTables`. **Copy into `frontend/content/catalogue.json`** and import statically (same pattern as #9's `company.json` / `industries.json`).
- **Live pack sizes (what we actually sell):** Firestore **`public_catalog`** — one doc per product **family**, doc id = `productKey`, fields `{ productKey, product, category, segment, packSizes: string[] }`. **Price-free by design and publicly readable** (`firestore.rules`: `public_catalog` `allow read: if true`) — read it with the client web SDK, **no auth required**.
- **The join (series → families → live pack sizes):** `docs/catalogue-master-crosswalk.json` — for each series, `masterFamilies[]` gives the family `product` names (and `status: mapped | available-on-request`, `aspirational`). **Copy into `frontend/content/catalogue-crosswalk.json`.** To get a series' real pack sizes:
  1. Take each `masterFamilies[].product` name for that series.
  2. `productKey = slugify(product)` — **reuse the existing `slugify` in `frontend/lib/services/productImport.ts`** (it's currently module-private at line 42 — **add `export` to it** and import it; do NOT copy/reimplement, so there stays one source of truth. `productKey` is deterministically the slug of the family name — this is how the importer creates the doc ids).
  3. Read `public_catalog/{productKey}` for each, and **union their `packSizes`**.
  An `aspirational` / `available-on-request` series has no families → skip the fetch, render "available on request".

**Slugs / routing (keep consistent with #9):** a series' route slug is `slug(series.title)` using the same rule already used to generate `seriesSlug` in `industries.json` (lowercase, non-alphanumeric → `-`, trim). This is the **same value** `industries.json` stores in each linked type's `seriesSlug`, so `/products/[slug]` and the industry-page links line up. Category filter slugs are `slug(category)` → `industrial-oils`, `automotive-lubricants`, `greases`, `specialty-oils` (matching the `?category=` hrefs the #9 landing page already emits).

**Architecture (STRICT — see `CLAUDE.md`):** pages/components never read Firestore directly. Add a **service** (`frontend/lib/services/publicCatalogService.ts`) that reads `public_catalog`, and a **hook** wrapping it; pages consume the hook. Static content (`catalogue.json`, crosswalk) can be imported directly since it's build-time content, not Firestore.

**Non-negotiables (same as #9):** **no prices, no tiers, no "dealer/distributor" wording** anywhere; **no auth**; **read-only** (no ordering/cart — that's the internal app). `public_catalog` carries no price data, so never derive or display one.

## 🔑 Access & prerequisites

- [ ] **#9 merged** (public shell, `frontend/content/`, `frontend/types/content.ts`, the `ComingSoon` stub this replaces). Already on `main`.
- [ ] Content files in repo: `docs/catalogue-2026.json`, `docs/catalogue-master-crosswalk.json` (copy into `frontend/content/`). `frontend/content/industries.json` already present from #9.
- [ ] `frontend/.env.local` pointing at `techno-fluid` so the client SDK can read `public_catalog` (public read; no login needed). To sanity-check data exists: the admin Import/Products page (#7) populates `public_catalog`.
- [ ] **Product imagery is optional/placeholder** — reuse the industry photos from #9 and any category art; per-series product shots can be `TODO(asset)`. Don't block on them.

## ✅ Scope / What to build

### A. Content wiring
- [ ] Copy `docs/catalogue-2026.json` → `frontend/content/catalogue.json`; `docs/catalogue-master-crosswalk.json` → `frontend/content/catalogue-crosswalk.json`.
- [ ] Add TS types to `frontend/types/content.ts` (or a sibling): `CatalogueSeries`, `SeriesSection`, `SpecTable`, `Crosswalk`/`CrosswalkSeries`.
- [ ] A small helper `frontend/lib/catalogue.ts`: `seriesSlug(series)`, `familiesForSeries(slug)`, and `productKeysForSeries(slug)` (using the existing `slugify`) so routing + the join live in one place.

### B. Data access (architecture layering)
- [ ] `frontend/lib/services/publicCatalogService.ts` — `getPublicCatalogByKeys(keys: string[])` / `getPublicCatalogDoc(key)` reading `public_catalog` via the client SDK (no auth).
- [ ] A hook (e.g. `useSeriesPackSizes(slug)`) wrapping the service: given a series slug, resolves its `productKey`s and returns the unioned `packSizes` (+ loading/empty states).

### C. `/products` listing — `frontend/app/(public)/products/page.tsx` (replaces the `ComingSoon` stub)
- [ ] Grid of all **36 series** as rich cards (name = `displayName`/`commercialName`, `productType`, category, short blurb from `sections.description[0]`), driven by `catalogue.json` (no Firestore needed for the list).
- [ ] **Category filter** honoring the `?category=<slug>` query param the landing page links to (Industrial oils / Automotive lubricants / Greases / Specialty oils), plus an "All" state. Cards link to `/products/[slug]`.
- [ ] Mark `aspirational` series with an "available on request" tag.

### D. `/products/[slug]` — product-series detail — `frontend/app/(public)/products/[slug]/page.tsx`
- [ ] Resolve the series from `catalogue.json` by `slug(title)`; 404 (themed) if unknown.
- [ ] Render the rich content: description, key benefits, applications, typical uses, and the spec table(s) from `specTables`.
- [ ] **Pack sizes:** via the hook (§B), show the real `packSizes` unioned across the series' families from `public_catalog`. If the series is `aspirational` (or resolves to no active family), render a clear **"Available on request"** block with an Enquire → `/contact` action instead of packs. **Never show a price.**
- [ ] Back-link to `/products` (and ideally category).

### E. `/industries/[slug]` — industry detail — `frontend/app/(public)/industries/[slug]/page.tsx`
- [ ] Resolve the industry from `industries.json` by `slug`; 404 if unknown.
- [ ] List the industry's lubricant `types[]`. For each type with a `series`/`seriesSlug`, **link to `/products/[seriesSlug]`**; types without a link render as plain text (they're "available on request" categories we don't stock as a named series).
- [ ] Make the #9 `/industries` index cards link into these detail pages (they may already point at `/industries/[slug]`).

### F. Cleanup
- [ ] Remove the `/products` `ComingSoon` stub usage now that the real page exists (leave `/about` on `ComingSoon`; the contact form is a separate ticket).

## 🎯 Acceptance Criteria

- [ ] `/products` (logged out) shows **36 series cards**; visiting `/products?category=greases` (and the other three slugs the landing page links to) filters to that category; each card opens `/products/[slug]`.
- [ ] A **mapped** series detail page (e.g. Industrial Gear Oils) shows its rich content **and real pack sizes** that match `public_catalog` for that series' families (spot-check one family's `packSizes` in Firestore). **No price appears.**
- [ ] An **aspirational** series (e.g. Hydraulic Oil HVI, Roll Perfect, Girth Gear Grease — the 6 flagged `aspirational`) shows **"Available on request"** with an Enquire link and **no pack sizes / no price**.
- [ ] `/industries/<any-of-28>` renders that industry's lubricant types; **linked types navigate to the matching `/products/[seriesSlug]`**; the `/industries` index links into these pages.
- [ ] Firestore access goes through `publicCatalogService.ts` + a hook (grep: pages/components don't call `getDoc`/`getDocs` on `public_catalog` directly); the page reads with **no auth** (works in incognito).
- [ ] **No prices, tiers, or dealer/distributor wording** anywhere on these pages (grep clean across `app/(public)` + `content`).
- [ ] Unknown `/products/[slug]` or `/industries/[slug]` → themed 404, not a crash.
- [ ] `cd frontend && npm run build` and `npm run lint` clean for touched files.

## 🚫 Out of scope

- **Contact form backend** (spam-safe Cloud Function) — separate ticket; `/contact` stays the #9 CTA/`ContactCta` for now, Enquire links point at it.
- **Deploy to Firebase Hosting** — separate ticket.
- **Any pricing, ordering, cart, or auth** on the public surface — that's the internal app.
- **`/about`** content — stays on `ComingSoon`.
- Editing the catalogue/crosswalk **data** (it's produced upstream; this ticket only consumes it). The 6 crosswalk `needsConfirmation` naming calls are a content decision, not a blocker here.

## 🔗 Dependencies

- **#9** (public shell + content wiring) — merged.
- Content files `docs/catalogue-2026.json`, `docs/catalogue-master-crosswalk.json` — **ready, in repo** (from PR #10).
- `public_catalog` populated in `techno-fluid` (via the #7 admin import) — needed to see real pack sizes; the page must degrade gracefully (show "available on request" / empty) if a family's doc is missing.

## 📚 References

- **`docs/catalogue-2026.json`** — 36 rich series (the words + spec tables).
- **`docs/catalogue-master-crosswalk.json`** — series → families (`masterFamilies[].product`, `status`, `aspirational`); the join source. `summary`: 31 mapped, 5 available-on-request, 6 need naming confirmation.
- **`firebase/functions/src/products/buildPublicCatalogDoc.ts`** — the exact `public_catalog` doc shape (`productKey`, `product`, `category`, `segment`, `packSizes[]`).
- **`frontend/lib/services/productImport.ts`** — the `slugify` to `export` and reuse for `productKey` (currently module-private, line 42).
- `frontend/content/industries.json` (from #9) — industry `types[]` with `series`/`seriesSlug` links.
- `CLAUDE.md` (price-free / read-only public site; UI→hook→service→Firestore layering); `frontend/AGENTS.md`.

## 🤖 Kickoff prompt (paste into Claude Code)
```
/start-ticket 12
```
