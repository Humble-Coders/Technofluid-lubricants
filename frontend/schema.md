# Technofluid Lubricants — Schema Reference

Last updated: 2026-05-25

---

## Collections

### `users/{uid}`

| Field | Type | Notes |
|---|---|---|
| email | string | |
| name | string | |
| phone | string | |
| role | `admin\|supervisor\|salesperson\|distributor` | |
| status | `pending\|approved\|rejected` | |
| isActive | boolean | |
| distributorCount | number | default 0 |
| ordersCount | number | default 0 |
| createdBy | string \| null | |
| supervisorId | string \| null | no active writer yet |
| approvedBy | string \| null | |
| approvedAt | Timestamp \| null | |
| lastLoginAt | Timestamp \| null | |
| createdAt | Timestamp | |
| updatedAt | Timestamp | |

---

### `distributors/{distributorId}`

| Field | Type | Notes |
|---|---|---|
| name | string | Title-cased firm name |
| email | string | |
| phone | string | |
| contactInfo | string | mirrors phone |
| address | string? | |
| gstNumber | string? | GSTIN |
| distributorType | `Automotive\|Industrial\|Combined`? | |
| territory | `{ states, districts, cities: string[] }`? | |
| assignedProducts | `{ productId, productName, category }[]`? | |
| linkedFirmId | string? | GSTIN of linked firms doc |
| status | `pending\|approved\|rejected` | |
| isActive | boolean | |
| createdBy | string | admin's display name or salesperson UID |
| approvedBy | string \| null | |
| approvedAt | Timestamp \| null | |
| lastLoginAt | Timestamp \| null | |
| authCreated | boolean | false = salesperson-created (no auth user yet) |
| createdAt | Timestamp | |
| updatedAt | Timestamp | |

Conflict rule (frontend-only): no two distributors may share overlapping `territory.states` and `assignedProducts`.

---

### `firms/{id}`

Document ID is either the GSTIN (`22AAAAA0000A1Z5`) or `noGST_<NORMALIZED_NAME>` for distributors without a GST number.

| Field | Type | Notes |
|---|---|---|
| gstNumber | string | empty string for noGST docs |
| currentName | string | |
| currentAddress | string? | |
| currentLocation | `{ lat, lng }`? | set by log-visit flow |
| defaultPriorities | PrioritySet? | set by log-visit flow |
| history | FirmHistoryEntry[]? | set by log-visit flow |
| legalName | string? | from GST verification API |
| tradeName | string? | from GST verification API |
| gstStatus | string? | e.g. "Active" |
| registrationDate | string? | |
| constitution | string? | |
| registeredAddress | string? | |
| state | string? | |
| pincode | string? | |
| gstVerifiedAt | Timestamp? | |
| createdAt | Timestamp? | absent on distributor-seeded docs |
| updatedAt | Timestamp | |

Writers:
- `firmService#createOrUpdateFirm` — log-visit save
- `firmService#saveFirmGstData` — GST API verification
- `firmService#saveDistributorFirmData` — distributor create (with GST)
- `firmService#saveDistributorFirmDataNoGst` — distributor create (no GST)

---

### `orders/{orderId}`

| Field | Type | Notes |
|---|---|---|
| distributorId | string? | |
| distributorName | string | |
| salespersonId | string | |
| itemsSummary | string | |
| totalQty | number | |
| totalAmount | number | |
| discount | number? | default 0 |
| couponCode | string? | |
| status | `pending\|processing\|approved\|rejected\|cancelled\|delivered` | |
| createdAt | Timestamp | |

---

### `visits/{visitId}`

Two shapes coexist:

**Legacy visit** (simple log)

| Field | Type |
|---|---|
| salespersonId | string |
| distributorId | string |
| distributorName | string |
| leadType | `hot\|warm\|cold` |
| notes | string |
| nextFollowUp | Timestamp \| null |
| createdAt / updatedAt | Timestamp |

**Log Visit** (full field visit)

| Field | Type | Notes |
|---|---|---|
| salespersonId / salespersonName | string | |
| hasGst | boolean | |
| gstNumber | string? | present when hasGst=true |
| firmName | string? | required on submit |
| address | string? | |
| status | `draft\|submitted` | |
| location | `{ lat, lng }` \| null | |
| media | `{ url, storagePath, type, createdAt }[]` | storagePath mandatory for deletion |
| priorities | `{ monthly, annually: PriorityItem[] }` | min 5 each on submit |
| relatedFirms | array | each has hasGst, name, address, priorities |
| createdAt / updatedAt | Timestamp | |

`PriorityItem`: `{ productId, productName, quantity }`

---

### `products/{productId}`

| Field | Type |
|---|---|
| name | string |
| description | string? |
| basePrice | number |
| unit | string |
| category | string? |
| isActive | boolean |
| createdAt / updatedAt | Timestamp? |

---

### `coupons/{couponId}`

| Field | Type | Notes |
|---|---|---|
| code | string | stored/queried uppercase |
| type | `global\|targeted` | |
| targetRole | `salesperson\|distributor`? | targeted only |
| targetNames | string[] | targeted only |
| discountType | `percentage\|flat` | |
| discountValue | number | percentage ≤ 100 |
| usageLimit | number | 0 = unlimited |
| usageCount | number | |
| status | `active\|inactive` | |
| validTill | string | YYYY-MM-DD |
| createdAt | Timestamp | |

---

### `rate_lists/{entryId}`

| Field | Type |
|---|---|
| distributorId | string |
| productId | string |
| productName | string |
| price | number |
| unit | string |
| effectiveDate | Timestamp |
| updatedAt | Timestamp |

---

## Cloud Functions

### `createUserByAdminCallable`
Request: `{ email, password, name, role, phone? }`  
Response: `{ success: true, uid }`  
Creates Auth user + `users/{uid}` (approved). If role=distributor, also creates `distributors/{uid}`.

### `approveDistributorCallable`
Request: `{ distributorId }`  
Response: `{ success: true, uid, email }`  
Creates Auth user for placeholder distributor, writes approved docs, deletes old placeholder if id changed.

### `deleteUser`
Request: `{ uid }`  
Response: `{ success: true }`  
Deletes Auth user + `users/{uid}` + `distributors/{uid}` if distributor.

> `approveUser` and `rejectUser` wrappers exist in `lib/api/admin.ts` but have no backend implementation.

---

## Known Gaps

- `firms` collection has no Firestore security rules (inherits default deny in prod).
- Territory/product conflict check is frontend-only — no server enforcement.
- `history[].updatedAt` uses client `new Date()`, not `serverTimestamp()`.
- `approveUser` / `rejectUser` callables not implemented in backend.
