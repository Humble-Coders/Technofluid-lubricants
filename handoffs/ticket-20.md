# Ticket: #20 — [PUB4] Our Journey / Our Story section + TrustStrip industries reword

## Summary

Replaced the `/about` page's `ComingSoon` stub with a real page built from `company.json`: a header (brand line + `about` copy), a new data-driven "Our Journey" timeline (`OurJourney.tsx`) rendering the four milestones from `company.json.journey`, and the existing `WhyChooseUs` component. Added a condensed "Our Journey" teaser (`JourneyTeaser.tsx`) to the landing page, placed after `WhoWeAre`, with a year/title timeline (vertical + connecting line on mobile, horizontal from `sm:` up) and a CTA to `/about`. Removed the "28" industries-count numeral from both `TrustStrip.tsx` (landing page) and `Hero.tsx` (which had its own separate copy of the same stat) per Gaurav's brand directive — TrustStrip is now a 3-stat strip, Hero's mini stat strip is now 2 tiles. Also dropped the decorative index numbers ("01"–"04") from the `WhyChooseUs` cards.

## Files changed

**Types**
- `frontend/types/content.ts` — added `Journey` / `JourneyMilestone` interfaces, wired `journey: Journey` into `CompanyContent`.

**About page**
- `frontend/app/(public)/about/page.tsx` — replaced `ComingSoon` with a real page: hero header (brand line + `COMPANY.about`) → `OurJourney` → `WhyChooseUs`.
- `frontend/app/(public)/about/_components/OurJourney.tsx` *(new)* — data-driven zigzag timeline component; iterates `company.json.journey.milestones`, renders `heading`/`intro`/`closing`, brand-color accents, `motion` reveal animations matching the existing site pattern.

**Landing page**
- `frontend/app/(public)/page.tsx` — added `JourneyTeaser` section after `WhoWeAre`.
- `frontend/app/(public)/_components/JourneyTeaser.tsx` *(new)* — condensed year/title timeline teaser + "Read Our Story" CTA linking to `/about`; vertical layout with connecting line on mobile, horizontal 4-column layout from `sm:` up.

**TrustStrip / Hero reword (no industries count)**
- `frontend/app/(public)/_components/TrustStrip.tsx` — removed the `INDUSTRIES_COUNT` stat and its `industries.json` import; grid changed from 4-stat (`lg:grid-cols-4`) to 3-stat (`sm:grid-cols-3`).
- `frontend/app/(public)/_components/Hero.tsx` — removed the same industries-count tile from Hero's separate mini stat strip (not named in the ticket, but it duplicated the same numeral); grid changed from 3 tiles to 2 (`Since 1971` / `ISO 9001`).

**Cosmetic**
- `frontend/app/(public)/_components/WhyChooseUs.tsx` — removed the large background index numbers ("01"–"04") from each strength card.

## How to test

1. `cd frontend && npm install` (if not already) `&& npm run build && npm run lint` — both should be clean for the files above (repo-wide lint has pre-existing, unrelated errors in `lib/useSalespersonDistributors.ts`, `lib/useSalespersonOrders.ts`, `lib/useVisits.ts` — not touched by this branch).
2. `npm run dev`, visit `/about`:
   - Confirm it renders real content (no "coming soon" text).
   - Confirm the "Our Journey" timeline shows all four milestones: 1971 "The beginning" → 2001 "The second generation" → 2005 "The TECHNOFLUID brand" → "Today" "A new chapter".
   - Resize to mobile width and confirm the timeline still reads cleanly (single column, marker + text).
3. Edit any milestone's `text` in `frontend/content/company.json` under `journey.milestones` and reload `/about` — confirm the change appears with no code change.
4. Visit `/` (landing page):
   - Confirm the Hero's stat strip (top-left) no longer shows "28" / "Types of Industry" — only "Since 1971" and "ISO 9001" tiles remain.
   - Scroll past "Who We Are" and confirm the "Our Journey" teaser appears with a "Read Our Story" button linking to `/about`.
   - Scroll to the (white) trust strip lower down and confirm it shows 3 stats (Since 1971 / Certified Quality / Product Series) with no industries count anywhere.
   - Resize to mobile and confirm the journey teaser shows a vertical connecting line between milestones, in order.

## Acceptance criteria

| Criterion | Status |
|---|---|
| `/about` renders real content (no `ComingSoon`), leading with About copy and showing the Our Journey timeline (1971 → 2001 → 2005 → Today) sourced from `company.json.journey` | ✅ Met |
| Editing a milestone's `text` in `company.json` changes the rendered page with no code change | ✅ Met — `OurJourney.tsx` maps over `JOURNEY.milestones`, no hardcoded milestone strings |
| The landing TrustStrip no longer displays "28" (or any industries count); reads as "Types of Industries we serve" without a number | ✅ Met (via removal) — the industries tile was dropped entirely rather than reworded to a non-numeric value; ticket explicitly allowed this option |
| Responsive on mobile + desktop; matches the existing visual language (brand colours, motion reveals) | ✅ Met — reuses `BRAND` tokens and the site's `motion` `whileInView` reveal pattern throughout |
| `npm run build` and `npm run lint` clean for touched files | ✅ Met |

## Deviations / decisions

- **TrustStrip treatment:** ticket offered two options — "drop that tile to a 3-stat strip, or use a non-numeric value." Went with dropping the tile (3-stat strip) rather than a non-numeric replacement, per direction during the ticket walkthrough.
- **Hero.tsx also fixed (not named in the ticket):** the ticket only named `TrustStrip.tsx`, but `Hero.tsx` had an independent copy of the same "28 industries" stat in its own mini trust strip. Removed it too for consistency with Gaurav's directive, since leaving it would have contradicted the same brand rule elsewhere on the same page.
- **Landing teaser included:** the ticket marked this optional ("skip if it bloats the landing"). Built a condensed version (year + title only, no milestone body text) and placed it after `WhoWeAre`, ahead of the product/industry sections, so the heritage story leads before diving into catalog content.
- **WhyChooseUs numbers removed:** not in the ticket scope, done at explicit request during the session — dropped the decorative "01"–"04" background numerals from the strength cards (affects both `/` and `/about`, since `WhyChooseUs` is shared).

## Open questions / follow-ups

- None outstanding from the ticket. No visual QA was done in an actual browser at real device widths beyond dev-server HTML/DOM checks and build output — worth a quick manual pass on a phone/tablet before merging if that hasn't happened yet.
