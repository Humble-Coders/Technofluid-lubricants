# LubeFlow Workflow Guide

This document explains the current frontend and backend execution flows in detail, including route flows, auth flow, service layer flow, hook behavior, UI responsibilities, and a complete source file responsibility map.

## 1) System Overview

LubeFlow currently uses:

- Next.js App Router frontend
- Firebase Auth for identity
- Firestore for application user role/status metadata and business entities
- Firebase Cloud Functions (TypeScript) for privileged admin user creation

Core architecture rule (current target state):

- Components: UI only
- Hooks: state + lifecycle + view mapping
- Services: Firebase data access and mutations
- API wrappers: callable cloud functions
- Types: shared domain contracts

## 2) Runtime Layers and Responsibility

### Presentation Layer (UI)

- Route pages in app directory
- Reusable UI primitives and layout components
- Form controls and display tables

### State Layer (Hooks)

- Handles loading state, error state, client subscriptions
- Converts service-level domain entities into table/view rows

### Data Layer (Services)

- Reads/writes Firestore
- Performs collection/query/update operations
- Encapsulates mapping between Firestore documents and domain types

### Integration Layer (API)

- Wraps Firebase callable functions
- Provides typed payload and response contracts

### Types + Constants Layer

- Defines roles, statuses, collection names
- Defines strict domain types used by hooks/services/API

## 3) End-to-End Flows

## 3.1 App Boot + Layout Flow

1. Next.js starts with app root layout.
2. Route group (auth or dashboard/admin) determines which layout is active.
3. If route is under admin, admin layout invokes auth guard logic.

Files involved:

- app/layout.tsx
- app/(auth)/layout.tsx
- app/(dashboard)/admin/layout.tsx
- components/layout/AdminShell.tsx
- components/layout/Sidebar.tsx
- components/layout/Topbar.tsx

## 3.2 Login Flow

1. User submits credentials in login page.
2. Firebase Auth signInWithEmailAndPassword authenticates identity.
3. Firestore users/{uid} document is fetched.
4. Access checks:
   - isActive must be true
   - status must be approved
5. Role-based redirect:
   - admin -> /admin
   - other role -> /dashboard

Files involved:

- app/(auth)/login/page.tsx
- lib/firebase.ts

Current note:

- Login page still performs direct Firestore read in page-level logic.
- This can be moved into authService for full layering consistency.

## 3.3 Signup Flow

1. User submits name/email/password/role (salesperson or distributor).
2. Firebase Auth account is created.
3. Firestore users/{uid} is created with pending status.
4. If role is distributor, distributors/{uid} is created as well.
5. Route currently pushes to /admin.

Files involved:

- app/(auth)/signup/page.tsx
- lib/firebase.ts

Current note:

- Signup page still writes Firestore directly.
- This can be moved to service/API layer for complete architecture alignment.

## 3.4 Admin Route Guard Flow

1. Admin layout calls useAuth.
2. useAuth subscribes to Firebase auth state changes.
3. On authenticated user, Firestore users/{uid} is loaded.
4. Admin layout validates:
   - user exists
   - userData exists
   - isActive true
   - status approved
   - role admin
5. Unauthorized users are redirected.

Files involved:

- app/(dashboard)/admin/layout.tsx
- lib/useAuth.ts
- lib/firebase.ts

## 3.5 Logout Flow

1. User clicks logout from sidebar or topbar.
2. signOut(auth) is called.
3. Router replaces to /login.
4. Admin guard denies further /admin access due missing auth user.

Files involved:

- components/layout/Sidebar.tsx
- components/layout/Topbar.tsx
- lib/firebase.ts

## 3.6 Salesperson Management Flow

Read path:

1. page.tsx uses useSalespersons.
2. useSalespersons subscribes via userService.subscribeUsersByRole(salesperson).
3. userService reads users collection filtered by role.
4. Hook maps User -> SalespersonRow for UI table.

Approve path:

1. Table action triggers handleApprove.
2. Hook calls userService.approveUser(uid).
3. Firestore users/{uid}.status is set to approved.

Create path:

1. Modal collects only UI fields (name/phone/email).
2. page.tsx injects current auth uid as createdBy.
3. Hook calls userService.createUserInFirestore with role salesperson.
4. Firestore users new document created with pending status.

Files involved:

- app/(dashboard)/admin/salespersons/page.tsx
- app/(dashboard)/admin/salespersons/\_components/CreateSalespersonModal.tsx
- app/(dashboard)/admin/salespersons/\_components/SalespersonsTable.tsx
- lib/useSalespersons.ts
- lib/services/userService.ts
- lib/constants.ts

## 3.7 Supervisor Management Flow

Read, approve, and create flow is equivalent to salesperson flow but role = supervisor.

Files involved:

- app/(dashboard)/admin/supervisors/page.tsx
- app/(dashboard)/admin/supervisors/\_components/CreateSupervisorModal.tsx
- lib/useSupervisors.ts
- lib/services/userService.ts

