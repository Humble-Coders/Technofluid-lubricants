# Changes

## 1. GST Lookup — External auto-fill (City/State)

**`GstDistributorLookup.tsx`**
- Added `onAutoFillState` prop
- When external GST API returns data, immediately calls `onAutoFillState(verified.state)` — no button click needed
- Added `toTitleCase()` helper; applied to firm name when "Use This Firm" is clicked

**`DistributorIdentitySection.tsx`**
- Passes `onAutoFillState` through to `GstDistributorLookup`

**`create/page.tsx`**
- `handleAutoFillState` matches the GST state string against `ALL_STATES` (case-insensitive) and adds it to `territory.states`

---

## 2. Text casing normalization

**`GstDistributorLookup.tsx`**
- `toTitleCase()` applied to firm name on "Use This Firm" click (e.g. `METRO OILS PVT LTD` → `Metro Oils Pvt Ltd`)

**`create/page.tsx`**
- `toTitleCase()` applied to manually typed firm name at form submission

---

## 3. Distributor firm appears in Firms section

**`firmService.ts`**
- Added `saveDistributorFirmDataNoGst(name, address?)` — writes a `firms/noGST_<NAME>` document

**`createDistributor.ts`** (admin flow)
- Calls `saveDistributorFirmData` when GST present, `saveDistributorFirmDataNoGst` when not

**`distributorService.ts`** (salesperson flow)
- Same logic added to `createDistributorInFirestore`

---

## 4. Created By shows admin username

**`createDistributor.ts`**
- Added `createdBy` to `CreateDistributorInput`
- Writes `createdBy` to the Firestore distributor document

**`create/page.tsx`**
- Reads `userData?.name` from `useAuth()` and passes it as `createdBy`

---

## 5. Remove `contactInfo` from all distributor writes

Readers now use `phone` directly.

- **`distributorService.ts`** — `updateDistributor`: removed `payload.contactInfo`; `createDistributorInFirestore`: removed `contactInfo` from setDoc; mapper now reads `phone` first
- **`createDistributor.ts`** — removed `contactInfo` from admin setDoc
- **`useDistributors.ts`** — `contactInfo` mapped from `row.phone`
- **`createUserCallable.ts`** (function) — removed `contactInfo` from distributors write
- **`approveDistributorCallable.ts`** (function) — removed `contactInfo` from batch distributors write

---

## 6. Remove `distributorCount` / `ordersCount` from user writes

Replaced with on-demand `getCountFromServer` queries.

- **`types/user.ts`** — removed both fields from `User` type
- **`userService.ts`** — removed from `mapUser`, `getUserById`, and `createUserInFirestore` (setDoc + return object); added `getUserOrdersCount(uid)` and `getUserDistributorsCount(uid)` using `getCountFromServer`
- **`createUserCallable.ts`** (function) — removed both fields from users write
- `signup/page.tsx` left untouched (auth logic)

---

## 7. Firm history → subcollection

`firms/{id}/history` replaces the embedded `history[]` array. Firestore auto-IDs used (no nanoid dependency needed).

- **`firmService.ts`**
  - Added `HISTORY_SUBCOLLECTION = "history"` constant
  - Added `getFirmHistory(firmId)` — reads `firms/{id}/history`
  - `createOrUpdateFirm` — dedup check queries subcollection; new entry written to `firms/{gstNumber}/history/{autoId}` with `serverTimestamp()`; `history` field removed from main doc write
  - `saveNoGstFirm` — same pattern for `noGST_*` docs
  - `getFirmByGst` — loads history from subcollection after fetching main doc
  - `getBranchByGstAndAddress` — queries `getFirmHistory` directly
  - `getAutoFillPriorities` — queries `getFirmHistory` directly
  - `getAllFirms` — defaults `history: []`; preserves old array for legacy docs that haven't migrated
  - `Firm` type: `history` kept required; comment updated

---

## 8. Visit media → subcollection

`visits/{id}/media` replaces the embedded `media[]` array. Firestore auto-IDs used.

