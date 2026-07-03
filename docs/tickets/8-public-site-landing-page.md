---
name: Feature / Task ticket
about: A unit of work for a developer (built with Claude Code)
title: "[PUB1] Public marketing site — landing page + site shell"
labels: ["public-site"]
assignees: []
---

## 📖 Story / Why

We're launching Technofluid's **public marketing website** — the first outward-facing, no-login surface (everything built so far is the internal ordering app behind auth). This ticket builds the **landing page** and the **shared public shell** (header + footer) it lives in.

The client (Gaurav) pointed at **https://india.gulfoilltd.com/** as the *structure* he likes — a polished, multi-band manufacturer homepage. We are **not** copying Gulf's content: they're a global consumer brand with motorsport, celebrity, investor and news content we don't have. Instead we keep Gulf's **section rhythm** and fill it with **our real, already-prepared content** — company copy, four product categories, and (our strongest differentiator) the **28 industries we serve**, each eventually linking to real products.

**Design is yours.** This ticket defines *which sections exist, in what order, and exactly what content/data each one shows.* Layout, colour, typography, spacing, imagery treatment — your call, guided by the Gulf reference. Every section's text/data is provided as structured JSON so **nothing is hardcoded or invented** — you wire the data, you style the page.

## 🧭 Context

- **This is a brand-new PUBLIC area — no authentication.** It must render fully for logged-out visitors. Do **not** put it behind the `(dashboard)` role guards or the `(auth)` flow. Recommended: a new `frontend/app/(public)/` route group with its own `layout.tsx` (public header + footer, no auth check). The marketing home becomes the **site root `/`**.
- **Replace the existing placeholder.** `frontend/app/page.tsx` today is a stale placeholder that imports `frontend/app/products.json` and shows **invented stats** ("500+ Active Distributors", "50+ SKUs", "15+ Years Operating") and made-up feature copy. **Delete/replace it and do not carry any of those fake numbers or copy forward** — we now have real figures and real copy (below). The old `frontend/app/products.json` is garbled and superseded by `docs/industries-2026.json`; don't read from it.
- **Content is READY as data files** (in `docs/`, produced in prior content-prep steps). Copy the finalized files into the frontend and import them (static import at build time — the landing needs **no Firestore reads**):
  - `docs/company-copy.json` → `frontend/content/company.json`
  - `docs/industries-2026.json` → `frontend/content/industries.json`
  - Add matching TS types in `frontend/types/content.ts`.
- **Stack:** Next.js 16 (App Router, React 19), Tailwind v4. Follow `frontend/AGENTS.md` (content/business data lives in data files, not baked into components; presentational components under `components/`).
- **NON-NEGOTIABLE rules for the public site:**
  - **Price-free.** No prices, no price tiers, no "dealer/distributor" wording anywhere public. (The public site never touches pricing data.)
  - **Read-only, no auth, no writes.**
  - Content strings come from `company.json` / `industries.json`, **not** typed into JSX.

## 🔑 Access & prerequisites

- [ ] Content files already in repo: `docs/company-copy.json`, `docs/industries-2026.json` (copy into `frontend/content/`). No secrets, no server access needed for this ticket.
- [ ] **Client assets — may be pending; do NOT block on them.** Use clearly-marked, easily-swappable placeholders (a `frontend/content/assets.ts` map or obvious `TODO(asset)` constants) so the client/you can drop finals in later:
  - Logo (header + footer)
  - Brand colour palette (you choose sensible defaults until brand colours arrive)
  - Hero image + 4 product-category images + industry thumbnails (placeholders OK)
  - Contact details: address, phone, email (placeholder until client provides)

## ✅ Scope / What to build

