# Handoff: Ticket #3 — Product-master importer + `products` schema

**Ticket:** #3 — [M2] Product-master importer + products schema (admin Import Products page)

## Summary

Added an admin-only **"Import Products"** page at `/admin/products` that parses the product master `.xlsx` client-side (SheetJS), validates each row against the schema in CLAUDE.md/PRD §7, previews valid/invalid rows with counts and category/segment tallies, and on confirm upserts the valid rows into the `products` collection keyed by SKU. Introduced a new `ProductMaster` type and a dedicated import/service layer, kept fully separate from the legacy mock-driven `Product` type/`useProducts.ts` used by rate-list and place-order. Added a sidebar nav entry for the new page. The importer was run against the real `docs/Technofluid-Product-Master-DRAFT.xlsx` to seed `techno-fluid`.

## Files changed

**Schema / types**
- `frontend/types/productMaster.ts` — new `ProductMaster` type + enums (`ProductCategory`, `ProductBaseUnit`, `ProductPricePer`, `ProductSegmentTag`), kept separate from the legacy `Product` type.

**Import logic**
- `frontend/lib/services/productImport.ts` — `parseProductMasterFile` (SheetJS read + "Product Master" sheet lookup, throws `ProductMasterFileError` on unreadable file or missing sheet), `validateRow`/`mapAndValidateRows` (per-column validation, category/segment mapping, paise conversion, whitespace collapsing, in-file duplicate-SKU detection).
- `frontend/lib/services/productMasterService.ts` — `upsertProducts(rows)`: reads existing SKUs once, batches `setDoc(..., {merge:true})` per row (chunked at 500 ops), sets `createdAt` only for new docs, `updatedAt` always, returns created/updated counts.

**UI**
- `frontend/app/(dashboard)/admin/products/page.tsx` — file picker, parse/validate on file select, preview-before-write, confirm-to-import, import summary. Confirm button is a floating bar fixed to the bottom of the viewport (added after initial review) so it stays visible while scrolling a long preview table.
- `frontend/app/(dashboard)/admin/products/_components/ImportPreview.tsx` — preview tables (valid rows / invalid rows with reasons) + count and category/segment tally cards, built from existing `Card`/`Table`/`Badge` primitives.

**Nav**
- `frontend/components/layout/Sidebar.tsx` — added "Import Products" nav entry (`/admin/products`).
- `frontend/components/layout/AdminShell.tsx` — added page title mapping for `/admin/products`.

**Dependency**
- `frontend/package.json` / `package-lock.json` — added `xlsx@0.18.5` (SheetJS), per the ticket's approved decision.

## How to test

1. `cd frontend && npm install && npm run dev`.
2. Log in with an approved `admin` account on the `techno-fluid` project.
3. Go to `/admin/products` (via sidebar "Import Products" or directly).
4. Upload `docs/Technofluid-Product-Master-DRAFT.xlsx` → confirm preview shows 320 valid / 0 invalid, category tally bulk_oil 167 / grease 80 / retail 73, segment tally Automotive 146 / Industrial 141 / Both 33.
5. Click "Confirm import" → summary should read created 320, updated 0.
6. Re-upload the same file → summary should read created 0, updated 320 (no duplicate docs; still 320 in the collection).
7. Edit a copy of the file with a bad row (non-numeric price, or an unrecognized category) → that row appears in the invalid table with a reason, excluded from the import; valid rows still import on confirm.
8. Upload a workbook without a "Product Master" sheet (or a corrupt file) → clear error banner, no writes.
9. Spot-check a doc in the Firestore console: dealer price ₹146 row → `dealerPrice: 14600`, `gstPct: 18`.
10. Visit `/distributor/rate-list` and `/distributor/place-order` → confirm they still render from mock data, unaffected.

## Acceptance criteria

- [x] Uploading the master shows 320 valid / 0 invalid with matching category/segment tallies — developer-verified locally.
- [x] Confirming imports writes 320 docs, doc id = SKU; re-upload updates in place (no duplicates) — developer-verified locally.
- [x] A deliberately broken row is shown invalid with a reason and excluded; valid rows still import — developer-verified locally.
- [x] Prices stored as integer paise (₹146 → `14600`), `gstPct: 18` — developer-verified locally.
- [x] Malformed file / missing "Product Master" sheet shows a clear error and writes nothing — developer-verified locally.
- [x] Import summary shows created/updated/skipped counts — implemented in `page.tsx`.
- [x] `products` writes remain admin-only — no rules change made; existing `firebase/firestore.rules` products block (`allow write: if isAdmin()`) already enforces this.
- [x] `npm run build` and `npm run lint` clean for files this ticket added (pre-existing lint errors in unrelated hooks files, e.g. `useSalespersonDistributors.ts`, are untouched by this change).
- [x] Page reachable at `/admin/products` via sidebar.
- [x] Existing rate-list / place-order screens still function — developer-verified locally; legacy `types/product.ts`, `lib/services/productService.ts`, `lib/useProducts.ts` untouched.

## Deviations / decisions

- Confirm button was changed to a floating bar fixed to the bottom of the viewport (instead of an inline button below the preview table) after initial review, so it stays reachable without scrolling through a 320-row preview.
- `npm audit` flags `xlsx@0.18.5` for known high-severity issues (prototype pollution, ReDoS) — this is the last version SheetJS published to npm; they've since moved fixes to their own CDN build. Used the npm version anyway since it's what the ticket explicitly approved, and exposure is limited (admin-only page, file is chosen by the admin themselves).
- Used a single `getDocs` read of existing SKUs + `writeBatch` (chunked at 500) for upsert, matching the batch-write pattern already used elsewhere in `lib/services/` (e.g. `distributorService.ts`), rather than per-row reads.

## Open questions / follow-ups

- Editable products table (inline CRUD, filling `description`/`imageUrl`) is the next ticket, as scoped.
- Migrating rate-list/place-order off the legacy mock `Product` type onto this new `products` collection is intentionally out of scope here (confirmed with the developer) — should be its own ticket.
- `public_catalog` projection and public marketing site read path are later tickets, per scope.
