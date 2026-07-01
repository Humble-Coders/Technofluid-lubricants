# Technofluid Lubricants Platform — PRD & Build Spec

**Client:** Technofluid Lubricants · **Vendor:** Humble Solutions · **PM:** Ansh
**Repo:** github.com/Humble-Coders/Technofluid-lubricants
**Stack:** Next.js (App Router) · Firebase Auth · Firestore · Cloud Functions (TypeScript)
**Status:** Draft for build — settled sections are firm; sections marked ⚠️ DECIDE FIRST must be resolved with the client before building.

> **How to use this doc with Claude Code:** Sections 1–6 are product/context — read for understanding. Section 7 (data model) and Section 9 (build sequence) are what you implement against. Do not build anything under a ⚠️ heading until the open question above it is answered; ask the user (Ansh) instead of inventing the rule.

---

## 1. What this product is

An end-to-end web platform covering Technofluid's full order lifecycle: field sales visits → distributor onboarding → order placement → manufacturing demand → inventory → dispatch → invoicing/accounting. It replaces a manual, spreadsheet-and-phone process.

## 2. Users & roles

| Role | What they do |
|---|---|
| **Admin** | Technofluid HQ. Full visibility; approves accounts; manages catalog, inventory, dispatch, invoicing. |
| **Salesperson** | Field staff. Logs visits, onboards distributors, places orders on distributors' behalf. |
| **Distributor** | Customer. Browses their catalog, places orders. Has a **segment** (Automotive / Industrial / Combined) and a **price tier** (Dealer / Distributor). |
| **Supervisor** | Inputs/updates inventory (base-unit stock levels). Confirm division of labour with Manufacturing — both can write inventory. |
| **Manufacturing** | **Separate login role.** Sees aggregated product demand in base units (never orders/customers); logs production by editing inventory upward. |

## 3. The two independent axes (critical concept)

Distributors are classified on **two separate dimensions** that must not be conflated:

- **Segment (visibility)** — *what products they see.* Automotive, Industrial, or Combined. Combined = sees both Automotive and Industrial products.
- **Price tier** — *what price they pay.* Dealer (higher) or Distributor (~20% lower).

A given account is one segment **and** one tier (e.g. "Combined Distributor"). These are orthogonal: segment filters the catalog, tier picks which price column to show. Build them as two separate fields, never one combined "type."

✅ CONFIRMED: every account is exactly one (segment, tier) pair, fixed — tiers are never mixed across products within an account.

## 4. Current state of the codebase

**Built (UNAUDITED — not yet tested or code-reviewed by PM):**
- Auth: login/signup, Firebase Auth, role-based routing, approval flow (status: pending/approved/rejected, isActive)
- Firestore collections in use: `users`, `distributors`, `coupons`, `admin_settings`
- Cloud Functions: `users`, `distributors`, `gst` (GST lookup), `config`
- Salesperson/dashboard: visits, firms, distributor creation (with GST auto-fill), orders, rate-list views
- Distributor portal: rate-list, place-order (cart), order history
- Admin panel: distributors, salespersons, supervisors, coupons, rate-list, orders, seed, settings
- Firestore security rules exist (helpers: isSignedIn, isApproved, role checks)

**Not built:** product master / catalog import, inventory, manufacturing demand view, ERP order-to-stock matching, dispatch, invoicing, accounting.

**Build divide:** order *intake* (sales → distributor → order) largely exists; order *fulfillment* (manufacture → stock → dispatch → invoice) is greenfield.

## 5. The product catalog (SETTLED — built and ready)

The product master has been cleaned from the client's six source sheets into **320 unique orderable variants**. This is the source of truth for the catalog. Source file: `Technofluid-Product-Master-DRAFT.xlsx` (pending final client sign-off on 5 items).