## 3.8 Distributor Management Flow

Read path:

1. page.tsx uses useDistributors.
2. Hook subscribes using distributorService.subscribeDistributors.
3. service reads distributors collection and maps to Distributor type.
4. hook maps Distributor -> DistributorRow for table display.

Approve path:

1. Table action triggers approveDistributor.
2. Hook calls distributorService.approveDistributor(uid).
3. Firestore distributors/{uid}.status is updated to approved.

Create path:

1. UI modal collects name/phone/email only.
2. page.tsx adds createdBy from current auth user.
3. hook calls distributorService.createDistributorInFirestore.
4. Firestore new distributor doc is created with pending status.

Files involved:

- app/(dashboard)/admin/distributors/page.tsx
- app/(dashboard)/admin/distributors/\_components/CreateDistributorModal.tsx
- lib/useDistributors.ts
- lib/services/distributorService.ts

## 3.9 Orders Flow

1. page.tsx uses useOrders.
2. useOrders subscribes through orderService.subscribeOrders.
3. Service reads orders collection and maps to Order.
4. Hook maps to OrderRow and normalizes createdAt for display.
5. page-level filter/search/date-range run in memory.
6. status update handler is currently TODO (not persisted yet).

Files involved:

- app/(dashboard)/admin/orders/page.tsx
- app/(dashboard)/admin/orders/\_components/OrdersFilters.tsx
- app/(dashboard)/admin/orders/\_components/OrdersTable.tsx
- lib/useOrders.ts
- lib/services/orderService.ts

## 3.10 Coupons Flow

1. page.tsx uses useCoupons.
2. Hook subscribes directly to coupons collection.
3. CreateCouponModal validates with Zod discriminated union.
4. On submit, createCoupon currently updates local state only.

Files involved:

- app/(dashboard)/admin/coupons/page.tsx
- app/(dashboard)/admin/coupons/\_components/CreateCouponModal.tsx
- app/(dashboard)/admin/coupons/\_lib/couponSchemas.ts
- lib/useCoupons.ts

Current note:

- useCoupons still performs direct Firestore access in hook.
- For full consistency, move coupons data access into couponService.

## 3.11 Callable Admin API Flow

Frontend callable wrapper flow:

1. Frontend imports functions instance from lib/firebase.
2. lib/api/admin.ts wraps callable endpoints with typed payloads.
3. Caller invokes createUserByAdmin / approveUser / rejectUser.

Backend flow (currently implemented callable):

1. createUserByAdmin verifies caller authentication.
2. Creates Firebase Auth user.
3. Creates users/{uid} with approved status.
4. If role is distributor, creates distributors/{uid}.

Files involved:

- frontend/lib/api/admin.ts
- frontend/lib/firebase.ts
- firebase/functions/src/index.ts

Current note:

- approveUser and rejectUser wrappers exist in frontend API layer.
- Matching callable functions are not yet implemented in backend functions file.

## 4) File-by-File Responsibility Map

This section maps each source file to its role.

## 4.1 Frontend Root Config and Meta Files

- .env: environment variables for Firebase frontend config
- .gitignore: ignored files for frontend package
- AGENTS.md: agent instructions metadata
- CLAUDE.md: project-specific AI instructions metadata
- eslint.config.mjs: linting config
- next-env.d.ts: Next.js type bootstrap
- next.config.ts: Next.js runtime config
- package.json: dependencies and scripts
- postcss.config.mjs: PostCSS/Tailwind config
- README.md: project-level summary docs
- tsconfig.json: TypeScript compiler config

## 4.2 App Router Files

- app/layout.tsx: root HTML/body shell
- app/page.tsx: root landing page
- app/globals.css: global design tokens and base styles
- app/favicon.ico: browser icon

Auth route group:

- app/(auth)/layout.tsx: auth pages wrapper
- app/(auth)/login/page.tsx: login flow
- app/(auth)/signup/page.tsx: signup flow
- app/(auth)/\_components/button.tsx: auth-specific button
- app/(auth)/\_components/input.tsx: auth-specific input
- app/(auth)/\_lib/auth-placeholders.ts: placeholder auth helpers

Admin route group:

- app/(dashboard)/admin/layout.tsx: admin guard + shell mount
- app/(dashboard)/admin/page.tsx: dashboard overview
- app/(dashboard)/admin/\_data/mockData.ts: UI table/seed types and mock values

Coupons module:

- app/(dashboard)/admin/coupons/page.tsx: coupons page logic
- app/(dashboard)/admin/coupons/\_components/CouponsTable.tsx: coupons table UI
- app/(dashboard)/admin/coupons/\_components/CreateCouponModal.tsx: coupon create form and validation binding
- app/(dashboard)/admin/coupons/\_lib/couponSchemas.ts: zod schemas for coupon creation

Distributors module:

