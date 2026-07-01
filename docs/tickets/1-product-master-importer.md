---
name: Feature / Task ticket
about: A unit of work for a developer (built with Claude Code)
title: "[M2] Product-master importer + `products` schema (admin Import Products page)"
labels: ["M2"]
assignees: []
---

## 📖 Story / Why

The product catalog currently lives only in an Excel file, and the app reads **mock** products (`frontend/lib/useProducts.ts` → `USE_MOCK_PRODUCTS = true`). We need the **320-variant product master in Firestore as the single source of truth**.

This ticket builds the admin **"Import Products"** page — upload the master `.xlsx` → preview → per-row validation → **upsert by SKU** → import summary — and defines the new `products` collection schema (prices in **integer paise**, per `CLAUDE.md`). It's the foundation for the editable products table (next ticket) and the price-free public catalog that the public marketing site will read.

## 🧭 Context

- **Data source:** `docs/Technofluid-Product-Master-DRAFT.xlsx`, sheet **"Product Master"**, **320 rows / 199 product families**. Columns **A–K are the schema**; **L–N are audit-only — ignore them**. The workbook also has "Read me" and "Confirm with client" sheets. The master is a **DRAFT** (5 open client questions incl. the "Blue Gel" naming) — **import it anyway**; those are content confirmations, not import blockers.
- **Decisions (from manager interview — baked in):**
  - Parse the **`.xlsx` directly, client-side, with SheetJS (`xlsx` npm)** — read the "Product Master" sheet, ignore cols L–N. (Adds the `xlsx` dependency; approved.)
  - **Seed the initial 320 by uploading the master through this page** (dogfood the importer — no separate seed script).
  - Schema **includes optional `description` / `imageUrl` / `imagePath`**, but the **importer never sets them** (writes only A–K–derived fields); they're filled later via the editable table.
- **Schema mapping — master column → `products` field:**

  | Col | Field | Type / rule |
  |---|---|---|
  | A SKU | `sku` (+ **doc id**) | string, non-empty, unique-in-file |
  | B Product | `product`, `productKey` | name + derived slug (family key) |
  | C Category | `category` | map `Bulk oil→bulk_oil`, `Grease→grease`, `Retail pack→retail`; reject unknown |
  | D Orderable unit | `orderableUnit` | string; trim + collapse whitespace |
  | E Pack qty | `packQty` | number > 0 |
  | F Base unit | `baseUnit` | enum `L`\|`kg`\|`piece` |
  | G Price per | `pricePer` | enum `per litre`\|`per kg`\|`per case`\|`per bucket`\|`per piece` |
  | H Dealer price | `dealerPrice` | **× 100 → integer paise** |
  | I Distributor price | `distributorPrice` | **× 100 → integer paise** |
  | J GST % | `gstPct` | number (18) |
  | K Visible to | `segment` | enum `Automotive`\|`Industrial`\|`Both` |
  | L–N | — | audit; **ignore** |

  Plus set on every doc: `active: true`, `deleted: false`, `createdAt` (on create), `updatedAt` (always). Optional `description`/`imageUrl`/`imagePath` left unset by the importer.
- **Placement:** new admin page `frontend/app/(dashboard)/admin/products/page.tsx` (matches the `/admin/*` routing rule + existing admin pages). Add a sidebar entry. `products` write is **admin-only** — already enforced in `firebase/firestore.rules` (products block); **no rules change needed**.
- **Reuse existing UI primitives** in `frontend/components/ui/` (`table`, `modal`, `button`, `card`, `input`, `badge`).
- **Don't break existing mock consumers.** `frontend/types/product.ts` has a *legacy* `Product` type (`basePrice`/`unit`) and `productService.ts`/`useProducts.ts` feed the rate-list & place-order screens from mock data. Introduce the **new** `products` schema/type/service **alongside** the old ones; **do not delete or rewire the legacy paths in this ticket** (that refactor is a later ticket).

## 🔑 Access & prerequisites

