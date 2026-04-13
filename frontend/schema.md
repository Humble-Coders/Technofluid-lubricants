# Technofluid Lubricants Schema Reference (Current)

Last verified: 2026-04-13

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

Additional domain enums/types:

- Order status (frontend type): pending | processing | approved | rejected | cancelled | delivered | string
- Coupon type: global | targeted
- Coupon status: active | inactive
- Coupon discount type: percentage | flat
- Visit lead type: hot | warm | cold

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

- frontend/app/(auth)/signup/page.tsx (for distributor signup)
- frontend/lib/services/distributorService.ts#createDistributorInFirestore (salesperson-created placeholder)
- firebase/functions/src/users/createUserCallable.ts (admin-created, auth-backed)
- firebase/functions/src/users/approveDistributorCallable.ts (migrates placeholder to auth uid)

Current practical shape:

- name: string
- email: string
- phone: string
- address: string (optional in read models, not written by active writers)
- status: "pending" | "approved" | "rejected"
- isActive: boolean
- createdBy: string | null
- approvedBy: string | null
- approvedAt: Timestamp | null
- lastLoginAt: Timestamp | null
- contactInfo: string
- authCreated: boolean (false for salesperson-created placeholder docs; true/absent for admin/auth-backed docs)
- createdAt: Timestamp
- updatedAt: Timestamp

Important lifecycle:

- Salesperson-created distributor records start with authCreated: false and doc id != auth uid.
- approveDistributorCallable creates Firebase Auth user, writes users/{authUid} and distributors/{authUid}, then deletes old placeholder distributor doc if ids differ.

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

Primary writer:

- frontend/lib/services/logVisitService.ts#createLogVisit

Shape:

- salespersonId: string
- salespersonName: string
- firmName: string
- status: "draft" | "submitted"
- location: { lat: number, lng: number } | null
- media: Array of:
  - url: string
  - storagePath: string (mandatory, used for Storage deletion)
  - type: "image" | "video"
  - createdAt: string (ISO 8601)
- priorities:
  - monthly: Array of { productId, productName, quantity } (min 5 on submit)
  - annually: Array of { productId, productName, quantity } (min 5 on submit)
- relatedFirms: Array of:
  - name: string
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
- Draft saves bypass priority/firm validation (firmName still required)

## 2.5 products

Path: products/{productId}

Current frontend read model (active products query):

- name: string
- description?: string
- basePrice: number
- unit: string
- category?: string
- isActive: boolean
- createdAt?: Timestamp | Date | string | null
- updatedAt?: Timestamp | Date | string | null

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

## 5) Current Drift and Risks

1. Stale callable wrappers:
   - approveUser and rejectUser wrappers exist but backend exports do not.
2. Status handling drift:
   - orders status is effectively free-form string in type/service, while some UI assumes a narrow subset.
3. Direct Firestore access outside services:
   - auth login/signup and useAuth/useCoupons still access collections directly.
4. Optional user fields not consistently written:
   - supervisorId exists in User type but has no active writer path.

## 6) Change Checklist

When changing schema/contracts:

1. Update this file first.
2. Update related types in frontend/types.
3. Update service mappers/defaults in frontend/lib/services.
4. Update any direct writers (signup page, useCoupons, etc.) to match.
5. Update callable payload types and backend handlers together.
6. Update firestore.rules for access model changes.
7. Validate affected UI hooks/pages for status/date coercion assumptions.