- app/(dashboard)/admin/distributors/page.tsx: distributor page orchestration
- app/(dashboard)/admin/distributors/\_components/CreateDistributorModal.tsx: UI-only distributor create form
- app/(dashboard)/admin/distributors/\_components/DistributorsStats.tsx: distributor stats cards
- app/(dashboard)/admin/distributors/\_components/DistributorsTable.tsx: distributor table/actions

Orders module:

- app/(dashboard)/admin/orders/page.tsx: orders filtering + orchestration
- app/(dashboard)/admin/orders/\_components/OrdersFilters.tsx: search/status/date filters
- app/(dashboard)/admin/orders/\_components/OrdersTable.tsx: table and status action selector

Salespersons module:

- app/(dashboard)/admin/salespersons/page.tsx: salesperson page orchestration
- app/(dashboard)/admin/salespersons/\_components/ApproveButton.tsx: approve CTA
- app/(dashboard)/admin/salespersons/\_components/CreateSalespersonModal.tsx: UI-only create form
- app/(dashboard)/admin/salespersons/\_components/SalespersonsStats.tsx: stats cards
- app/(dashboard)/admin/salespersons/\_components/SalespersonsTable.tsx: table and action rendering

Supervisors module:

- app/(dashboard)/admin/supervisors/page.tsx: supervisor page orchestration
- app/(dashboard)/admin/supervisors/\_components/ApproveButton.tsx: approve CTA
- app/(dashboard)/admin/supervisors/\_components/CreateSupervisorModal.tsx: UI-only create form
- app/(dashboard)/admin/supervisors/\_components/SupervisorsStats.tsx: stats cards
- app/(dashboard)/admin/supervisors/\_components/SupervisorsTable.tsx: table and action rendering

## 4.3 Shared Layout Components

- components/layout/AdminShell.tsx: top-level admin layout container
- components/layout/Sidebar.tsx: admin navigation + logout
- components/layout/Topbar.tsx: page title + profile menu + logout

## 4.4 Shared UI Components

- components/ui/badge.tsx: status badge renderer
- components/ui/button.tsx: reusable button primitive
- components/ui/card.tsx: reusable card primitive
- components/ui/input.tsx: reusable input primitive
- components/ui/modal.tsx: dialog/workspace modal primitive
- components/ui/select.tsx: reusable select primitive
- components/ui/table.tsx: table primitives

## 4.5 Lib Files

Core setup:

- lib/firebase.ts: Firebase app/auth/db/functions singletons
- lib/constants.ts: role/status/collection constants
- lib/auth.ts: duplicate firebase initialization file (legacy; currently redundant)

Hooks:

- lib/useAuth.ts: auth + user profile state
- lib/useUsers.ts: fetch users list through userService
- lib/useSalespersons.ts: salesperson state lifecycle through userService
- lib/useSupervisors.ts: supervisor state lifecycle through userService
- lib/useDistributors.ts: distributor state lifecycle through distributorService
- lib/useOrders.ts: order state lifecycle through orderService
- lib/useCoupons.ts: coupons lifecycle (currently direct firestore in hook)

API wrappers:

- lib/api/admin.ts: callable wrappers for admin operations

Services:

- lib/services/userService.ts: users collection access and mutations
- lib/services/distributorService.ts: distributors collection access and mutations
- lib/services/orderService.ts: orders collection access and subscriptions

## 4.6 Domain Types

- types/user.ts: User domain and role/status type contracts
- types/distributor.ts: Distributor domain type contracts
- types/order.ts: Order domain type contracts

## 4.7 Static Assets

- public/file.svg
- public/globe.svg
- public/next.svg
- public/vercel.svg
- public/window.svg

## 4.8 Backend Function File

- firebase/functions/src/index.ts: createUserByAdmin callable cloud function

## 5) Data Flow Patterns (Standardized)

Preferred pattern now used by most admin modules:

Page -> Hook -> Service -> Firestore

- Page handles filters and calls hook actions.
- Hook manages loading/error/subscriptions.
- Service performs Firestore access and normalization.

Callable pattern:

Page or Hook -> lib/api/\* -> Firebase httpsCallable -> Cloud Function -> Firestore/Auth

## 6) Known Gaps and Alignment Notes

1. useAuth still uses any for user and userData.
2. useCoupons still reads Firestore directly in the hook.
3. auth pages (login/signup) still perform direct Firestore operations in page files.
4. lib/auth.ts duplicates firebase bootstrap and should be consolidated into lib/firebase.ts.
5. Frontend callable wrappers for approveUser/rejectUser exist, backend implementations are pending.
6. Orders status update in orders page remains TODO and is not persisted.

## 7) Recommended Next Steps

1. Introduce authService for login/signup/profile reads and remove Firestore access from auth page components.
2. Add couponService and migrate useCoupons to service layer.
3. Implement approveUser and rejectUser in firebase/functions/src/index.ts.
4. Add repository-level schema versioning process in schema.md and migration notes.
5. Replace any usage in useAuth with typed auth/session model.