Key facts the system must honor:
- A **product variant** = product + pack size (e.g. "Gear EP 150 / 20L bucket"). Each variant is independently orderable and priced.
- **Two prices per variant:** dealer price and distributor price.
- **Segment tag per variant:** Automotive (146), Industrial (141), or Both (33). "Both" = visible to all segments. Combined is NOT a stored tag — it's an account that sees everything.
- **Catalog identity:** Combined = Automotive ∪ Industrial, exactly. No Combined-exclusive products.
- **Categories:** Bulk oil (167, priced per litre), Grease (80, per kg/case/bucket), Retail pack (73, per piece/litre).
- **Ordering unit = the pack** (case/bucket/barrel/piece). Minimum 1, whole units only. No loose quantities.
- **Pack quantity** is a number (e.g. 210L barrel → 210) used to compute totals and production demand.
- **Case size is a product-level attribute** — fixed per product, editable going forward, never variable per order.
- **GST 18% exclusive; freight extra.**

## 6. Out of scope (v1)
Live Google Sheets API sync (CSV upload instead) · native mobile apps (responsive web only) · payment gateway · multi-warehouse · e-way bill / e-invoice government APIs.
⚠️ Confirm with client: salespersons OK using responsive web on phones; e-invoice integration genuinely not needed yet.

---

## 7. Data model (implement against this)

### `products` (NEW collection — the product master)
One document per orderable variant.
```
{
  sku: string,              // e.g. "GEAREP150-20LBUCKET" (stable, unique)
  product: string,          // cleaned display name
  category: "bulk_oil" | "grease" | "retail",
  orderableUnit: string,    // "20L bucket", "210L barrel", "20x1 liter case"
  packQty: number,          // base units per pack, e.g. 210
  baseUnit: "L" | "kg" | "piece",
  pricePer: "per litre" | "per kg" | "per case" | "per bucket" | "per piece",
  dealerPrice: number,      // ₹, GST-exclusive
  distributorPrice: number, // ₹, GST-exclusive
  gstPct: number,           // 18
  segment: "Automotive" | "Industrial" | "Both",
  active: boolean
}
```
Line total for an order item = `qty × packQty × unitPrice(tier)` where unitPrice is dealer or distributor price. (For per-case/per-bucket items, pricePer already equals the pack, so confirm the multiply rule per category — see ⚠️ in §8.)

### `distributors` (EXISTS — extend)
Ensure each carries `segment` (Automotive/Industrial/Combined) and `priceTier` (Dealer/Distributor). Catalog shown = filter `products` by segment (Combined = all), prices shown = the tier's column.

### `inventory` (NEW) — tracked in BASE UNITS, not packs
**This is the core of the fulfillment model. Read carefully.**

Stock is tracked per **product** in **base units (litres / kg / pieces)** — NOT in packs/cases. Packs are a *derived view*, never stored.

```
{ productKey: string,     // groups all pack-size variants of one product (e.g. "GEAR-EP-150")
  baseUnit: "L" | "kg" | "piece",
  onHand: number,         // physical base units in the warehouse — the single source of truth
  updatedAt, updatedBy }
```

Why base units, not packs: one product is sold in several pack sizes (20L bucket, 210L barrel, …) that all draw from the **same physical pool**. 500 litres of an oil is simultaneously 25 buckets OR 2 barrels OR a mix — you cannot store "available packs" as a number because the pack sizes contend for the same litres. Base units dissolve this; packs are computed only for display: `availablePacks(variant) = floor(onHand / variant.packQty)`.

Two drains, one source:
- **Producer:** Manufacturing edits `onHand` upward when production happens (direct edit allowed; the Supervisor role also inputs inventory).
- **Drain 1 — online dispatch:** dispatching an order line of `qty` packs reduces `onHand` by `qty × packQty`.
- **Drain 2 — loose/store sales:** the (future) POS sells loose quantities, reducing `onHand` directly by base units. M2 must expose a clean `deductBaseUnits(productKey, amount, reason)` operation for this; the POS itself is a later milestone.

