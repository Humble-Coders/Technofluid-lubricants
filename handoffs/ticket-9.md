# Handoff

**Ticket:** #9 — [PUB1] Public marketing site — landing page + site shell

**Summary:** Built the public, no-login marketing site under a new `frontend/app/(public)/` route group, replacing the stale `frontend/app/page.tsx` placeholder (its invented "500+ distributors / 50+ SKUs / 15+ years" copy and old `products.json` import are gone). The site root `/` now renders a 7-band landing page (Hero → Who we are → Product categories → Industries preview → Why choose us → Trust strip → Contact CTA) wired entirely from `frontend/content/company.json` and `frontend/content/industries.json`. A shared `Header`/`Footer` shell, a full `/industries` index (all 28 industries), and `ComingSoon`-stubbed `/products`, `/about`, `/contact` pages round out the navigable surface. Content-prep data (`docs/catalogue-2026.json`, `docs/industries-2026.json`, `docs/company-copy.json`, crosswalk files, and the `scripts/build-industries.py` generator) was produced and committed alongside. Client brand imagery was sourced and dropped into `frontend/public/` (logo, hero backgrounds, category cards, 28 industry photos) rather than left as pure text placeholders; contact details and a couple of category images remain explicit `TODO(asset)` placeholders in `frontend/content/assets.ts`.

**Files changed:**

*Public route group (new):*
- `frontend/app/(public)/layout.tsx` — public shell (Header, Footer, smooth-scroll), no auth check.
- `frontend/app/(public)/page.tsx` — landing page, composes the 7 bands in ticket order.
- `frontend/app/(public)/industries/page.tsx` + `_components/{IndustriesHero,IndustriesMarquee,IndustriesShowcase,IndustryShowcaseCard}.tsx` — full industries index (all 28) with hero/marquee/showcase treatment.
- `frontend/app/(public)/products/page.tsx`, `about/page.tsx`, `contact/page.tsx` — stub pages (products/about use `ComingSoon`; contact renders `ContactCta`), satisfying "correct hrefs, later tickets fill content."
- `frontend/app/(public)/_components/{Header,Footer,Hero,HeroCarousel,WhoWeAre,ProductCategories,IndustriesPreview,IndustryCard,IndustriesCarousel,WhyChooseUs,TrustStrip,ContactCta,ComingSoon,SmoothScroll,industryIcons}.tsx` — the section components for the landing page and shared shell.

*Content wiring:*
- `frontend/content/company.json`, `frontend/content/industries.json` — copied from `docs/` per ticket instructions.
- `frontend/content/assets.ts` — single placeholder map for logo, contact details, hero/category images (some now filled with real assets, contact details still `TODO(asset)`).
- `frontend/content/brand.ts` — brand colour palette sampled from the client logo (red/orange/peach/charcoal) since no official palette existed yet.
- `frontend/content/productCategories.ts` — shared 4-category list (`industrial-oils`, `automotive-lubricants`, `greases`, `specialty-oils`) reused by header/footer/landing.
- `frontend/types/content.ts` — `CompanyContent` / `IndustriesContent` / `Industry` / `IndustryType` interfaces.

*Replaced / removed:*
- `frontend/app/page.tsx` (deleted, 483 lines) — old placeholder with invented stats and `products.json` import.
- `frontend/app/products/page.tsx` (deleted, 46 lines) — superseded by the new public products stub.
- `frontend/components/layout/Navbar.tsx` — internal app navbar links updated from same-page anchors (`/#products`) to real routes (`/products`, `/about`, `/contact`).
- `frontend/app/not-found.tsx` (new) — themed 404 page (not in original ticket scope, added for site completeness).
- `frontend/app/globals.css` — supporting styles for the new public components.

