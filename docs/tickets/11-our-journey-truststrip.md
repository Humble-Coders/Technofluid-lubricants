---
name: Feature / Task ticket
about: A unit of work for a developer (built with Claude Code)
title: "[PUB4] Our Journey / Our Story section + TrustStrip industries reword"
labels: ["public-site"]
assignees: []
---

## 📖 Story / Why

The client (Gaurav) sent Technofluid's real **company history** ("Our Journey" — five decades, three generations, 1971 → today). It's already structured into content; this ticket **renders it as an "Our Story / Our Journey" section** so the About page stops being a placeholder and the brand has a credible heritage story (the thing our landing's trust strip only hints at).

Bundled with it: a **small TrustStrip fix** — per Gaurav's brand directives, the landing's trust strip must **not display the "28" industries count** (it currently does).

## 🧭 Context

- **Content is ready — no data work needed.** `frontend/content/company.json` now has a **`journey`** object:
  ```json
  "journey": {
    "heading": "Our Journey",
    "intro": "…one-paragraph lead…",
    "milestones": [
      { "year": "1971", "title": "The beginning", "text": "…" },
      { "year": "2001", "title": "The second generation", "text": "…" },
      { "year": "2005", "title": "The TECHNOFLUID brand", "text": "…" },
      { "year": "Today", "title": "A new chapter", "text": "…" }
    ],
    "closing": "…one-paragraph close…"
  }
  ```
- **The About page is currently a stub** — `frontend/app/(public)/about/page.tsx` renders the shared `ComingSoon` component. This ticket makes it a real page.
- **TrustStrip** lives at `frontend/app/(public)/_components/TrustStrip.tsx`. Its 4th stat currently shows `value = "28"` (from `INDUSTRIES_COUNT`) with label "Types of Industries We Serve". Gaurav's directive: **refer to "Types of Industries we serve", NOT "28 Industries served"** — so the numeral must go.
- Stack: Next.js 16 App Router, Tailwind v4, `motion` for animation (already used in TrustStrip). Follow `frontend/AGENTS.md` — content stays in the data file; read `company.json.journey`, don't hardcode the copy.
- **Price-free / read-only public site** rules unchanged.

## 🔑 Access & prerequisites
- [ ] Everything's in the repo: `frontend/content/company.json` (`journey`). No secrets, no server access.

## ✅ Scope / What to build

- [ ] **`Journey` type** in `frontend/types/content.ts` (`{ heading, intro, milestones: {year,title,text}[], closing }`) and read it off `CompanyContent`.
- [ ] **An "Our Journey" section component** that renders: `heading`, `intro`, the `milestones` as a **vertical/horizontal timeline** (year + title + text per step), and the `closing` paragraph. Design/layout is yours — a clean timeline that fits the existing site (reuse the brand tokens + `motion` reveal pattern already in the codebase). Data-driven — iterate over `milestones`, don't hardcode the four entries.
- [ ] **Make `/about` a real page:** replace the `ComingSoon` stub in `about/page.tsx` with a page that leads with the company **`about`** paragraph and includes the **Our Journey** section (+ optionally `whyChooseUs` / `ourCommitment`, your call). No more "coming soon" on `/about`.
- [ ] **(Optional, if it fits)** a condensed teaser of the journey on the landing page (e.g. above/below the trust strip). Skip if it bloats the landing.
- [ ] **TrustStrip reword:** the industries stat must **not show the "28" numeral**. Reword so it conveys "Types of Industries we serve" **without a count** — your treatment (e.g. drop that tile to a 3-stat strip, or use a non-numeric value). Do **not** surface the industry count anywhere on the strip.

## 🎯 Acceptance Criteria

- [ ] `/about` renders real content (no `ComingSoon`), leading with the About copy and showing the **Our Journey** timeline (1971 → 2001 → 2005 → Today) sourced from `company.json.journey` — confirmed the four milestone strings are read from the JSON, not hardcoded.
- [ ] Editing a milestone's `text` in `company.json` changes the rendered page **with no code change** (data-driven).
- [ ] The landing **TrustStrip no longer displays "28"** (or any industries count); the industries idea reads as "Types of Industries we serve" without a number.
- [ ] Responsive on mobile + desktop; matches the existing visual language (brand colours, motion reveals).
- [ ] `cd frontend && npm run build` and `npm run lint` clean for touched files.

## 🚫 Out of scope
- The **contact form** (separate ticket).
- Any pricing / product / Firestore / pack-size logic.
- Sourcing more brand assets (leadership photos etc.) — text-only journey is fine.
- Reworking the other trust-strip stats (Since 1971 / certification / product series) — only the industries count changes.

## 🔗 Dependencies
- `frontend/content/company.json` `journey` section — **in the repo, ready.**

## 📚 References
- `frontend/content/company.json` → `journey` (the content to render) and `about` / `whyChooseUs` / `ourCommitment`.
- `frontend/app/(public)/_components/TrustStrip.tsx` (the `INDUSTRIES_COUNT` stat to reword).
- `frontend/app/(public)/about/page.tsx` (the `ComingSoon` stub to replace).
- `frontend/types/content.ts` (add the `Journey` type).
- `frontend/AGENTS.md` (content-in-data, component conventions).

## 🤖 Kickoff prompt (paste into Claude Code)
```
/start-ticket 20
```