**No reservation.** Approved-but-undispatched orders do NOT hold stock. "Available" always means physical `onHand`. When competing orders exceed available stock, the **admin allocates manually** (see M3). This was a deliberate decision — chosen over reserve-on-approval for simplicity.

> ⚠️ Note: this supersedes any earlier "inventory in cases" / "reserve on approval" model. Base units + no reservation is the locked model.

Each `products` variant carries a `productKey` linking it to its inventory pool, so all pack sizes of one product share one `onHand` balance.

### `orders` (EXISTS — verify shape)
Order has distributor, line items (sku, qty in packs, unit price captured AT order time, line total), status, timestamps. Capturing price at order time matters — catalog prices change, invoices must reflect the price when ordered.

**Dispatchability is computed in base units, not packs.** An order line for `qty` packs of a variant needs `qty × packQty` base units of its `productKey` pool. Because pack sizes of one product compete for the same pool, the dispatch/allocation engine works entirely in base units; the per-variant pack count is display only.

**Partial dispatch is supported.** Each order *line* has its own fulfillment state; ship what's available now, the rest later. Order status rolls up from its lines (e.g. Open / Partially dispatched / Dispatched). ⚠️ Invoicing-per-shipment vs per-order is an M4 decision this creates.

### Demand (DERIVED, not stored)
Manufacturing view aggregates **approved** open-order line items by product → total base units needed, base units on hand, shortfall. Only **approved** orders count; **cancelling an approved order removes its demand**. No order or customer fields exposed to manufacturing.

---

## 8. Feature specs by milestone

