# Handoff: Ticket #5 — Move product import to a Cloud Function + price-free `public_catalog` + rules lockdown

**Ticket:** #5 — [M2] Move product import to a Cloud Function + price-free `public_catalog` + rules lockdown

## Summary

Moved the authoritative product-catalog write off the client and into a new `importProducts` Cloud Function (`onCall`, v2, `us-central1`), matching the existing admin-callable pattern (`createUserByAdminCallable`, `approveDistributorCallable`). The client still parses/previews the `.xlsx` locally, but Confirm now sends the validated rows to the Function, which **independently re-validates every row** (required fields, enums, integer-paise prices, Firestore-id-safe SKU, in-payload duplicate check) before writing anything. In the same invocation the Function also maintains a new price-free `public_catalog/{productKey}` projection (one doc per product family, built via a shared `buildPublicCatalogDoc` helper) for the future public marketing site. It also fixes the pre-existing bug where re-importing reset an admin's manual `active:false`/`deleted:true`/`description` edits: those fields are now set only on create and left untouched on update. `firebase/firestore.rules` was locked down so `products` and `public_catalog` both deny all client writes — only the Function (Admin SDK) can write them — while `public_catalog` reads are made fully public (unauthenticated).

## Files changed

**Cloud Function**
- `firebase/functions/src/products/importProducts.ts` (new) — `onCall` callable: verifies `request.auth` + caller's `users/{uid}.role === "admin"`; re-validates each row server-side and collects `invalid: [{rowNumber, reason}]`; reads all existing `products` once to decide create vs. update; upserts `products` (full doc + `active:true/deleted:false/createdAt` on create, catalog-fields-only merge on update, preserving lifecycle fields); groups the batch by `productKey` to build/delete `public_catalog` docs; commits all writes chunked to ≤500 ops; returns `{created, updated, skipped, invalid, families}`.
- `firebase/functions/src/products/buildPublicCatalogDoc.ts` (new) — pure helper producing the price-free family doc from a family's product rows (only active, non-deleted variants contribute a pack size; returns `null` if none), reusable by the future editable-table ticket.
- `firebase/functions/src/index.ts` — exports `importProducts`.

**Frontend caller + page rewire**
- `frontend/lib/api/admin.ts` — new typed `importProducts(rows)` caller + `ImportProductsRow`/`ImportProductsResponse` types, following the existing `httpsCallable` + `handleFirebaseError` pattern.
- `frontend/app/(dashboard)/admin/products/page.tsx` — Confirm now calls `importProducts` (the Function) instead of the removed `upsertProducts` client write; summary now also renders server-rejected rows (`invalid: [{rowNumber, reason}]`).
- `frontend/lib/services/productImport.ts` — `mapAndValidateRows`'s valid rows now carry `rowNumber` (`ValidProductRow = ProductMaster & {rowNumber}`) so the payload sent to the Function can be matched back to the original sheet row for server-side rejection reporting.
- `frontend/lib/services/productMasterService.ts` — **deleted**; this was the only client write path to `products` and is fully retired.

**Rules**
- `firebase/firestore.rules` — `products`: `allow write: if isAdmin()` → `allow write: if false` (Admin SDK bypasses rules, so the Function is unaffected). New `public_catalog/{productKey}` match: `allow read: if true; allow write: if false`.

## How to test

1. Deploy: `cd firebase && firebase deploy --only functions,firestore:rules --project techno-fluid` (needs IAM access to `techno-fluid`; Node 24).
2. `cd frontend && npm run build` (clean) — already verified in this session.
3. Log in as an approved `admin`, go to `/admin/products`, upload `docs/Technofluid-Product-Master-DRAFT.xlsx`, click Confirm.
   - Devtools → Network tab: confirm a call to the `importProducts` callable fires (not a direct Firestore write).
   - Summary shows created/updated/skipped counts.