### A. Public shell — `frontend/app/(public)/layout.tsx`
- [ ] **Header (sticky):** logo + primary nav → `Products` · `Industries` · `About` · `Contact`, plus an **Enquire** call-to-action. (Trim of Gulf's nav — no Investors/Careers/Motorsports.)
- [ ] **Footer:** short company blurb + tagline; link columns for **Product categories** (the 4 below) and **Industries** (a few + "view all"); **contact** block; trust line "A brand of Lube Chem. Industries · JAS-ANZ ISO 9001:2015 · Since 1971". *(No investor/cookie/ODR links — those are Gulf-specific.)*
- [ ] Nav/footer links may point at routes not built yet (`/products`, `/industries/[slug]`, `/contact`) — wire the correct hrefs; those pages arrive in later tickets. `/industries` (index) and `/about`/`/contact` anchors on the landing **are** in scope (below).

### B. Landing page — `frontend/app/(public)/page.tsx` (site root `/`)
Build these bands **in this order**. Data field paths reference `company.json` unless noted.

1. [ ] **Hero** — brand name; tagline **`tagline`** ("Decimating friction since 1971"); a small trust line from **`certification`** ("JAS-ANZ ISO 9001:2015"); two CTAs: **Explore products** → `/products`, **Enquire** → `/contact`. *(Needs hero image — placeholder.)*
2. [ ] **Who we are** — render **`about`** (the full paragraph); surface **`parentCompany`** and **`since`**.
3. [ ] **Product categories** — a 4-card grid, linking into the product browser (built later):
   - Industrial oils → `/products?category=industrial-oils`
   - Automotive lubricants → `/products?category=automotive-lubricants`
   - Greases → `/products?category=greases`
   - Specialty oils → `/products?category=specialty-oils`
   *(These are the four real catalogue categories. Category images = placeholder.)*
4. [ ] **Industries we serve** — the differentiator. Show a **curated preview of ~8 industries** as cards (read from `industries.json` → `industries[]`, use `name` + `slug`), each linking to `/industries/[slug]` (detail page = later ticket). Include a **"View all industries" → `/industries`**. *(Curated-8-preview is the recommended default; if you prefer showing all 28 inline that's acceptable — but keep the landing scannable.)*
5. [ ] **Why choose us** — heading from **`whyChooseUs.intro`**; render the four **`whyChooseUs.points[]`** as feature items; closing line **`whyChooseUs.closing`**.
6. [ ] **Trust strip + commitment** — a compact stat/trust band with **real** figures: `Since 1971` · `ISO 9001:2015` · `36 product series` · `28 industries`; render **`ourCommitment`** as the accompanying line. *(These counts are fixed facts — hardcoding the numbers `36`/`28` is fine, or derive from the JSON lengths.)*
7. [ ] **Contact / enquiry CTA** — a closing band inviting enquiries → links to `/contact`. *(The contact **form** itself is a separate ticket; here it's just the CTA band + contact details block.)*

### C. Industries index — `frontend/app/(public)/industries/page.tsx`
- [ ] Grid of **all 28 industries** from `industries.json` (`name` + `slug`), each card linking to `/industries/[slug]` (detail = later ticket; link can 404/"coming soon" until then). This is what the landing's "View all" points to.

### D. Content wiring
- [ ] `frontend/content/company.json`, `frontend/content/industries.json` (copied from `docs/`), imported via typed helpers; `frontend/types/content.ts` with interfaces for both shapes.

## 🎯 Acceptance Criteria

- [ ] Visiting **`/` while logged out** renders the full landing page (no redirect to login, no auth gate).
- [ ] All copy — tagline, about, why-choose-us points, commitment, certification — is read from `company.json`; **grep shows those strings are not hardcoded in JSX**.
- [ ] Landing shows, in order: hero → who-we-are → 4 product categories → industries preview → why choose us → trust strip → contact CTA. Header + footer present on all public pages.
- [ ] **No prices, price tiers, or "dealer/distributor" wording appear anywhere** on any public page.
- [ ] The **tagline "Decimating friction since 1971"** appears (hero and/or footer).
- [ ] Product-category cards link to the four `/products?category=…` slugs above; **"View all industries"** goes to `/industries`, which lists **all 28** industries from the data file.
- [ ] **No invented stats** — the old "500+ distributors / 50+ SKUs / 15+ years" placeholder content is gone; figures shown are the real ones (1971, ISO 9001:2015, 36 series, 28 industries).
- [ ] Client assets (logo, hero/category imagery, contact details) are **placeholders in one obvious, swappable place** — not scattered magic strings.
- [ ] Responsive (mobile → desktop). `cd frontend && npm run build` and `npm run lint` are clean for touched files.

## 🚫 Out of scope

- **Product browser + product detail pages** (`/products`, reading the price-free `public_catalog`; pack sizes; "available on request" for the 6 aspirational products) — **next ticket**. Category links here just need correct hrefs.
- **Industry detail pages** (`/industries/[slug]` showing recommended lubricant types + linked catalogue series from `industries.json`) — **next ticket**.
- **Contact form backend** (spam-safe Cloud Function) — separate ticket. This ticket is the CTA band + static contact details only.
- **Deploy to Firebase Hosting** — separate ticket.
- **"Become a distributor" CTA** — deferred by decision; do not add it.
- Any **auth, role, or Firestore rules** changes; any pricing on the public surface.

## 🔗 Dependencies

- Content files (`docs/company-copy.json`, `docs/industries-2026.json`) — **ready, in repo.**
- Client assets (logo, palette, imagery, contact details) — **pending but non-blocking** via placeholders.
- Later tickets consume the routes stubbed here (`/products`, `/industries/[slug]`, `/contact`).

## 📚 References

- **Structure reference (do not copy content):** https://india.gulfoilltd.com/ — keep the multi-band rhythm; replace their consumer/motorsport/investor bands with our About / Product-categories / Industries / Why-choose-us / Trust bands.
- **Content data:** `docs/company-copy.json` (brand line, tagline, certification, about, whyChooseUs{intro,points[],closing}, ourCommitment, since, parentCompany); `docs/industries-2026.json` (28 `industries[]` with `name`/`slug`/`types[]`, plus `automotiveOils`, plus `summary`).
- **For later tickets (context only):** `docs/catalogue-2026.json` (36 rich product series), `docs/catalogue-master-crosswalk.json` (series↔SKU + the 6 aspirational "available on request" items).
- `frontend/AGENTS.md` (content-in-data rule, component conventions); `CLAUDE.md` (price-free / read-only public site, currency rules).

## 🤖 Kickoff prompt (paste into Claude Code)
```
/start-ticket 9
```
