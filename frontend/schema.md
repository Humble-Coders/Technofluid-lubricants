# Technofluid Lubricants Schema Reference (Current)

Last verified: 2026-05-08

This document reflects the schema and callable contracts currently implemented in this repository across:

- frontend Firestore service/hook layer
- auth pages that write directly to Firestore
- firebase Cloud Functions (TypeScript source)
- security rules in firebase/firestore.rules

Use this as the source of truth before adding fields, rules, or function payload changes.

## 1) Canonical Enums and Collection Names

Defined in frontend/lib/constants.ts:

- USER_ROLES: admin | supervisor | salesperson | distributor
- USER_STATUS: pending | approved | rejected
- COLLECTIONS:
  - users
  - distributors
  - orders
  - visits
  - products
  - coupons
  - rate_lists

Additional collections (not in COLLECTIONS constant, accessed by string literal):

- firms (keyed by GSTIN — used by log visit and distributor create flows)

Additional domain enums/types:

- Order status (frontend type): pending | processing | approved | rejected | cancelled | delivered | string
- Coupon type: global | targeted
- Coupon status: active | inactive
- Coupon discount type: percentage | flat
- Visit lead type: hot | warm | cold
- Visit status: draft | submitted
- Media type: image | video

## 2) Firestore Collections

## 2.1 users

Path: users/{uid}

Primary writers:

- frontend/app/(auth)/signup/page.tsx
- frontend/lib/services/userService.ts#createUserInFirestore
- firebase/functions/src/users/createUserCallable.ts
- firebase/functions/src/users/approveDistributorCallable.ts

Read/mapping sources:

- frontend/lib/services/userService.ts
- frontend/lib/useAuth.ts
- frontend/app/(auth)/login/page.tsx

Current practical shape:

- email: string
- name: string
- phone: string (often empty string)
- role: "admin" | "supervisor" | "salesperson" | "distributor"
- status: "pending" | "approved" | "rejected" (rejected is allowed by type/rules, but no backend writer sets it today)
- isActive: boolean
- distributorCount: number (default 0 in most writers)
- ordersCount: number (default 0 in most writers)
- createdBy: string | null
- supervisorId: string | null (type-level optional; currently not written by active writers)
- approvedBy: string | null
- approvedAt: Timestamp | null
- lastLoginAt: Timestamp | null
- createdAt: Timestamp
- updatedAt: Timestamp

Example (admin-created user):

{
"email": "staff@company.com",
"name": "Aarav Singh",
"phone": "+12025550123",
"role": "salesperson",
"status": "approved",
"isActive": true,
"distributorCount": 0,
"ordersCount": 0,
"createdBy": "adminUid",
"approvedBy": "adminUid",
"approvedAt": "serverTimestamp()",
"createdAt": "serverTimestamp()",
"updatedAt": "serverTimestamp()"
}

## 2.2 distributors

Path: distributors/{distributorId}

Primary writers:

- frontend/app/(auth)/signup/page.tsx (for distributor self-signup)
- frontend/lib/services/distributorService.ts#createDistributorInFirestore (salesperson-created placeholder)
- frontend/lib/actions/createDistributor.ts + updateDistributor (admin-created via admin portal)
- firebase/functions/src/users/createUserCallable.ts (admin-created, auth-backed)
- firebase/functions/src/users/approveDistributorCallable.ts (migrates placeholder to auth uid)

Current practical shape:

- name: string — firm/account name (used as Firebase Auth display name on admin-created accounts)
- email: string
- phone: string
- address: string (optional) — autofilled from GSTIN lookup if available
- gstNumber: string (optional) — GSTIN of the distributor firm
- serviceArea: string (optional) — free-text geographic area the distributor covers (e.g. "Mumbai", "Delhi NCR")
- productCategories: string[] (optional) — product categories this distributor is authorized to sell (derived from products.category values)
- status: "pending" | "approved" | "rejected"
- isActive: boolean
- createdBy: string | null
- approvedBy: string | null
- approvedAt: Timestamp | null
- lastLoginAt: Timestamp | null
- contactInfo: string (mirrors phone; used for display/search)
- authCreated: boolean (false for salesperson-created placeholder docs; true/absent for admin/auth-backed docs)
- createdAt: Timestamp
- updatedAt: Timestamp

