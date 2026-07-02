---
name: Feature / Task ticket
about: A unit of work for a developer (built with Claude Code)
title: "[M2] Admin editable products table (CRUD via Cloud Functions) + partial-import projection fix"
labels: ["M2"]
assignees: []
---

## 📖 Story / Why

Today the only way to change the catalog is a **full Excel re-upload**. Admins need to **view, search, and hand-edit** products, **add one-off** products, and **deactivate / soft-delete** them — without touching Excel. Since #5/#6 locked down the catalog (`firestore.rules` denies client writes to `products` and `public_catalog`), **every mutation goes through an admin-verified Cloud Function** (like `importProducts`) that also keeps the price-free `public_catalog` projection in sync.

This ticket also **folds in the partial-import projection fix** from the #6 review: `importProducts` currently rebuilds a family's `public_catalog` doc from **only the uploaded rows**, so a *partial* upload silently drops the family's other pack sizes (or wrongly deletes the family). Both the importer and the new edit functions must rebuild each affected family from its **full current variant set**.

## 🧭 Context

- **Depends on #5/#6 (must be merged first):** the `importProducts` Cloud Function, the `public_catalog/{productKey}` projection + `buildPublicCatalogDoc` helper, and the rules lockdown (`products`/`public_catalog` `write: if false`; `products` read = approved users; `public_catalog` read = public). Functions are **v2 `onCall`, `us-central1`, Node 24**; typed callers live in `frontend/lib/api/admin.ts`.
- **New products schema** (`frontend/types/productMaster.ts`): doc id = `sku`; fields `product`, `productKey`, `category`, `orderableUnit`, `packQty`, `baseUnit`, `pricePer`, `dealerPrice`/`distributorPrice` (**integer paise**), `gstPct`, `segment`, `active`, `deleted`, `createdAt`/`updatedAt`, and optional `description`/`imageUrl`/`imagePath` (**NOT edited here — deferred**).
- **No client write path exists** anymore (`productMasterService.ts` was deleted in #6). This ticket adds a **read** service/hook for the new schema, and does all writes via new Functions.
- **Money:** stored as integer paise. The table **edits prices in ₹** and converts `×100` on save; **display via a ₹ formatter — never `$`**.
- **Decisions (manager interview):**
  - **Description + product image are DEFERRED** to the public-site content step (they're family-level and need Storage rules that don't exist yet — out of scope here).
  - **Manual "add product" is INCLUDED** — a New Product form backed by a `createProduct` Function.
- **Partial-import fix (from #6 review):** in `importProducts.ts`, `public_catalog` family docs are built from the import batch only. Fix by rebuilding each affected family from the family's **full current variant set** in Firestore (the Function already loads all products, so this is cheap) — via a shared helper reused by the new edit functions.

## 🔑 Access & prerequisites

- [ ] **#6 merged first** — this ticket builds on its Function/rules/projection. Do not start until it's on `main`.
- [ ] **Admin login + IAM access to `techno-fluid`** to deploy Functions and test (project owner `humblecoders2024`; see #1 follow-up). Node **24** for the functions build.
- [ ] `frontend/.env.local` pointing at `techno-fluid`. Deploy: `cd firebase && firebase deploy --only functions,firestore:rules --project techno-fluid` (rules unchanged here unless a new collection is touched — it isn't).
- [ ] No secrets in the repo.

## ✅ Scope / What to build

**Backend — `firebase/functions/src/products/`:**
- [ ] Extract shared helpers (reused by all three functions):
  - `validateProductRow(row)` — the enum / integer-paise / required / Firestore-id-safe-SKU checks currently inline in `importProducts.ts`.
  - `rebuildFamilyProjection(db, productKey)` — read **all** `products` where `productKey == key`, run `buildPublicCatalogDoc`, then `set` (or `delete` if no active variant) `public_catalog/{key}`.
- [ ] **Refactor `importProducts`** to call `rebuildFamilyProjection` for each affected `productKey` (from full DB state) instead of building from the batch — **the partial-import fix**. Behavior for full-master uploads is unchanged.
- [ ] New callable **`updateProduct`** (admin-verified): input `{ sku, fields }` where `fields` ⊆ `{product, category, orderableUnit, packQty, baseUnit, pricePer, dealerPrice, distributorPrice, gstPct, segment, active, deleted}`; **require the product to exist**; re-validate changed fields; **reject edits to `sku`/`productKey`** (immutable); set `updatedAt`; then `rebuildFamilyProjection`.
- [ ] New callable **`createProduct`** (admin-verified): input a full product row; `validateProductRow`; **reject if the SKU already exists**; derive `productKey` (slug of product name, matching the importer); set `active:true`, `deleted:false`, `createdAt`/`updatedAt`; then `rebuildFamilyProjection`.
- [ ] Export `updateProduct` + `createProduct` from `index.ts`.

**Frontend:**
- [ ] Typed callers `updateProduct`, `createProduct` in `frontend/lib/api/admin.ts` (existing `httpsCallable` + `handleFirebaseError` pattern).
- [ ] A **read** service + hook for the new `products` schema (subscribe/get; default filter `deleted != true` — remember to set `deleted:false` on all docs, which the importer already does).
- [ ] **Catalog table** under `/admin/products` (a section/tab alongside Import, or a sibling route): list products; **search** by name/SKU; **filter** by category + segment; **active/inactive badge**; soft-deleted hidden by default (with a "show deleted" toggle). Reuse `components/ui/{table,badge,select,input}`.
- [ ] **Edit** (row action → `Modal`): ₹ price inputs (→ paise on save), client-side validation mirroring the constraints, calls `updateProduct`.
- [ ] **Toggle active**, and **soft-delete** via `DeleteConfirmModal` → `updateProduct({ deleted: true })`.
- [ ] **New Product** form (same fields + validation) → `createProduct`.
- [ ] Shared **₹ formatter** for display.
- [ ] Post-action summary the PM can verify.

## 🎯 Acceptance Criteria

- [ ] Admin sees all products in a searchable table with **category + segment filters**; soft-deleted hidden by default.
- [ ] Editing a price (entered in **₹**) saves as **integer paise** (₹150 → `15000`) via the `updateProduct` **callable** (network shows a callable, not a direct Firestore write); the change is reflected in `products`.
- [ ] Toggling **active** and **soft-deleting** work via the callable; a soft-deleted product leaves the default view **and** its family's `public_catalog` doc updates (or the doc is removed if it was the family's last active variant).
- [ ] **Add product** creates it via `createProduct`, **rejects a duplicate SKU** with a clear error, and it appears in the table + `public_catalog`.
- [ ] Direct client writes to `products`/`public_catalog` remain **permission-denied**.
- [ ] **Partial-import fix verified:** upload a file containing only **one** variant of a multi-variant family (e.g. only the 210L barrel of a product that also has a 20L bucket) → after import, that family's `public_catalog.packSizes` **still lists all active pack sizes** (the bucket is NOT dropped). Deactivating one variant via the table keeps the family's other pack sizes; deactivating the **last** active variant removes the family doc.
- [ ] All mutations keep `public_catalog` **price-free** (no price/GST/SKU).
- [ ] Functions build (Node 24) + `cd frontend && npm run build` + lint clean for touched files; `firebase deploy` succeeds.

## 🚫 Out of scope

- **Description / product image editing + Storage rules** — deferred to the public-site content step.
- The **public marketing site UI** that reads `public_catalog`.
- Editing **`sku`** or **`productKey`** (immutable).
- Migrating rate-list / place-order off the legacy mock `Product`; swapping the `xlsx` dependency.

## 🔗 Dependencies

- **#5/#6** (Cloud Function + `public_catalog` + rules lockdown) — **must be merged first.**
- **#1** — IAM access + Blaze on `techno-fluid` to deploy Functions.

## 📚 References

- `CLAUDE.md` → **Security model** (mutations via admin Functions; rules deny client writes) and **Data model** (products schema, price-free `public_catalog`, money in paise, soft-delete `deleted:false`).
- The **#6 review** — partial-import projection finding (this ticket's fix).
- Code: `firebase/functions/src/products/importProducts.ts` + `buildPublicCatalogDoc.ts` (extract shared helpers + refactor), `firebase/firestore.rules`, `frontend/types/productMaster.ts`, `frontend/lib/api/admin.ts`, `frontend/app/(dashboard)/admin/products/page.tsx`, `frontend/components/ui/{table,modal,select,input,badge,DeleteConfirmModal}`.

## 🤖 Kickoff prompt (paste into Claude Code)
```
/start-ticket 7
```