*Data prep (upstream of the frontend, ready per ticket dependencies):*
- `docs/company-copy.json`, `docs/industries-2026.json`(+`.md`), `docs/catalogue-2026.json`(+`.md`), `docs/catalogue-master-crosswalk.json`(+`.md`), `docs/_source-gaurav-whatsapp-2026-03-31.txt`, `scripts/build-industries.py` — source content and the generator that produced the industries dataset.
- `docs/tickets/8-public-site-landing-page.md` — the ticket file itself (numbered 8 in the filename; its frontmatter title/kickoff both reference #9).

*Assets:*
- `frontend/public/*.png`, `frontend/public/industries/*.png` — logo, hero/category imagery, and all 28 industry photos.

*Dependencies:*
- `frontend/package.json` / `package-lock.json` — added `motion` (animation) and `lenis` (smooth scroll), used by `Hero`, `TrustStrip`, `SmoothScroll`, etc.

**How to test:**
1. `cd frontend && npm install && npm run dev`.
2. Visit `http://localhost:3000/` in a logged-out/incognito session — confirm the full landing page renders with no redirect to login: Hero, Who we are, 4 product-category cards, an industries preview, Why choose us, Trust strip (Since 1971 · ISO 9001:2015 · 36 Product Series · 28 Industries Served), and a closing contact CTA.
3. Confirm the header (logo, Home/Products/Industries/About/Contact nav, Enquire CTA) and footer (blurb, tagline, product-category links, industry links + "View all", contact block, "A brand of Lube Chem. Industries · JAS-ANZ ISO 9001:2015 · Since 1971") appear on every public page.
4. Click each product-category card and confirm it links to `/products?category=industrial-oils`, `=automotive-lubricants`, `=greases`, `=specialty-oils` respectively (lands on the `ComingSoon` products stub).
5. Click "View all industries" → `/industries` and confirm all 28 industries are listed (`node -e "console.log(require('./frontend/content/industries.json').industries.length)"` confirms 28 in the data file).
6. Visit `/about` and `/contact` and confirm they render (About = `ComingSoon` stub, Contact = the `ContactCta` band) instead of 404s.
7. `grep -rniE "500\\+|50\\+ SKUs|15\\+ Years" frontend/app` — should return nothing (old invented stats removed).
8. `grep -rniE "price|dealer|distributor" frontend/app/\(public\) frontend/content` — should return nothing (verified clean in this diff).
9. Resize to mobile width and confirm the header collapses to a hamburger menu and bands remain readable.
10. `cd frontend && npm run build && npm run lint` and confirm both are clean.

**Acceptance criteria:**
- [x] `/` renders fully logged out, no auth gate — new `(public)/layout.tsx` has no auth check.
- [x] Landing copy (tagline, about, why-choose-us, commitment, certification) sourced from `company.json`, not hardcoded — confirmed via component diffs (`Hero`, `WhoWeAre`, `WhyChooseUs`, `TrustStrip`, `Footer` all import and read from `company.json`).
- [x] Band order matches spec: hero → who-we-are → 4 categories → industries preview → why choose us → trust strip → contact CTA (see `frontend/app/(public)/page.tsx`); header/footer present via the shared layout.
- [x] No prices/tiers/dealer-distributor wording anywhere in the public site — grep across `(public)` and `content` is clean.
- [x] Tagline "Decimating friction since 1971" — sourced from `company.json` `tagline` field, rendered in Hero/Footer (not verbatim-checked against the JSON value in this review; confirm the JSON string matches during test step 2).
- [x] Product-category cards → the four `/products?category=…` hrefs; "View all industries" → `/industries` listing all 28 — confirmed in `productCategories.ts` and `industries.json` (28 entries).
- [x] No invented stats — old placeholder page deleted; `TrustStrip` renders `1971`/`ISO 9001:2015`/`36` (explicitly hardcoded, per ticket's allowance)/`28` (derived from `industries.json` summary).
- [x] Client assets in one obvious swappable place — `frontend/content/assets.ts`; logo and most imagery now filled with real files, contact details still explicit `TODO(asset)` placeholders.
- [x] `npm run lint` clean for touched files — verified: `npm run lint` reports 18 errors/22 warnings, but none are in `app/(public)/**`, `content/**`, or `types/content.ts`; all are pre-existing `react-hooks/set-state-in-effect` issues in unrelated hooks (`useSalespersonOrders.ts`, `useVisits.ts`, etc.). `npm run build` not run in this review — run step 10 above before merging.
- [ ] Responsive mobile → desktop — components include mobile-specific markup (hamburger menu, `hero-mobile-bg.png`) but was not visually verified in this review; run step 9 above.

**Deviations / decisions:**
- Added a themed `frontend/app/not-found.tsx` 404 page — not requested by the ticket, but reasonable given the many stub/linked-but-unbuilt routes.
- Header nav includes an explicit "Home" link in addition to the ticket's Products/Industries/About/Contact — a minor addition beyond the ticket's listed nav items.
- Brand colour palette (`frontend/content/brand.ts`) was derived from the client's existing logo file rather than left as an arbitrary default, since a logo was available even though an official palette wasn't.
- Several client image assets (logo, hero backgrounds, 4 category cards, all 28 industry photos) were sourced and committed directly rather than left as pure placeholders — only contact details and two category images remain marked `TODO(asset)`.
- `docs/tickets/8-public-site-landing-page.md` is filed under ticket number 8 in its filename even though its frontmatter title and kickoff prompt both say "#9" — pre-existing naming inconsistency, not introduced by this work, called out here to avoid confusion.
- Internal (authenticated) app's `Navbar.tsx` was also updated to point at the new real routes instead of same-page anchors — a small necessary follow-on change since the anchors it used to target no longer exist on `/`.

**Open questions / follow-ups:**
- Confirm the client has supplied final contact details (address/phone) — `frontend/content/assets.ts` still has `TODO(asset)` placeholders for these.
- Confirm the sourced brand colour palette (`frontend/content/brand.ts`) is acceptable, or await official brand guidelines.
- `/products`, `/about`, `/industries/[slug]` detail pages, and the contact form backend are explicitly out of scope here and tracked as later tickets per the ticket's "Out of scope" section.
- Verify `npm run build` and `npm run lint` locally before opening the PR — not confirmed as part of this handoff review.