### M1 — Audit & stabilize (PM-led, mostly non-code)
PM tests every existing flow; findings become `bug`/`tech-debt` issues. Code review of services, functions, security rules. **Verify Firestore rules enforce role isolation** (a distributor must not read others' orders; a salesperson must not write admin collections). Done when all Critical/High issues are closed and existing flows demo cleanly.

### M2 — Product master import + inventory + manufacturing demand
1. **CSV importer (admin):** upload CSV matching the product-master schema → preview table → per-row validation (required fields, numeric prices, valid segment/category/pricePer) → invalid rows highlighted with reason and excluded → on confirm, upsert into `products` keyed by `sku` (update existing, don't duplicate) → import summary (created / updated / skipped with reasons). Malformed file shows clear error, never partial import. **Strictly reject rows that don't match the schema** — do not guess or coerce.
2. **Inventory model & views:** per-product `onHand` in base units (see §7). Admin sees full inventory in litres/kg plus computed available-packs per variant. Manufacturing and Supervisor can edit `onHand` upward. Expose `deductBaseUnits(productKey, amount, reason)` for dispatch and future POS.
3. **Manufacturing demand view:** aggregated **approved**-order demand per product in base units (needed, on hand, shortfall); cancelling an approved order removes its demand; no order/customer data shown.
4. **Production logging:** ⚠️ DECIDE FIRST — batch-level vs daily-total (client discussion pending). For now manufacturing edits `onHand` directly; the logging granularity around it is the open part.
5. **Batch/expiry:** ✅ add `batchNo` / `expiry` fields to inventory writes, but build no logic on them yet (client may refine).

### M3 — ERP matching & dispatch
Matching engine works **in base units**: for each approved order line, check whether its `productKey` pool has `qty × packQty` base units available. Order line states: `Dispatchable` / `Partially dispatchable` / `Awaiting production`.
- ✅ **Partial dispatch supported** — ship available lines/quantities now, remainder later; order status rolls up from line states.
- ✅ **No reservation** — availability is live `onHand`; nothing is held at approval.
- ✅ **Admin allocates manually on conflict** — when competing orders exceed available base units for a product, admin decides who gets what (no automatic FIFO). Build an allocation screen showing on-hand base units vs competing demand.
Dispatch decrements `onHand` by the dispatched base units.

### M4 — Invoicing & accounting
Invoice per dispatched order (or per shipment — see below): line items, prices captured at order time, GST breakup (CGST/SGST/IGST by state), invoice number series, freight line, PDF. Ledger: payments vs invoices, per-distributor outstanding. ✅ Accounting is **in-system** — no Tally/external integration.
⚠️ DECIDE FIRST (deferrable, PM will resolve later): invoice number format/series (client's CA); freight calc rule (flat / per-km / per-order quote); invoice-per-shipment vs per-order (created by partial dispatch).

### M5 — Store / counter billing (POS) — DEFERRED, build later
A full billing system for **loose counter sales** (sub-pack quantities) drawing from the same base-unit inventory pool. Selling loose deducts base units directly, which lowers the computed available-packs for online orders — so the two channels reconcile automatically through shared inventory.
- Any loose quantity sellable for now; system does not distinguish sealed vs opened stock.
- Humble Solutions already has a dual accounting API engine and a bill-generating engine; this milestone wires standard POS flows to them and to `deductBaseUnits`.
- Not built now — but M2's inventory must expose the deduction hook so this slots in cleanly later.

---

## 9. Suggested build sequence for Claude Code

Work in feature branches, one PR per task, against the existing Next.js + Firebase structure. Match existing conventions in `frontend/app/(dashboard)/admin/`.

1. Add the `products` collection + admin "Import Products" page (CSV → preview → validate → upsert). Seed it with the signed-off product master.
2. Refactor the existing rate-list / place-order screens to read from `products`, filtering by the logged-in distributor's `segment` and showing the `priceTier` price. (Verify current order shape first; capture unit price at order time.)
3. Add `inventory` collection + admin inventory view + manual adjustment.
4. Build the manufacturing demand aggregation (read-only, derived, base units, approved orders only) and production/inventory editing that writes `onHand`.
5. (After M2 decisions) matching engine + dispatch — base-unit math, partial dispatch, admin allocation screen.
6. (After M3) invoicing + ledger.
7. (Deferred, M5) store/counter POS for loose sales — wires to existing accounting/bill engines + `deductBaseUnits`.

After each task: a post-action summary/preview the PM can check (e.g. import summary, demand totals) — this is how the PM tests against acceptance criteria.

## 10. Decisions log

**Resolved (locked):**

| # | Question | Decision |
|---|---|---|
| 1 | Manufacturing access | Separate login role |
| 2 | Account structure | Exactly one (segment, tier), fixed, never mixed |
| 3 | Demand counting | Only **approved** orders; cancellation removes demand |
| 4 | Stock reservation | **None** — no hold until dispatch; availability is live on-hand |
| 5 | Stock competition | **Admin allocates manually**; no auto-FIFO |
| 6 | Partial dispatch | **Supported** — line-level fulfillment, status rolls up |
| 7 | Inventory unit | **Base units (L/kg/piece)**; packs derived, never stored |
| 8 | Pack-size contention | Pack sizes of one product share one base-unit pool; dispatch math in base units |
| 9 | Supervisor role | Inputs inventory |
| 10 | Loose/store sales | Sell any loose qty from same pool; sealed vs opened not distinguished |
| 11 | Accounting | In-system, no Tally |
| 12 | Batch/expiry | Add field, no logic yet |

**Still open:**

| # | Question | Blocks | Owner |
|---|---|---|---|
| A | Production logging granularity (batch vs daily) | M2 production logging | Client (next discussion) |
| B | Manufacturing vs Supervisor inventory write division | M2 inventory permissions | PM/Client |
| C | Invoice number format/series | M4 | Client's CA (deferred) |
| D | Freight calculation rule | M4 | Client (deferred) |
| E | Invoice per-shipment vs per-order | M4 | Client (created by partial dispatch) |
| F | Per-case vs per-unit price multiply rule per category | M2 line totals | PM verify against master |
| G | "Blue Gel … red grease" description | catalog sign-off | Client |
| H | Salespersons OK on responsive web (phones) | UX | Client (low risk) |

---
*Settled facts in §3 and §5 are confirmed against the client's data. Everything marked ⚠️ is a real open question — building past it without an answer produces rework.*
