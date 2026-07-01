---
name: Feature / Task ticket
about: A unit of work for a developer (built with Claude Code)
title: "[M2] Move product import to a Cloud Function + price-free public_catalog + rules lockdown"
labels: ["M2"]
assignees: []
---

## 📖 Story / Why

Product-catalog writes currently happen **client-side**: the Import Products page parses + validates in the browser, then writes `products` directly via `upsertProducts` (merged in #3/#4). The `products` Firestore rule only checks `isAdmin()` — it does **not** validate the schema — so a buggy client build or an admin poking Firestore directly could inject **malformed product docs**, and a browser closing mid-import leaves a **partial catalog**. Separately, the public marketing site needs a **price-free** view of the catalog.

This ticket moves the **authoritative write into a Cloud Function** (`importProducts`), builds the price-free **`public_catalog`** projection in the same path, and **locks down the rules** so only the Function (Admin SDK) can write the catalog — matching `CLAUDE.md`'s "privileged mutations go through Cloud Functions; rules are the backstop." It also fixes a bug from the #4 review where re-importing **resurrects deactivated / soft-deleted products**.

## 🧭 Context

- **Current flow (main):** client parses `.xlsx` (SheetJS) → `mapAndValidateRows` (`frontend/lib/services/productImport.ts`) → preview → on Confirm, `frontend/lib/services/productMasterService.ts` `upsertProducts` writes `products` from the browser (`writeBatch`, doc id = `sku`, `merge`). Rule today: `products` `allow write: if isAdmin()`.
- **Functions pattern:** v2 `onCall`, region `us-central1`, Node 24 (`firebase/functions`). See `firebase/functions/src/users/createUserCallable.ts`: `onCall({region:"us-central1"}, …)`, verify `request.auth`, read `users/{uid}` and check `role==="admin"`, throw `HttpsError`. Exported from `firebase/functions/src/index.ts`. Typed callers live in `frontend/lib/api/admin.ts` (`httpsCallable` + `handleFirebaseError`); frontend uses `getFunctions(app,"us-central1")`.
- **Decisions (manager interview):**
  - **`importProducts` writes BOTH** `products` and `public_catalog` in one path; it has all rows in hand, so it computes the ~199 family docs **once** from the batch via a shared `buildPublicCatalogDoc(familyProducts)` helper (the future editable-table ticket reuses it).
  - **Transport: client sends the validated rows (JSON) to the callable.** The client keeps parsing + previewing the xlsx (xlsx parsing stays **client-side** — no server-side xlsx). The Function **re-validates authoritatively** — do not trust the client's rows.
- **`public_catalog` schema — one doc per `productKey` (family):**
  ```
  public_catalog/{productKey}
  { productKey, product, category, segment, packSizes: string[], updatedAt }
  ```
  **NO prices, GST, SKU, packQty, or any internal field.** `packSizes` = the orderable units of the family's **active, non-deleted** variants. A family with no active variants gets **no** doc (remove it if present). (Optional `description`/`imageUrl` can be added later.)
- **active/deleted bug (from #4 review):** `upsertProducts` spreads `...row` (always `active:true, deleted:false`) with `merge`, so re-import overwrites an admin's `active:false`/`deleted:true`. **Fix in the Function:** set `active`/`deleted` **only on create**; on **update**, write catalog fields (prices, name, units, gst) but **preserve** `active`, `deleted`, `description`, `imageUrl`, `imagePath`.
- **Validation reuse:** the row rules currently live in the frontend (`validateRow`). The Function must validate **independently, server-side** (the real gate). `frontend/` and `firebase/functions/` are separate TS packages with no shared module — so **re-implement the same rules inside the Function** (single source of truth = the schema in `CLAUDE.md` Data model / PRD §7). Keep the client validation for the preview UX.

## 🔑 Access & prerequisites

- [ ] **Admin login + IAM access to `techno-fluid`** to deploy Functions + rules and to test. ⚠️ Project owner is `humblecoders2024`; ensure your account has access (see #1 follow-up) — deploys/tests fail otherwise.
- [ ] Firebase CLI authed to `techno-fluid`; **Blaze** billing already on (from #1). Node **24** for the functions build.
- [ ] `frontend/.env.local` pointing at `techno-fluid` (from #1 / `.env.local.example`).
- [ ] Deploy command: `cd firebase && firebase deploy --only functions,firestore:rules --project techno-fluid`.
- [ ] No secrets in the repo.

## ✅ Scope / What to build

- [ ] **`importProducts` callable** — `firebase/functions/src/products/importProducts.ts`, exported from `index.ts` (v2 `onCall`, `us-central1`):
  - Verify `request.auth` and caller `users/{uid}.role === "admin"` → else `HttpsError`.
  - Input `{ rows: ProductInput[] }`.
  - **Re-validate every row** server-side: required fields; enums `category`/`segment`/`baseUnit`/`pricePer`; `dealerPrice`/`distributorPrice` integer paise ≥ 0; `packQty` > 0; `gstPct` ≥ 0; `sku` non-empty, **Firestore-id-safe (reject `/` etc.)**, unique within payload. Invalid rows are collected and **not written**.
  - **Upsert `products`** by `sku` (Admin SDK, batched ≤500): always set catalog fields + `updatedAt`; set `createdAt` + `active:true` + `deleted:false` **only on create**; on update **do not touch** `active`/`deleted`/`description`/`imageUrl`/`imagePath`.
  - **Build `public_catalog`:** group the resulting active, non-deleted products by `productKey`; write one price-free family doc via `buildPublicCatalogDoc`; **delete** family docs that now have no active variants.
  - Return `{ created, updated, skipped, invalid: [{rowNumber, reason}], families }`.
- [ ] Shared helper **`buildPublicCatalogDoc(familyProducts)`** producing the price-free doc (reused by the editable-table ticket).
- [ ] **Typed caller** `importProducts` in `frontend/lib/api/admin.ts` (follow the existing `httpsCallable` + `handleFirebaseError` pattern).
- [ ] **Rewire** `frontend/app/(dashboard)/admin/products/page.tsx` Confirm → call the `importProducts` caller with the validated rows; render the returned summary + any **server-rejected** rows.
- [ ] **Retire the client write path** — remove `upsertProducts` (or its direct-write body) from `productMasterService.ts`; ensure **no client code writes `products`**.
- [ ] **`firebase/firestore.rules`:**
  - `products`: keep **read** = approved users; **`allow write: if false`** (client denied; the Admin SDK Function bypasses rules).
  - `public_catalog`: **`allow read: if true`** (fully public — the marketing site reads it unauthenticated); **`allow write: if false`**.
- [ ] **Deploy** functions + rules to `techno-fluid`.
- [ ] **Backfill:** re-run the import via `/admin/products` (now hitting the Function) to populate `public_catalog` for the existing 320 products.
- [ ] Post-action summary the PM can verify.

## 🎯 Acceptance Criteria

- [ ] Importing via `/admin/products` now calls the **`importProducts` callable** (visible in the network tab), not direct Firestore writes; summary shows created/updated/skipped.
- [ ] `products` remains 320 docs by SKU; re-import updates in place (no duplicates).
- [ ] **Client can no longer write the catalog:** with rules deployed, a direct client `setDoc` to `products` **or** `public_catalog` is **permission-denied** (test as admin from devtools). Only the Function writes.
- [ ] **Server-side validation is authoritative:** invoking `importProducts` with a bad row (e.g. `category:"Foo"`, or a negative price) returns it as invalid/skipped and it is **not written** — even when the client validation is bypassed.
- [ ] **`public_catalog`** has ~199 family docs, each `{productKey, product, category, segment, packSizes}` with **no prices / GST / SKU**; `packSizes` lists the family's orderable units.
- [ ] `public_catalog` is **publicly readable** (an unauthenticated read succeeds) and **not client-writable**.
- [ ] **Lifecycle preserved on re-import:** set a product `active:false` (or `deleted:true`, or a `description`), re-import → those values are **preserved**, not reset.
- [ ] Functions build (Node 24) clean; `cd frontend && npm run build` + lint clean for touched files; `firebase deploy` succeeds.

## 🚫 Out of scope

- Editable products **table / admin CRUD** (next ticket) — but it must reuse `buildPublicCatalogDoc`.
- The **public marketing site UI** that reads `public_catalog` (later ticket).
- Swapping the vulnerable **`xlsx`** dep to the SheetJS CDN build (separate follow-up) — parsing stays client-side here.
- Filling `description`/`imageUrl` content or images.
- Migrating rate-list / place-order off the legacy mock `Product`.

## 🔗 Dependencies

- **#3** (product importer) — merged; this refactors its write path.
- **#1** — IAM access + Blaze on `techno-fluid` to deploy Functions.

## 📚 References

- `CLAUDE.md` → **Security model** (privileged mutations via Functions; rules as backstop; deny client writes to privileged data) and **Data model** (products schema, price-free public path, money in paise).
- `docs/PRD.md` → **§7** (`products`), **§5** (catalog).
- Code: `frontend/lib/services/productImport.ts` (rules to mirror server-side), `productMasterService.ts` (upsert being moved), `frontend/app/(dashboard)/admin/products/page.tsx` (Confirm rewire), `firebase/functions/src/index.ts` + `users/createUserCallable.ts` (Function pattern), `frontend/lib/api/admin.ts` (caller pattern), `firebase/firestore.rules` (products block).

## 🤖 Kickoff prompt (paste into Claude Code)
```
/start-ticket 5
```
