# Handoff: Ticket #7 — Admin editable products table (CRUD via Cloud Functions) + partial-import projection fix

**Ticket:** #7 — [M2] Admin editable products table (CRUD via Cloud Functions) + partial-import projection fix

## Summary

Added a full admin CRUD layer on top of the `products` catalog that was previously read/write only through a full Excel re-upload. Two new admin-verified Cloud Functions, `updateProduct` and `createProduct`, let an admin edit any field on an existing product (except the immutable `sku`/`productKey`) or add a one-off product, without touching Excel. Row validation was extracted from `importProducts` into a shared `validateProductRow` helper so all three functions enforce identical constraints. The `/admin/products` page now has a **Catalog** tab (searchable, filterable, sortable table with edit/toggle-active/soft-delete actions and a "New product" form) alongside the existing **Import** tab. Critically, this ticket also fixes the partial-import bug flagged in the #6 review: `importProducts` previously rebuilt each family's `public_catalog` doc from only the uploaded batch, silently dropping any of that family's pack sizes that weren't in the file. It's now rebuilt from the family's full current variant set (merged in memory from data already loaded, with no added Firestore round-trips — an initial per-family-query implementation caused `importProducts` to hit its 60s Cloud Functions timeout on the full 320-row catalog and was corrected during testing).

## Files changed

**Cloud Functions — `firebase/functions/src/products/`**
- `validateProductRow.ts` (new) — extracted the enum/integer-paise/required/Firestore-id-safe-SKU checks previously inline in `importProducts.ts`'s `validateRow`, so `importProducts`, `updateProduct`, and `createProduct` share one validation source of truth.
- `rebuildFamilyProjection.ts` (new) — `rebuildFamilyProjection(db, productKey)`: queries all `products` docs for a `productKey`, runs `buildPublicCatalogDoc`, and `set`s or `delete`s `public_catalog/{productKey}`. Used by `updateProduct` and `createProduct` (each touches exactly one family per call, so a per-call query is cheap there).
- `importProducts.ts` (rewritten) — now uses `validateProductRow` instead of its own inline copy. For the partial-import fix, it does **not** call `rebuildFamilyProjection` per family (that caused the 504 below); instead it merges the already-loaded full `products` collection with this batch's updates in memory, groups the merged set by `productKey`, and rebuilds every *affected* family's `public_catalog` doc from that complete in-memory state via `buildPublicCatalogDoc`, batched through the existing `commitInChunks` helper. No additional Firestore reads are added versus the pre-ticket version.
- `updateProduct.ts` (new) — `onCall`, admin-verified: input `{ sku, fields }`; 404s if the product doesn't exist; rejects `sku`/`productKey` in `fields` (immutable) and any field not in the allowed edit list; re-validates the merged (existing + changed) row via `validateProductRow`; writes catalog fields + `active`/`deleted`/`updatedAt`; then `rebuildFamilyProjection`.
- `createProduct.ts` (new) — `onCall`, admin-verified: input a full product row; derives `productKey` via a `slugify` mirroring the frontend importer's; `validateProductRow`s the candidate; rejects (`already-exists`) if the SKU doc already exists; writes with `active:true`/`deleted:false`/timestamps; then `rebuildFamilyProjection`.
- `index.ts` — exports `updateProduct` and `createProduct`.

**Frontend — typed callers**
- `frontend/lib/api/admin.ts` — new `updateProduct(payload)` and `createProduct(payload)` callers (+ `UpdateProductFields`/`UpdateProductPayload`/`CreateProductPayload` types), following the existing `httpsCallable` + `handleFirebaseError` pattern.

**Frontend — read path**
- `frontend/lib/services/productMasterReadService.ts` (new) — `subscribeProductMaster(onChange, onError, { includeDeleted })`: Firestore `onSnapshot` on `products`, filtered `deleted != true` by default (matches the "soft-deletable docs must set `deleted` at creation" convention, which `importProducts`/`createProduct` already follow).
- `frontend/lib/hooks/useProducts.ts` (new) — React hook wrapping the read service (`products`, `isLoading`, `error`).
- `frontend/lib/format.ts` (new) — `formatPaise`, `rupeesToPaise`, `paiseToRupees` — the shared ₹ formatter/converter used throughout the new UI.
- `frontend/lib/productFieldOptions.ts` (new) — shared `<Select>` option lists (category, base unit, price-per, segment) and category display labels, reused by the table and both forms.