4. Firestore console: `products` collection has 320 docs; re-run the import → still 320 (created ≈ 0, updated ≈ 320, no duplicates).
5. Permission check: while logged in as admin, attempt a direct client `setDoc` to `products/{sku}` or `public_catalog/{key}` from devtools — expect `permission-denied` on both.
6. Server-validation check: invoke `importProducts` with a deliberately bad row (e.g. `category: "Foo"` or a negative price) — it should come back in `invalid` and not be written.
7. `public_catalog`: ~199 family docs, each `{productKey, product, category, segment, packSizes, updatedAt}` — no `sku`/prices/GST/`packQty`. Verified two concrete cases:
   - Single-variant family `products/10KGBUC-10KG-3` ("10 kg Bucket Grease AP3", `productKey: 10-kg-bucket-grease-ap3`): set `active:false` in Firestore console, re-import → `active:false` preserved, `public_catalog/10-kg-bucket-grease-ap3` deleted (its only variant is now inactive).
   - Multi-variant family "Air Compressor Oil" (`productKey: air-compressor-oil`, SKUs `AIRCOMOIL-210LBARR` / `AIRCOMOIL-26LCANE` / `AIRCOMOIL-50LCANE`): set `AIRCOMOIL-26LCANE`'s `active:false`, re-import → preserved (not reset), `public_catalog/air-compressor-oil.packSizes` shrinks from 3 entries to 2 rather than the doc being deleted.
8. Unauthenticated read of a `public_catalog` doc succeeds; unauthenticated write is denied.

## Acceptance criteria

- [x] Importing via `/admin/products` calls the `importProducts` callable, not direct Firestore writes; summary shows created/updated/skipped — implemented in `page.tsx` + `admin.ts`.
- [x] `products` remains keyed by SKU; re-import updates in place, no duplicates — implemented via `existingBySku` map + `doc(sku)` upsert in `importProducts.ts`.
- [x] Client can no longer write `products` or `public_catalog` — `allow write: if false` on both in `firestore.rules`; developer to confirm post-deploy via devtools (see How to test #5).
- [x] Server-side validation is authoritative — `importProducts.ts` re-implements all row checks independently of the client and never writes invalid rows.
- [x] `public_catalog` has one price-free doc per family, `packSizes` reflecting active/non-deleted variants — implemented via `buildPublicCatalogDoc`; developer-verified against real product-master data (single- and multi-variant families) as described above.
- [x] `public_catalog` is publicly readable, not client-writable — `allow read: if true; allow write: if false` in `firestore.rules`.
- [x] Lifecycle preserved on re-import (`active`/`deleted`/`description` not reset) — `importProducts.ts` writes only catalog fields + `updatedAt` on update, never touching those fields; developer-verified with the two test SKUs above.
- [x] Functions build (Node 24) clean, `next build` + lint clean for touched files — verified in this session (`tsc` clean in `firebase/functions`, `next build` succeeded, `eslint` clean on all files this ticket touched).
- [ ] `firebase deploy` succeeds — not run in this session; requires the developer's IAM-authed CLI against `techno-fluid` (see Access & prerequisites in the ticket).
- [ ] Backfill re-import against the live `techno-fluid` project to populate `public_catalog` for the existing 320 products — pending the deploy above.

## Deviations / decisions

- **`public_catalog` is computed from the import batch only** (not from a full re-read of the entire `products` collection), per the ticket's explicit wording: *"it has all rows in hand, so it computes the ~199 family docs once from the batch."* This matches current real usage (the product master is always uploaded as a full 320-row re-upload), but means a genuinely *partial* re-upload (a file containing only some SKUs) would only update `public_catalog` for the families present in that file — untouched existing families are left as-is, which is correct, but a family whose *only in-file* variant becomes inactive would drop out even if other, not-reuploaded variants of that family still exist and are active in Firestore. Flagged during planning; followed the ticket text as written rather than substituting a full-collection re-read, since the ticket calls this out as the intended design.
- `productKey` is taken from the client-supplied row (not recomputed via `slugify(product)` server-side) — the Function validates it's non-empty but trusts the client's computation, consistent with the ticket's re-validation list (which doesn't call out productKey re-derivation) and keeping the Function's rules a direct mirror of `validateRow`.
- Firestore-id-safety check for `sku` rejects `/`, `.`, and `..` and enforces the 1500-byte doc-id length limit; the ticket only explicitly calls out `/`, so this is a slightly broader interpretation of "reject `/` etc."

## Open questions / follow-ups

- Deploy + backfill against `techno-fluid` are still outstanding — needs the developer's IAM access per the ticket's prerequisites; not something this session could execute.
- The partial-reimport edge case for `public_catalog` (noted above) is worth a follow-up ticket if partial re-uploads become a real workflow (they aren't today).
- Editable products table / admin CRUD, the public marketing site UI, and swapping the vulnerable `xlsx` npm package for the SheetJS CDN build remain out of scope, as stated in the ticket.