- **`logVisitService.ts`**
  - Added `MEDIA_SUBCOLLECTION = "media"` constant
  - `buildLogVisitData` — `media` removed; main visit doc no longer contains media
  - `createLogVisit` — batches main doc + all media subcollection writes atomically
  - `updateLogVisit` — queries existing media subcollection, batch-deletes all, batch-writes new set (full sync)
  - `mapLogVisit` — `media: []` (subcollection, not in main doc)
  - `getLogVisitById` — loads media from subcollection via `getVisitMedia` after main doc fetch
  - Added `getVisitMedia(visitId)` — exported; reads `visits/{id}/media`
  - Real-time subscriptions (`subscribeLogVisitsBySalesperson`, `subscribeAllLogVisits`) return `media: []`; callers should call `getVisitMedia` when media is needed
  - Added `writeBatch` to imports

---

## 9. Replace `new Date()` with `serverTimestamp()` in Firestore writes

The only Firestore-bound `new Date()` calls were the `updatedAt: new Date()` lines in `firmService.ts` history entries — eliminated by change 7 above (subcollection docs now use `serverTimestamp()`).

`new Date().toISOString()` in `uploadVisitMedia` is a local UI display string, not a Firestore field value — left unchanged.

---

## 11. Coupons: `targetNames` → `targetIds` (UIDs)

Targeted coupons now store user UIDs instead of display names so validation is identity-stable.

- **`types/coupon.ts`** — `targetNames?` → `targetIds?`
- **`admin/_data/mockData.ts`** — `CouponRow.targetNames?` → `targetIds?`; seed data updated
- **`coupons/_lib/couponSchemas.ts`** — `targetNames` → `targetIds` in `targetedCouponSchema`
- **`couponService.ts`** — mapper reads `targetIds`, falls back to legacy `targetNames` for old docs; `validateCoupon` signature changed from `userName` to `userId`; targeted check uses `targetIds.includes(userId)`; added `migrateCouponTargetNamesToIds()` (reads targeted coupons, builds name→UID map from `users` collection, writes `targetIds` — run once manually from admin panel, then delete)
- **`useCoupons.ts`** — mapper uses `targetIds`; `createCoupon` writes `targetIds`
- **`CreateCouponModal.tsx`** — state stores IDs; checkboxes toggle by `option.id`; chips look up display name by ID from `roleOptions`
- **`CouponsTable.tsx`** — `targetNames` → `targetIds` in count display
- **`CouponInput.tsx`** — prop renamed `userName` → `userId`; passed to `validateCoupon`
- **`place-order/page.tsx`** — passes `userId={userData?.uid}` instead of `userName`

---

## 12. `visitType` discriminant field

New `visitType: "legacy" | "field"` field on all visit documents to separate the two visit shapes that share the `visits` collection.

- **`types/visit.ts`** — added `visitType` to both `Visit` and `LogVisit` types
- **`visitService.ts`** — `createVisitInFirestore` writes `visitType: "legacy"`; mapper defaults to `"legacy"`; all reads filter out docs where `visitType === "field"`
- **`logVisitService.ts`** — `buildLogVisitData` always writes `visitType: "field"`; mapper defaults to `"field"`; all reads filter out docs where `visitType === "legacy"`

Old docs with no `visitType` field pass through each service via the mapper default — backward compatible without a data migration.

---

## 13. Territory conflict check → Cloud Function

Moved from a full client-side Firestore scan to a server-side Cloud Function that queries only approved distributors.

- **`functions/src/distributors/checkTerritoryConflict.ts`** — new `onCall` function; accepts `{ distributorId?, states, assignedProductIds }`; queries `distributors` where `status == "approved"`; skips `distributorId` when provided (edit scenario); returns `{ conflict, conflictingDistributorId? }`; includes note on why a Firestore transaction cannot wrap a collection query
- **`functions/src/index.ts`** — exports `checkTerritoryConflict`
- **`frontend/lib/api/admin.ts`** — added `checkTerritoryConflict(payload)` callable wrapper with typed request/response
- **`distributorService.ts`** — `checkTerritoryProductConflict` now calls the CF instead of scanning Firestore client-side; return shape unchanged so `DistributorCoverageSection` callers require no update