Conflict rule (enforced by frontend before write):

- No two distributors may share the same serviceArea AND have overlapping productCategories.
- Checked via distributorService.ts#checkAreaCategoryConflict before admin-created submissions.

Important lifecycle:

- Salesperson-created distributor records start with authCreated: false and doc id != auth uid.
- approveDistributorCallable creates Firebase Auth user, writes users/{authUid} and distributors/{authUid} as approved, then deletes old placeholder distributor doc if ids differ.
- Admin-created flow: createUserByAdminCallable creates auth user + base Firestore doc (status=approved), then frontend updateDistributor patches in gstNumber, address, serviceArea, productCategories.

## 2.3 orders

Path: orders/{orderId}

Primary writer:

- frontend/lib/services/orderService.ts#createOrder

Current practical shape:

- distributorId: string
- distributorName: string
- salespersonId: string
- itemsSummary: string
- totalQty: number
- totalAmount: number
- discount: number (defaults to 0 on create)
- couponCode: string | null
- status: string (created as "pending")
- createdAt: Timestamp

Read model allows:

- distributorId optional
- discount optional
- couponCode optional
- createdAt as Timestamp | Date | string | null

UI currently handles statuses such as pending, processing, approved, delivered, dispatched.

## 2.4 visits

Path: visits/{visitId}

Two document shapes exist in this collection.

### 2.4.1 Legacy visit (simple log)

Primary writer:

- frontend/lib/services/visitService.ts#createVisitInFirestore

Shape:

- salespersonId: string
- distributorId: string
- distributorName: string
- leadType: "hot" | "warm" | "cold"
- notes: string
- nextFollowUp: Date | Timestamp | null
- createdAt: Timestamp
- updatedAt: Timestamp

### 2.4.2 Log Visit (full field visit)

Primary writers:

- frontend/lib/services/logVisitService.ts#createLogVisit
- frontend/lib/services/logVisitService.ts#updateLogVisit

Shape:

- salespersonId: string
- salespersonName: string
- hasGst: boolean — whether the main firm was entered via GSTIN lookup (true) or manual name entry (false)
- gstNumber: string (optional) — present when hasGst is true
- firmName: string (optional) — name of the visited firm; required on submit
- address: string (optional) — firm address; autofilled from GSTIN lookup or entered manually
- status: "draft" | "submitted"
- location: { lat: number, lng: number } | null — captured from device when media is uploaded
- media: Array of:
  - url: string
  - storagePath: string (mandatory — used for Storage deletion)
  - type: "image" | "video"
  - createdAt: string (ISO 8601)
- priorities:
  - monthly: Array of { productId: string, productName: string, quantity: number } (min 5 on submit)
  - annually: Array of { productId: string, productName: string, quantity: number } (min 5 on submit)
- relatedFirms: Array of:
  - hasGst: boolean
  - gstNumber: string (optional) — present when relatedFirm.hasGst is true
  - name: string (optional) — required on submit
  - address: string (optional)
  - priorities:
    - monthly: Array of { productId, productName, quantity } (min 5 on submit)
    - annually: Array of { productId, productName, quantity } (optional; min 5 if present)
- createdAt: Timestamp
- updatedAt: Timestamp

Media storage path pattern:

- visits/{salespersonId}/media/{timestamp}_{randomId}.{ext}

Validation rules enforced on "submitted" status only:

- firmName required
- priorities.monthly min 5 items; each item: productId non-empty, quantity > 0
- priorities.annually min 5 items; each item: productId non-empty, quantity > 0
- Each relatedFirm: name required, monthly min 5 items
- Draft saves bypass priority/firm validation (firmName still required for draft too)

Side effect on save:

