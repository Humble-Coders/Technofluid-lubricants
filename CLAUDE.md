# Technofluid Lubricants Platform — CLAUDE.md

> Umbrella guide, read on every ticket. **Frontend coding specifics** live in `frontend/AGENTS.md` (auto-imported by `frontend/CLAUDE.md`) — follow both. **Product truth:** `docs/PRD.md`. **Ticket workflow:** `docs/PROCESS.md`.
>
> ⚠️ Some patterns currently in the codebase are **wrong and being fixed** — see [Known issues](#known-issues--must-fix-do-not-copy-these-patterns). Build against the rules below, not against what the existing code happens to do.

## What this is

An end-to-end web platform for Technofluid Lubricants' full order lifecycle: field-sales visits → distributor onboarding → order placement → manufacturing demand → inventory → dispatch → invoicing/accounting. It replaces a manual spreadsheet-and-phone process. Order *intake* (sales → distributor → order) largely exists; order *fulfillment* (manufacture → stock → dispatch → invoice) is greenfield. See PRD §1–§9 for scope and milestones.

## Repository layout

```
frontend/            Next.js app (App Router). All UI + client logic.
  app/               Routes (role-segregated — see Routing).
  components/        ui/ + layout/ (presentational, reusable).
  lib/services/      Firestore/Functions access layer (*Service.ts).
  lib/*.ts, lib/hooks/  React hooks (useX) wrapping services.
  lib/api/admin.ts   Typed callers for Cloud Functions.
  lib/validation/    zod schemas.
  types/             Shared TS types (order, distributor, user, product…).
  AGENTS.md          Frontend coding rules (READ).
firebase/
  firestore.rules    Security rules (the server-side backstop).
  functions/src/     Cloud Functions (TypeScript, v2 onCall, us-central1).
docs/                PRD.md, PROCESS.md, tickets/.
handoffs/            Ticket handoff reports.
scripts/, Product master resources/   Catalog seed + source data.
```

## Stack

Next.js 16 (App Router, React 19) · Firebase Auth + Firestore (web SDK v12) · Cloud Functions (TypeScript, **v2 `onCall`, region `us-central1`**) · Tailwind v4 · `react-hook-form` + `zod`. **Deploy target: Firebase Hosting** (frontend) + `firebase deploy` (rules + functions). This is a **modified Next.js environment** — verify Next features against `node_modules/next/dist/docs/` before using them (see AGENTS.md §1).

## Architecture & data flow (STRICT)

Layering — every feature flows through these, in order:

```
UI (components/pages)  →  hooks (lib/…useX)  →  services (lib/services/*Service.ts)  →  Firestore / Cloud Functions
```

- **Components/pages NEVER read or write Firestore directly.** All data access goes through `lib/services/*`. Hooks wrap services for React state; pages consume hooks.
- **Business logic never lives in UI components** (AGENTS.md §4). Keep it in services/functions.
- **Privileged mutations go through Cloud Functions** (callable via `lib/api/admin.ts`), not client writes — see Security model.
- **Validation:** zod schemas in `lib/validation` enforced client-side; **Firestore rules are the security backstop, not a convenience** — never trust the client.

## Roles & the two-axis model

Roles: **admin · salesperson · distributor · supervisor · manufacturing**. Manufacturing is a **separate login role** that sees only aggregated demand (never orders/customers). *(supervisor + manufacturing roles are not yet wired — adding them is pending work.)*

Distributors are classified on **two orthogonal axes — never conflate them** (PRD §3):
- **Segment (visibility)** = which products they see: `Automotive` | `Industrial` | `Combined` (Combined = Automotive ∪ Industrial, exactly).
- **Price tier** = which price they pay: `Dealer` | `Distributor`.

Store these as **two separate fields** (`segment`, `priceTier`). Never a single combined "type." Segment filters the catalog; tier selects the price column. Per-variant segment tag is `Automotive | Industrial | Both` ("Both" = visible to all). "Combined" is an *account*, never a product tag.

## Security model (NON-NEGOTIABLE — hybrid: rules + Functions)

**Firestore rules enforce field-level invariants. Cloud Functions own privileged multi-step mutations.**

Rules MUST enforce (server-side, on the write):
- `users` / `distributors` **create**: `request.auth.uid == uid`, `status == "pending"`, `isActive == false`, and `role` restricted to non-privileged values. A user must **not** be able to self-assign `admin`/`approved`/`active`.
- `orders` **create**: `status == "pending"`; distributors pinned to `distributorId == auth.uid`; amounts not client-authoritative.
- Deny client writes to privileged fields anywhere: `role`, `status`, approval fields, `order.status`, inventory balances.
- Read isolation: a distributor reads only their own orders/distributor doc; non-staff cannot read admin collections.

Cloud Functions (verify `caller.role` server-side) own: **account approval, role assignment, order-status changes, inventory writes, coupon-usage increments, user/distributor deletes.**

**Never rely on client-side route guards for data protection** — they are UX only; the rules + Functions are the real gate.

## Data model rules (source of truth: PRD §7)

- **Money: store as integer minor units (paise).** `₹1.00 → 100`. All arithmetic (line totals, GST, discount, freight) in integer paise; round explicitly at each boundary (`Math.round`). **No floats for money.** Display in **₹** via a shared formatter — never `$`.
- **GST 18%, exclusive; freight extra.** Compute GST on top of line totals.
- **Orders carry line items.** Each line: `sku`, `qty` (in packs, whole units ≥1), `packQty`, `unitPrice` **captured at order time** (catalog prices change; invoices must reflect order-time price), `lineTotal`. A free-text `itemsSummary` is **display only**, never the source of truth. `lineTotal = qty × packQty × unitPrice(tier)`.
- **Products** = one doc per orderable variant; carries `dealerPrice`, `distributorPrice`, `segment`, `category`, `packQty`, `baseUnit`, `productKey` (links variants of one product to one inventory pool). Keyed by stable `sku` (upsert, never duplicate).
- **Inventory in BASE UNITS (L/kg/piece), never packs.** `onHand` is the single source of truth; available packs are *derived* (`floor(onHand / packQty)`). No reservation — availability is live `onHand`; admin allocates manually on conflict (PRD §7, decisions #4/#5/#7/#8).
- **Demand is derived, not stored** — aggregate *approved* open-order lines by product in base units; cancelling an approved order removes its demand.
- **Referenced entities store both id and name** (`{ productId, productName }`), plus `createdAt` / `updatedAt` (AGENTS.md §3).
- **Soft delete:** always write `deleted: false` on create. Firestore `where("deleted","!=",true)` **excludes docs missing the field** — a doc created without `deleted` becomes invisible. Every soft-deletable doc must set the field at creation.
- **Media:** Firebase Storage; Firestore stores `url` **and** `storagePath` (mandatory for deletion).

## Routing & UI

**Role-segregated route segments**, each with its own layout guard:

```
/admin/*          guard: role == admin
/salesperson/*    guard: role == salesperson
/distributor/*    guard: role == distributor
/supervisor/*     guard: role == supervisor       (to be added)
/manufacturing/*  guard: role == manufacturing     (to be added)
```

Retire the shared `/dashboard/*` area. Every new page goes under its role segment; the segment's `layout.tsx` checks `approved && active && role == <segment>`. Tailwind classes stay internal — never expose them to users (AGENTS.md §4).

## Deploy & infra

- **Frontend:** Firebase Hosting. **Rules + Functions:** `firebase deploy`. **Any developer may deploy** — be deliberate; deploys hit the live project.
- **Dedicated Technofluid Firebase project:** `techno-fluid` (Firestore region `asia-south1`; default Storage bucket is `US-EAST1` — auto-provisioned, left as-is). This is the live project — no more shared-placeholder caveat.
- **Secrets never live in this repo or in `CLAUDE.md`.** Firebase web config via `NEXT_PUBLIC_*` env vars; Function secrets (e.g. GST provider keys) via Firebase Functions params/config. Reference locations only.

## Quality gate (before a PR is "ready")

- `next build` / `tsc` clean **and** `eslint` clean (`npm run lint`).
- A **post-action summary/preview** the PM can verify against the ticket's acceptance criteria (e.g. import summary, demand totals) — this is how the PM tests (PRD §9).
- Automated tests are **opportunistic** for now (no suite exists yet); add unit/rules tests where logic is risky. Correctness > Simplicity > Speed (AGENTS.md §12).

## Known issues / must-fix (do NOT copy these patterns)

Current code contains these defects — fix on the relevant ticket; never replicate:

- **C1 — Privilege escalation:** `users` create rule lets a signed-in user write any `role`/`status`/`isActive` → self-made admin. Fix per Security model.
- **H1 — Unvalidated order writes:** rules don't pin `status`/`distributorId`/amounts → distributors can self-approve orders (injecting fake demand) and set any total.
- **H2 — Flat order shape:** orders store a free-text `itemsSummary` + hand-typed totals, no line items, no order-time price. Must become line-item orders (see Data model).
- **H3 — Missing axes:** no `priceTier` anywhere; `segment` is conflated with product category (and invents `Metalworking`/`Maintenance`). Implement the two-axis model.
- **H4 — Coupon usage write denied:** clients call `incrementCouponUsage` but rules allow coupon writes to admin only → usage limits unenforced + false order-failure. Move to a Function.
- **H5 — Invisible self-signups:** signup omits `deleted:false`, so `!=`-filtered admin lists never show self-registered distributors. Always set `deleted:false`.
- **M-tier:** add manufacturing/supervisor roles; supervisor currently over-privileged; approval remaps distributor uid and orphans pre-approval orders; route gating is client-side only; currency rendered as `$`.

## How we work (ticket workflow)

See **`docs/PROCESS.md`**. Per ticket: `/draft-ticket <thing>` → `/start-ticket` → build (feature branch, one PR per task) → `/handoff` → `/manager-review`. Match existing conventions; don't introduce SQL/ORMs, extra state libraries, or backend servers (AGENTS.md §2).

## References

- `docs/PRD.md` — product spec & build sequence (the source of truth; honor ⚠️ open decisions — ask Ansh, don't invent).
- `docs/PROCESS.md` — ticket pipeline.
- `frontend/AGENTS.md` — frontend coding rules.
- Product master: `Product master resources/` + `Technofluid-Product-Master-DRAFT.xlsx` (320 variants).
- External: Firebase (Auth/Firestore/Functions/Storage/Hosting), GST lookup provider (via `verifyGST` function).