**Frontend — `/admin/products` UI**
- `frontend/app/(dashboard)/admin/products/page.tsx` (rewritten) — now a two-tab shell (**Catalog** / **Import**) instead of the single Import-only page.
- `frontend/app/(dashboard)/admin/products/_components/ImportProductsTab.tsx` (new) — the prior page body (file upload → preview → confirm → summary), moved unchanged into a tab component.
- `frontend/app/(dashboard)/admin/products/_components/ProductsTable.tsx` (new) — the Catalog tab: search (name/SKU), category + segment filters, "Show deleted" toggle, sortable column headers (click to sort ascending/descending, click again to clear), fixed-width `table-fixed` layout with truncation + hover tooltips on SKU/Product/Category/Segment so long names don't blow out row/column width, row actions (Edit / Deactivate-Activate / Delete) using a new compact `Button` size, single "Deleted" badge instead of stacking "Active" + "Deleted" together.
- `frontend/app/(dashboard)/admin/products/_components/ProductForm.tsx` (new) — shared form (11 fields: SKU, product name, category, segment, orderable unit, pack qty, base unit, price-per, dealer/distributor price in ₹, GST%) used by both edit and create; converts ₹ input to integer paise on submit; SKU is read-only in edit mode, editable in create mode.
- `frontend/app/(dashboard)/admin/products/_components/EditProductModal.tsx` / `NewProductModal.tsx` (new) — wrap `ProductForm` in `Modal` with `mode="workspace"` (matching the sizing convention used by `Create/EditDistributorModal` and `CreateCouponModal` for forms of this length, rather than the small centered dialog used for single-field forms).

**Shared UI component changes**
- `frontend/components/ui/button.tsx` — added an optional `size` prop (`"sm" | "md"`, default `"md"`) so table row actions can use compact buttons without hacking Tailwind class overrides via `className`.
- `frontend/components/ui/table.tsx` — `Table` accepts an optional `className` (for `table-fixed`), `TH` accepts an optional `className` (for per-column width via `<colgroup>`), `TD` accepts an optional `className` and `title` (for truncation + hover tooltips).

## How to test