- If hasGst is true and gstNumber + firmName are set, logVisitService calls firmService.ts#createOrUpdateFirm to upsert the firms collection with latest name, address, location, and priorities.
- Same side effect applies for each relatedFirm where hasGst is true.

## 2.5 products

Path: products/{productId}

Current frontend read model (active products query):

- name: string
- description: string (optional)
- basePrice: number
- unit: string
- category: string (optional) — used as the distributor productCategories source; distinct values become the selectable categories in the create distributor flow
- isActive: boolean
- createdAt: Timestamp | Date | string | null (optional)
- updatedAt: Timestamp | Date | string | null (optional)

Writers are expected to be admin-only per rules; no frontend write service exists yet.

## 2.6 coupons

Path: coupons/{couponId}

Read/query sources:

- frontend/lib/useCoupons.ts (live snapshot)
- frontend/lib/services/couponService.ts (validation + usage increment)

Current create source:

- frontend/lib/useCoupons.ts#createCoupon (persists to Firestore)

Current practical shape:

- code: string (validated in UI and queried uppercase)
- type: "global" | "targeted"
- targetRole: "salesperson" | "distributor" | null
- targetNames: string[]
- discountType: "percentage" | "flat"
- discountValue: number
- usageLimit: number (0 means unlimited)
- usageCount: number
- status: "active" | "inactive"
- validTill: string (YYYY-MM-DD)
- createdAt: Timestamp

Validation rules:

- percentage discountValue must be <= 100
- targeted coupons require targetRole and at least one targetNames entry

## 2.7 rate_lists

Path: rate_lists/{entryId}

Primary writer:

- frontend/lib/services/rateListService.ts#upsertRateEntry

Current practical shape:

- distributorId: string
- productId: string
- productName: string
- price: number
- unit: string
- effectiveDate: Timestamp (set on create)
- updatedAt: Timestamp (set on update path only)

## 2.8 firms

Path: firms/{gstNumber}  (document ID = GSTIN, e.g. "22AAAAA0000A1Z5")

Primary writers:

- frontend/lib/services/firmService.ts#createOrUpdateFirm — called on every Log Visit save when hasGst is true
- frontend/lib/services/firmService.ts#saveFirmGstData — called after AppyFlow GST API verification to merge verified data

Read sources:

- frontend/lib/services/firmService.ts#getFirmByGst — used by FirmLookup and GstDistributorLookup to autofill name + address
- frontend/lib/services/firmService.ts#getBranchByGstAndAddress — branch duplicate check in FirmLookup
- frontend/lib/services/firmService.ts#getAutoFillPriorities — auto-populates priority lists from visit history

Current practical shape:

Core fields (written by createOrUpdateFirm):

- gstNumber: string — mirrors the document ID
- currentName: string — most recent firm/trade name from a visit save
- currentAddress: string — most recent address
- currentLocation: { lat: number, lng: number } — most recent device location at time of visit
- defaultPriorities: { monthly: PriorityItem[], annually: PriorityItem[] } — latest priority set for autofill
- history: Array of FirmHistoryEntry:
  - firmName: string
  - address: string
  - location: { lat: number, lng: number }
  - priorities: { monthly: PriorityItem[], annually: PriorityItem[] }
  - updatedAt: Date (client-side new Date(), not serverTimestamp)
- createdAt: Timestamp
- updatedAt: Timestamp

GST verification fields (written by saveFirmGstData via merge, all optional):

- legalName: string — from AppyFlow API response
- tradeName: string — trade name if different from legal name
- gstStatus: string — e.g. "Active"
- registrationDate: string
- constitution: string
- registeredAddress: string
- state: string
- pincode: string
- gstVerifiedAt: Timestamp

Note on duplicate history entries:

- createOrUpdateFirm deduplicates by firmName + address + location (within 0.001 degree tolerance) before appending. Identical branches on the same visit do not create a second history entry.

## 3) Callable Cloud Function Contracts

Exports from firebase/functions/src/index.ts:

- createUserByAdminCallable
- deleteUser
- approveDistributorCallable

