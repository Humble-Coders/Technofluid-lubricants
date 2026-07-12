---
name: Feature / Task ticket
about: A unit of work for a developer (built with Claude Code)
title: "[PUB3] Product photos on catalogue pages (detail, cards, hero)"
labels: ["public-site"]
assignees: []
---

## 📖 Story / Why

The public product pages (`/products`, `/products/[slug]`) currently render **no product photos** — detail pages show text + spec tables only, and listing cards have no imagery. The client (Gaurav) has now supplied **real product packshots**, which have been sorted and mapped to our catalogue series. This ticket wires those photos onto the catalogue pages so the site looks like a real product site.

**Coverage is partial and that's expected:** photos exist for **19 of 36 series** today; the remaining ones are being re-collected from the client and will drop into the same manifest later. So the wiring **must degrade gracefully** — a series with no photo keeps its current text-only look, never a broken image.

## 🧭 Context

- **Assets are already in the repo:**
  - Images: `frontend/public/product-photos/<seriesSlug>/*.jpg` (41 images across 19 series). Served at `/product-photos/<seriesSlug>/<name>.jpg`. (Folder is `product-photos`, deliberately **not** `products`, to avoid colliding with the `/products` route.)
  - Manifest: **`frontend/content/product-images.json`**, keyed by **the same series slug the detail pages already use** (`slugify(series.title)` via `seriesSlug()` in `frontend/lib/catalogue.ts`). Shape:
    ```json
    {
      "<seriesSlug>": {
        "primary": "/product-photos/<seriesSlug>/<name>.jpg",
        "images": [
          { "src": "/product-photos/…jpg", "label": "HYDRAULIC OIL HLP AW 68", "packSize": "5 L", "container": "bottle" }
        ]
      }
    }
    ```
- **Lookup is trivial:** on a product page you already have the series slug — read `productImages[slug]` from the manifest. If the key is absent → that series has no photos yet → render the existing no-image layout.
- Stack: Next.js 16 App Router, Tailwind v4. Use **`next/image`** for optimization (these are ~100–150 KB JPGs). Follow `frontend/AGENTS.md`. Content stays in the data file — don't hardcode image paths in components.
- **Price-free / read-only public site** rules still apply (no change here — images carry no pricing).

## 🔑 Access & prerequisites
- [ ] Everything needed is in the repo: `frontend/content/product-images.json` + `frontend/public/product-photos/**`. No secrets, no server access.

## ✅ Scope / What to build

- [ ] **Typed accessor + type.** Add a `ProductImages` type in `frontend/types/content.ts` and a small helper (e.g. `imagesForSeries(slug)` in `frontend/lib/catalogue.ts`) that returns `{ primary, images } | null` from the manifest.
- [ ] **Product detail page (`/products/[slug]`):** render the series' **primary photo** prominently (hero/lead image), with the remaining `images` as a **thumbnail row / simple gallery** (click a thumb → swaps the main image; keep it lightweight, no heavy carousel lib). Caption each with its `label`/`packSize` if present. If `imagesForSeries(slug)` is null → keep the current text-only layout unchanged.
- [ ] **Products listing + category cards (`/products`):** use each series' `primary` image as the card image. Series without a photo → current placeholder/text card (graceful).
- [ ] **`next/image`** everywhere for these, with appropriate `sizes`, `width`/`height` (or `fill` + aspect box), and `alt` = series display name + label.
- [ ] **(Optional, if quick)** landing product-category band: use a representative photo per category as the card background/thumbnail. Skip if it complicates the existing design.
- [ ] Graceful, consistent empty state for the 17 uncovered series (no layout shift, no broken `<img>`).

## 🎯 Acceptance Criteria

- [ ] A covered series (e.g. `/products/hydraulic-oil-technofluid-hydraulic-oil-hlp`) shows its **primary photo** + thumbnails; clicking a thumbnail swaps the main image.
- [ ] An **uncovered** series (e.g. any grease, or `…technofluid-transformer-oil`) renders with **no broken images** and no layout gap — same as today.
- [ ] `/products` listing cards show the primary photo for covered series and degrade cleanly for the rest.
- [ ] All images go through `next/image` with meaningful `alt` text; no raw `<img>` for these.
- [ ] Adding a new series key to `product-images.json` (or a new file under `product-photos/…`) makes it appear **with no code change** (data-driven).
- [ ] `cd frontend && npm run build` and `npm run lint` clean for touched files. Responsive on mobile + desktop.

## 🚫 Out of scope
- **Sourcing the 17 missing series' photos** — pending re-send from the client (`docs/gaurav-missing-photos-request.md`); they'll be added to the same manifest later.
- Datasheet **download** links, and any change to spec tables / descriptions (already live).
- Pricing, auth, Firestore, or the pack-size logic (unchanged).
- Image cropping/retouching — use the packshots as-is (already clean white-bg).

## 🔗 Dependencies
- `frontend/content/product-images.json` + `frontend/public/product-photos/**` — **in the repo, ready.**
- Later: manifest grows when the client re-sends the missing photos (no code change needed).

## 📚 References
- `frontend/content/product-images.json` (the manifest to render).
- `frontend/lib/catalogue.ts` (`seriesSlug()` — the slug keying the manifest; add `imagesForSeries` here).
- `docs/product-images-map.json` (full image→product provenance) and `docs/gaurav-missing-photos-request.md` (what's still missing).
- `frontend/AGENTS.md` (content-in-data, component conventions).

## 🤖 Kickoff prompt (paste into Claude Code)
```
/start-ticket 16
```