1. Deploy: `cd firebase && firebase deploy --only functions,firestore:rules --project techno-fluid` (rules are unchanged by this ticket, but redeploy them anyway per the ticket's prerequisite step).
2. Log in as an approved `admin`, go to `/admin/products` → **Catalog** tab:
   - Confirm existing products load; search by name and by SKU; filter by category and segment; click column headers to sort asc/desc/clear; toggle "Show deleted".
3. **Edit a price:** click Edit on a product, change dealer price (e.g. `150`), save. Devtools Network tab should show a call to the `updateProduct` callable, not a direct Firestore write. Firestore should show `dealerPrice: 15000` (integer paise).
4. **Toggle active / soft-delete:** deactivate a variant of a multi-variant family — its family's `public_catalog.packSizes` should shrink but the doc should survive if other variants are still active; deactivate the last active variant — the `public_catalog` doc should be deleted. Soft-delete works the same way and the product leaves the default table view (shown again via "Show deleted").
5. **New product:** create one via the form, confirm it appears in the table and its family's `public_catalog` doc; attempt to create another with the same SKU — expect a clear `already-exists` error, no duplicate written.
6. **Permission check:** from devtools console, attempt a direct REST write to `products/{sku}` and `public_catalog/{productKey}` — both return `403 PERMISSION_DENIED` (rules unchanged, `write: if false` on both collections holds regardless of auth state).
7. **Partial-import fix:** pick a multi-variant family, upload a `.xlsx` containing only one of its variants via the Import tab, confirm it completes without timing out and that the family's `public_catalog.packSizes` still lists all its original pack sizes (not just the uploaded one).
8. `cd firebase/functions && npm run build` and `cd frontend && npm run build && npm run lint` — both clean.

All of the above were run and confirmed working in this session against the live `techno-fluid` project, including a redeploy after fixing a `504 Gateway Timeout` that the first `importProducts` implementation hit (see Deviations below).

## Acceptance criteria

- [x] Admin sees all products in a searchable table with category + segment filters; soft-deleted hidden by default — `ProductsTable.tsx` + `productMasterReadService.ts`; confirmed working.
- [x] Editing a price (₹) saves as integer paise via the `updateProduct` callable, confirmed via Network tab and Firestore — confirmed working.
- [x] Toggling active and soft-deleting work via the callable; `public_catalog` updates/removes correctly — confirmed working.
- [x] Add product creates via `createProduct`, rejects a duplicate SKU with a clear error, appears in the table + `public_catalog` — duplicate-SKU rejection confirmed working.
- [x] Direct client writes to `products`/`public_catalog` remain permission-denied — confirmed via REST `403` on both collections.
- [x] Partial-import fix verified: a partial upload no longer drops a family's other pack sizes from `public_catalog`; deactivating the last active variant removes the family doc — confirmed working after the timeout fix + redeploy.
- [x] All mutations keep `public_catalog` price-free — unchanged by this ticket, `buildPublicCatalogDoc` never includes price/GST/SKU fields.
- [x] Functions build (Node 24) + `next build` + lint clean for touched files; `firebase deploy` succeeded — confirmed in this session (two deploys: functions+rules, then a functions-only redeploy for the timeout fix).

## Deviations / decisions

- **`importProducts` does not call `rebuildFamilyProjection` per family.** The first implementation did call it once per affected `productKey`, each doing its own Firestore query — correct for the partial-import fix, but for a full 320-row catalog re-upload (~199 families) that meant ~199 sequential network round-trips, which blew past the Cloud Function's default 60s timeout and returned `504 Gateway Timeout` in live testing. Fixed by merging the already-loaded `products` collection with the batch's updates entirely in memory (no extra reads) and rebuilding every affected family's `public_catalog` doc from that merged state, batched via the existing `commitInChunks`. `updateProduct`/`createProduct` still use `rebuildFamilyProjection` as-is since each only ever touches one family per call, where a single extra query is not a performance concern.
- **Modal sizing:** the ticket didn't specify dialog vs. workspace sizing for the Edit/New Product modals. `ProductForm` has 11 fields across 2-column grids — matched the codebase convention used for forms of that size (`CreateDistributorModal`, `EditDistributorModal`, `CreateCouponModal`, all `mode="workspace"`), rather than the small centered `dialog` mode used for single-field forms (`SetRateModal`, `DeleteConfirmModal`).
- **`productKey` is never recomputed on edit**, per the ticket's explicit immutability requirement — even if a product's `product` name is changed via the Edit modal, it stays in its original family. Since `rebuildFamilyProjection`'s query has no explicit ordering, a family's displayed `product`/`category`/`segment` in `public_catalog` comes from whichever variant Firestore returns first, which can look inconsistent with siblings after a rename. This is a direct consequence of the ticket's immutability rule, not a new bug, and was flagged to the developer during testing rather than "fixed" (fixing it — e.g. picking a canonical variant — was out of this ticket's scope).
- **Status badge:** initially rendered both an Active/Inactive badge *and* a separate "Deleted" badge simultaneously for soft-deleted products (a deleted product can still have `active:true`), which read as contradictory in testing. Changed to show only "Deleted" when `deleted:true`, otherwise Active/Inactive.
- **No restore/undo UI** for soft-deleted products — the ticket only asks for soft-delete + a "show deleted" toggle, not a way to un-delete from the UI. Noted as a possible follow-up per the developer's request, not implemented.
- **No price-tier validation** (e.g. distributor price < dealer price) — the PRD (§3) describes distributor price as "~20% lower" than dealer price as a general pricing convention, but this isn't in the ticket's scope or acceptance criteria, and the developer explicitly asked not to add it here.

## Open questions / follow-ups

- **Restore/undo for soft-deleted products** — currently only possible by editing Firestore directly; a "Restore" action (`updateProduct({ deleted: false })`) would be a small follow-up if needed.
- **Family metadata consistency after a rename** — if an admin renames one variant of a multi-variant family, the family's `public_catalog` doc may show a different name/category/segment than expected depending on Firestore's returned document order (see Deviations). Not a regression from this ticket, but worth a follow-up if it causes visible confusion on the (future) public site.
- Description/product image editing and the Storage rules they'd need remain deferred to the public-site content step, as scoped out in the ticket.
- The public marketing site UI that reads `public_catalog` is still out of scope.