## 3.1 createUserByAdminCallable

Request payload:

{
"email": "string",
"password": "string",
"name": "string",
"role": "string",
"phone": "string (optional)"
}

Behavior:

- Requires authenticated caller with users/{callerUid}.role == "admin"
- Creates Firebase Auth user
- Creates users/{newUid} with status="approved"
- If role == "distributor", also creates distributors/{newUid} with status="approved"
- After function returns, frontend patches additional fields (gstNumber, address, serviceArea, productCategories) via updateDistributor

Response:

{
"success": true,
"uid": "newAuthUid"
}

## 3.2 approveDistributorCallable

Request payload:

{
"distributorId": "string"
}

Behavior:

- Requires authenticated admin caller
- Reads existing distributors/{distributorId}
- Requires distributor email
- Creates Firebase Auth user for distributor email
- Writes users/{authUid} and distributors/{authUid} as approved
- Deletes old distributors/{distributorId} when distributorId != authUid

Response:

{
"success": true,
"uid": "newAuthUid",
"email": "distributorEmail"
}

## 3.3 deleteUser

Request payload:

{
"uid": "string"
}

Behavior:

- Requires authenticated admin caller
- Deletes Firebase Auth user
- Deletes users/{uid}
- Deletes distributors/{uid} if target user role was distributor

Response:

{
"success": true
}

## 3.4 Frontend Callable Wrappers vs Backend Exports

In frontend/lib/api/admin.ts:

- createUserByAdmin -> calls createUserByAdminCallable (implemented)
- approveDistributorByAdmin -> calls approveDistributorCallable (implemented)
- deleteUser -> calls deleteUser (implemented)
- approveUser -> calls approveUser (NOT implemented in backend)
- rejectUser -> calls rejectUser (NOT implemented in backend)

Current impact:

- Supervisor/salesperson approval flows in hooks use direct Firestore updates (service layer), not callable functions.
- Calling approveUser or rejectUser callable wrappers will fail until backend functions are added.

## 4) Security Rules Alignment (firebase/firestore.rules)

Rules currently cover:

- users, distributors, orders, visits, products, coupons, rate_lists
- role + approved state checks via helpers (isApproved, hasRole, isStaff)

Notable constraints:

- users update/delete: admin only
- distributors create: salesperson, or distributor self-create by uid
- orders create: salesperson or distributor (self)
- orders update: admin/supervisor only
- coupons write: admin only
- rate_lists write: admin only

Not yet covered by rules:

- firms collection has no explicit rules entry; inherits default deny in production.

## 5) Current Drift and Risks

1. Stale callable wrappers:
   - approveUser and rejectUser wrappers exist but backend exports do not.

2. Status handling drift:
   - orders status is effectively free-form string in type/service, while some UI assumes a narrow subset.

3. Direct Firestore access outside services:
   - auth login/signup and useAuth/useCoupons still access collections directly.

4. Optional user fields not consistently written:
   - supervisorId exists in User type but has no active writer path.

5. firms collection not covered by Firestore security rules:
   - createOrUpdateFirm and saveFirmGstData write directly from the client. Rules must be added before production to restrict writes to authenticated staff only.

6. history.updatedAt written as client-side new Date():
   - firmService.ts#createOrUpdateFirm writes history entries with new Date() instead of serverTimestamp(). This can cause drift if client clocks are skewed.

7. Distributor conflict check is frontend-only:
   - checkAreaCategoryConflict runs in the browser before submission. There is no Firestore rule or cloud function enforcing the uniqueness constraint server-side. A race condition between two concurrent admin sessions could bypass it.

## 6) Change Checklist

When changing schema/contracts:

1. Update this file first.
2. Update related types in frontend/types.
3. Update service mappers/defaults in frontend/lib/services.
4. Update any direct writers (signup page, useCoupons, etc.) to match.
5. Update callable payload types and backend handlers together.
6. Update firestore.rules for access model changes.
7. Validate affected UI hooks/pages for status/date coercion assumptions.