- [ ] **Admin login to the `techno-fluid` project** to test writes (the page is admin-gated and `products` writes are admin-only). ⚠️ Per #1's follow-up, ensure your Google account has **IAM access to `techno-fluid`** (the project owner is `humblecoders2024`; other accounts were locked out) — get access via the manager if `/admin` reads/writes fail.
- [ ] `frontend/.env.local` pointing at `techno-fluid` (created in #1; copy from `frontend/.env.local.example` and fill via `firebase apps:sdkconfig WEB --project techno-fluid`).
- [ ] Node 24 + npm. Add **`xlsx` (SheetJS)** to `frontend` dependencies.
- [ ] The master file is already in the repo at `docs/Technofluid-Product-Master-DRAFT.xlsx` (not a secret).

## ✅ Scope / What to build

- [ ] Add `xlsx` (SheetJS) to `frontend/package.json`.
- [ ] Define the **new `products` type + schema** (doc id = SKU): fields per the mapping table, **prices as integer paise**, `active`, `deleted:false`, `createdAt`/`updatedAt`, optional `description`/`imageUrl`/`imagePath`. Keep it separate from the legacy `Product` type.
- [ ] Product service: a typed mapper for the new schema + `upsertProducts(rows)` writing by SKU (`setDoc(doc(db,'products',sku), …, {merge:true})`), setting `createdAt` only when new and `updatedAt` always.
- [ ] Admin page `/admin/products` — **Import Products**:
  - [ ] File picker (`.xlsx`). Parse client-side with SheetJS; read sheet **"Product Master"**; ignore cols L–N.
  - [ ] Map + normalize each row → schema (paise `×100`; category/segment mapping; trim+collapse `orderableUnit` whitespace).
  - [ ] **Per-row validation**, invalid rows highlighted **with a reason** and **excluded**: required A–K present; numeric `packQty`/prices/gst; `category`/`segment`/`baseUnit`/`pricePer` in their enums; SKU non-empty and unique within the file.
  - [ ] **Preview table** before any write: valid rows + invalid rows (with reasons) + counts.
  - [ ] **Malformed/unreadable file, or missing "Product Master" sheet → clear error, NO writes** (never a partial import from a broken file).
  - [ ] On **Confirm**: upsert the valid rows by SKU. Show an **import summary**: created / updated / skipped (with reasons).
- [ ] Sidebar nav entry (admin) for **Import Products**.
- [ ] **Seed:** upload `docs/Technofluid-Product-Master-DRAFT.xlsx` through the page → 320 products written. Report the counts in the handoff.
- [ ] Post-action summary the PM can verify (counts + a couple of sample docs).

## 🎯 Acceptance Criteria

- [ ] Uploading the master `.xlsx` shows a preview with **320 valid rows, 0 invalid**, and category/segment tallies matching the master: **bulk_oil 167 / grease 80 / retail 73** and **Automotive 146 / Industrial 141 / Both 33**.
- [ ] Confirming imports → `products` collection has **320 docs, doc id = SKU**. **Re-uploading the same file updates in place** (still 320, reported as "updated", no duplicates).
- [ ] A deliberately broken row (non-numeric price, or category not in {Bulk oil, Grease, Retail pack}) is shown **invalid with a reason and excluded**; the valid rows still import.
- [ ] Prices are stored as **integer paise** (spot-check: dealer ₹146 → `dealerPrice: 14600`), `gstPct: 18`.
- [ ] A **malformed file** (or one missing the "Product Master" sheet) shows a clear error and **writes nothing**.
- [ ] The **import summary** shows created / updated / skipped counts.
- [ ] `products` writes remain **admin-only** (a non-admin write is rejected by the existing rules).
- [ ] `cd frontend && npm run build` and `npm run lint` (for files this ticket adds) are clean; the page is reachable at **`/admin/products`** via the sidebar.
- [ ] Existing rate-list / place-order screens still function (legacy mock paths untouched).

## 🚫 Out of scope

- Editable admin products **table / inline CRUD** (next ticket).
- The price-free **`public_catalog`** projection + the public marketing site (later tickets).
- **Refactoring** rate-list / place-order to read from `products` (later ticket).
- Filling `description`/`imageUrl` content or product images.
- The **per-category price multiply rule** for order line totals (PRD open Q F) — schema stores `pricePer`; the math is later.
- **Inventory / base-unit stock** (`onHand`) — a different concept and milestone.

## 🔗 Dependencies

- **#1** (dedicated Firebase migration) — merged; products seed into `techno-fluid`.
- **IAM access** to `techno-fluid` for the dev's admin account (see #1 follow-up).

## 📚 References

- `CLAUDE.md` → **Data model rules** (products schema, money in paise, soft-delete), **Routing** (`/admin/*`), **Security model** (products admin-only).
- `docs/PRD.md` → **§5** (catalog facts), **§7 `products`** schema, **§8 M2.1** (importer: strict reject, never partial import), **§9.1**.
- `docs/Technofluid-Product-Master-DRAFT.xlsx` → sheet **"Product Master"** (cols A–K; L–N audit); sheet **"Confirm with client"** (5 open questions).
- Existing code: `frontend/types/product.ts`, `frontend/lib/services/productService.ts`, `frontend/lib/useProducts.ts` (legacy/mock), `firebase/firestore.rules` (products block), `frontend/components/ui/{table,modal,button,card,input}`.

## 🤖 Kickoff prompt (paste into Claude Code)
```
/start-ticket 3
```