---

## 14. noGST firm document IDs

noGST firm docs now get random IDs (`noGST_<nanoId(10)>`) instead of name-derived IDs. Normalized name stored as a queryable field.

- **`firmService.ts`** — `saveNoGstFirm` and `saveDistributorFirmDataNoGst` both generate `noGST_<nanoId(10)>` using Web Crypto (no new dependency); store `normalizedName: <UPPER_UNDERSCORE_NAME>` as a queryable field; added comment: "Legacy noGST_ name-based IDs may still exist in DB"

---

## 15. Normalized name fields for case-insensitive search

- **`firmService.ts`** — all firm creates/updates write `currentNameLower: currentName.toLowerCase().trim()` (`createOrUpdateFirm`, `saveNoGstFirm`, `saveDistributorFirmData`, `saveDistributorFirmDataNoGst`)
- **`distributorService.ts`** — `createDistributorInFirestore` writes `nameLower`; `updateDistributor` updates `nameLower` when `name` is changed
- **`createDistributor.ts`** (admin flow) — writes `nameLower`
- **`createUserCallable.ts`** (function) — writes `nameLower` on distributor doc
- **`approveDistributorCallable.ts`** (function) — writes `nameLower` on distributor doc

---

## 16. Soft delete for users and distributors

Documents are soft-deleted (`deleted: true, deletedAt, deletedBy`) instead of hard-deleted. Auth user deletion is unchanged.

- **`types/user.ts`** — added `deleted?: boolean`
- **`types/distributor.ts`** — added `deleted?: boolean`
- **`deleteUser.ts`** (function) — replaces `.delete()` calls with a batch `update({ deleted: true, deletedAt, deletedBy: callerUid })`; Auth `.deleteUser()` kept as-is
- **`distributorService.ts`** — `deleteDistributorDoc` and `deleteDistributorAllDocs` soft-delete; `createDistributorInFirestore` writes `deleted: false`; all list queries (`getAllDistributors`, `subscribeDistributors`, `getDistributorsBySalesperson`, `subscribeDistributorsBySalesperson`, `getDistributorByGst`) add `where("deleted","!=",true)`
- **`userService.ts`** — `createUserInFirestore` writes `deleted: false`; `getAllUsers` and `subscribeUsersByRole` add `where("deleted","!=",true)` (composite index on `deleted+role` may be needed in Firestore console)
- **`createUserCallable.ts`** (function) — writes `deleted: false` on both user and distributor docs
- **`approveDistributorCallable.ts`** (function) — writes `deleted: false` on both docs

---

## 17. rate_lists restructured to subcollection

New path: `rate_lists/{distributorId}/products/{productId}`. Global rates use `distributorId = "global"`.

- **`rateListService.ts`** — full rewrite: `upsertRateEntry` uses `setDoc` at subcollection path (no query needed — productId IS the doc ID); `deleteRateEntry(productId, distributorId?)` uses subcollection path; `subscribeGlobalRateList` reads `rate_lists/global/products`; added `subscribeDistributorRateList(distributorId)`; removed now-redundant `normalizeGlobalEntries`; added `migrateRateLists()` — reads all flat `rate_lists/*` docs and rewrites to subcollection (run once manually from admin panel, then delete)
- **`types/product.ts`** — `RateListEntry.id` is now `productId` (the subcollection doc ID)
- `useRateList.ts` unchanged — still calls `subscribeGlobalRateList`

---

## 18. Schema doc updated

**`frontend/schema.md`** — full rewrite to table format:
- `distributors` updated: deprecated `serviceArea`/`productCategories` replaced with `territory`, `assignedProducts`, `distributorType`, `linkedFirmId`; `contactInfo` marked as read-from-phone; `createdBy` clarified (admin name string or salesperson UID)
- `firms` updated: `noGST_<NAME>` doc ID pattern documented; all four writers listed; fields marked by which writer sets them
- Removed verbose prose, examples, and change checklists
