# Humble Solutions Schema Reference

This document is the maintained schema contract for Firestore collections, callable function payloads, and frontend domain types.

Use this file as the source of truth when adding fields, writing rules, or implementing backend/frontend changes.

## 1) Canonical Enums and Constants

Defined in frontend/lib/constants.ts:

- USER_ROLES
  - admin
  - supervisor
  - salesperson
  - distributor

- USER_STATUS
  - pending
  - approved
  - rejected

- COLLECTIONS
  - users
  - distributors
  - orders

Additional UI enum values in admin mockData/coupon types:

- OrderStatus (UI)
  - pending
  - processing
  - approved

- CouponType
  - global
  - targeted

- CouponStatus
  - active
  - inactive

## 2) Firestore Collection Schemas

## 2.1 users collection

Path:

- users/{uid}

Current write sources:

- signup page (frontend auth flow)
- userService.createUserInFirestore
- cloud function createUserByAdmin

Required fields (current practical contract):

- email: string
- name: string
- role: one of USER_ROLES
- status: one of USER_STATUS (typically pending or approved)
- isActive: boolean

Operational/audit fields:

- phone: string
- distributorCount: number
- ordersCount: number
- createdBy: string | null
- approvedBy: string | null
- approvedAt: timestamp | null
- lastLoginAt: timestamp | null
- createdAt: timestamp
- updatedAt: timestamp

Example document:

{
"email": "person@company.com",
"name": "Jane Doe",
"phone": "+12025550123",
"role": "salesperson",
"status": "pending",
"isActive": true,
"distributorCount": 0,
"ordersCount": 0,
"createdBy": "adminUidOrSelfUid",
"approvedBy": null,
"approvedAt": null,
"lastLoginAt": null,
"createdAt": "serverTimestamp()",
"updatedAt": "serverTimestamp()"
}

## 2.2 distributors collection

Path:

- distributors/{uid}

Current write sources:

- signup page for distributor role
- distributorService.createDistributorInFirestore
- cloud function createUserByAdmin when role is distributor

Required fields (current practical contract):

- name: string
- status: one of USER_STATUS (pending/approved in current UI)
- isActive: boolean
- createdBy: string
- contactInfo: string

Optional fields:

- email: string
- phone: string
- address: string
- approvedBy: string | null
- approvedAt: timestamp | null
- lastLoginAt: timestamp | null
- createdAt: timestamp
- updatedAt: timestamp

Example document:

{
"name": "Metro Oils Supply",
"email": "ops@metro.com",
"phone": "+12025550182",
"status": "pending",
"isActive": true,
"createdBy": "adminUid",
"approvedBy": null,
"approvedAt": null,
"lastLoginAt": null,
"contactInfo": "+12025550182",
"createdAt": "serverTimestamp()",
"updatedAt": "serverTimestamp()"
}

## 2.3 orders collection

Path:

- orders/{orderId}

Current read source:

- orderService and useOrders

Current UI-expected fields:

- distributorName: string
- itemsSummary: string
- totalQty: number
- totalAmount: number
- status: string (expected values pending, processing, approved)
- createdAt: timestamp | string

Example document:

{
"distributorName": "Prime Lubes Co.",
"itemsSummary": "Hydraulic Fluid x 70",
"totalQty": 70,
"totalAmount": 8400,
"status": "processing",
"createdAt": "serverTimestamp()"
}

## 2.4 coupons collection

Path:

- coupons/{couponId}

Current read source:

- useCoupons

Current create behavior:

- UI creates local state entry only; no persistent Firestore write yet in current flow

Expected fields from UI model:

- code: string
- type: global | targeted
- targetRole?: salesperson | distributor
- targetNames?: string[]
- discount: string
- status: active | inactive
- validTill: string (YYYY-MM-DD)

Example document:

{
"code": "SPRING10",
"type": "global",
"discount": "10%",
"status": "active",
"validTill": "2026-04-15"
}

## 3) Cloud Function Schemas

Backend implemented callable:

- createUserByAdmin
  - file: firebase/functions/src/index.ts

Request payload:

{
"email": "string",
"password": "string",
"name": "string",
"role": "string"
}

Response payload:

{
"success": true
}

Error model:

- unauthenticated if caller has no auth context
- internal for backend failures

Frontend callable wrappers (declared in frontend/lib/api/admin.ts):

- createUserByAdmin(payload)
- approveUser(payload)
- rejectUser(payload)

Important:

- approveUser and rejectUser wrappers exist on frontend.
- Matching backend callable implementations are currently not present in firebase/functions/src/index.ts.

## 4) Frontend Type Contracts

## 4.1 User type (types/user.ts)

User:

- uid: string
- email: string
- name: string
- phone?: string
- role: UserRole
- status: UserStatus
- isActive: boolean
- distributorCount?: number
- ordersCount?: number
- createdBy?: string | null
- approvedBy?: string | null
- approvedAt?: timestamp/date/string/null
- lastLoginAt?: timestamp/date/string/null
- createdAt?: timestamp/date/string/null
- updatedAt?: timestamp/date/string/null

CreateUserInput:

- email: string
- name: string
- phone?: string
- role: UserRole
- createdBy?: string

## 4.2 Distributor type (types/distributor.ts)

Distributor:

- uid: string
- name: string
- email?: string
- phone?: string
- address?: string
- status: DistributorStatus
- isActive: boolean
- createdBy: string
- approvedBy?: string | null
- approvedAt?: timestamp/date/string/null
- lastLoginAt?: timestamp/date/string/null
- contactInfo: string
- createdAt?: timestamp/date/string/null
- updatedAt?: timestamp/date/string/null

CreateDistributorInput:

- name: string
- email: string
- phone: string
- createdBy: string

## 4.3 Order type (types/order.ts)

Order:

- id: string
- distributorName: string
- itemsSummary: string
- totalQty: number
- totalAmount: number
- status: OrderStatus
- createdAt?: timestamp/date/string/null

## 5) Validation Schemas

Coupon create schema is defined in app/(dashboard)/admin/coupons/\_lib/couponSchemas.ts using Zod.

Discriminated union by type:

- global coupon
  - code required, max 40
  - discount required
  - validTill required and must match YYYY-MM-DD

- targeted coupon
  - all global fields
  - targetRole required and limited to salesperson/distributor
  - targetNames required and must contain at least one non-empty value

## 6) Schema Compatibility Rules

When adding or changing fields:

1. Update this schema.md first.
2. Update constants/types if enum or domain structure changed.
3. Update service mappers to preserve backward compatibility defaults.
4. Update hooks mapping logic if table row shape depends on new fields.
5. Update cloud function payload types and frontend API wrappers together.
6. Update Firestore security rules accordingly.

## 7) Current Gaps to Track

1. Frontend includes callable wrappers for approve/reject but backend functions are missing.
2. Coupons creation is not yet persisted to Firestore.
3. Auth page flows still do direct Firestore writes/reads outside service layer.
4. useAuth currently returns loosely typed userData.

## 8) Suggested Next Schema Version Work

Schema version proposal: v1.1

- Add explicit role and status literal unions in backend function request validation.
- Add users.status transitions policy:
  - pending -> approved | rejected
  - rejected -> pending (optional reopen flow)
- Add orders.status transition matrix.
- Add coupon persistence schema and timestamps.
