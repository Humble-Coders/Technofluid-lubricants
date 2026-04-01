# Humble Solutions Frontend

This README documents what has been built in this frontend so far, how it works today, what was fixed recently, and what still needs to be improved.

## Project Summary

Humble Solutions frontend is a Next.js App Router project for a lubricant operations workflow.

Current implementation is centered on:

- Authentication pages (login/signup)
- Role and status-based access checks for admin area
- Admin dashboard shell and module pages (currently UI-first with mock-driven views)
- Firebase integration for Auth + Firestore

The app is already structured to support multiple user roles:

- `admin`
- `supervisor`
- `salesperson`
- `distributor`

Only `admin` routing is currently wired with detailed page content.

## Stack and Runtime

- Next.js `16.2.1` (App Router)
- React `19.2.4`
- TypeScript
- Tailwind CSS v4
- Firebase JS SDK (Auth + Firestore)
- Zod + React Hook Form available in dependencies

## Folder-Level Architecture

### App Routing

- `app/(auth)/...`
  - Auth routes and layout
  - Login and signup screens

- `app/(dashboard)/admin/...`
  - Protected admin route group
  - Dashboard modules: supervisors, salespersons, distributors, orders, coupons

- `app/(dashboard)/distributer/`, `app/(dashboard)/salesperson/`, `app/(dashboard)/supervisor/`
  - Placeholder or future route groups for role-specific dashboards

### Shared Components

- `components/layout/`
  - `AdminShell.tsx`: shell wrapper (sidebar + topbar + content)
  - `Sidebar.tsx`: admin navigation and logout control
  - `Topbar.tsx`: page title + profile menu + logout control

- `components/ui/`
  - Reusable UI primitives (`button`, `card`, `input`, `table`, `modal`, etc.)

### Data and Integrations

- `lib/firebase.ts`
  - Firebase app initialization
  - Exports `auth` and `db`
  - Uses singleton pattern (`getApps` / `getApp`) to prevent duplicate app init in Next.js

- `lib/useAuth.ts`
  - Auth-state subscription with `onAuthStateChanged`
  - Loads matching Firestore user doc from `users/{uid}`
  - Exposes `{ user, userData, loading }`

- `lib/useCoupons.ts`, `lib/useOrders.ts`, etc.
  - Role/module hooks scaffold for data access and future backend binding

## Implemented Auth and Access Flow

## 1) Signup Flow

File: `app/(auth)/signup/page.tsx`

What happens:

1. User submits `name`, `email`, `password`, and desired role (`salesperson` or `distributor`).
2. Firebase Auth account is created via `createUserWithEmailAndPassword`.
3. Firestore user record is created in `users/{uid}` with operational fields:
   - `role`, `status`, `isActive`
   - counters (`distributorCount`, `ordersCount`)
   - audit metadata (`createdBy`, `approvedBy`, timestamps)
4. If role is distributor, a matching document is also created in `distributors/{uid}`.

Current behavior note:

- Signup currently pushes to `/admin` after account creation.
- Because admin access requires role `admin` + approved status, newly created non-admin users should be blocked by the admin route guard.
- This works as protection, but UX should later redirect new users to a role-appropriate waiting screen.

## 2) Login Flow

File: `app/(auth)/login/page.tsx`

What happens:

1. Firebase sign-in with email/password.
2. Reads `users/{uid}` from Firestore.
3. Validates account is active and approved.
4. Routes by role:
   - `admin` -> `/admin`
   - others -> `/dashboard` (placeholder destination right now)

## 3) Admin Route Guard

File: `app/(dashboard)/admin/layout.tsx`

Client-side guard checks all of these before rendering admin content:

- Firebase user exists
- Firestore profile exists
- `isActive === true`
- `status === "approved"`
- `role === "admin"`

If checks fail, it redirects to `/login` (or `/dashboard` for non-admin role).

While checking, it displays a loading gate (`Checking access...`) so protected UI does not render prematurely.

## What Was Fixed Recently (Important)

Issue observed:

- After clicking Logout, user could still access `/admin`.

Root cause:

- Logout controls in topbar/sidebar were only navigating to `/login`.
- They were not calling Firebase `signOut`, so auth session stayed active.

Fix implemented:

- `components/layout/Topbar.tsx`
  - Replaced logout link behavior with an async handler that calls `signOut(auth)`.
  - Redirect now occurs after successful sign-out using `router.replace("/login")`.
  - Added `isLoggingOut` state to avoid duplicate logout clicks and show `Logging out...` feedback.

- `components/layout/Sidebar.tsx`
  - Replaced logout link behavior with button handler calling `signOut(auth)`.
  - Redirects to `/login` after sign-out.

Result after fix:

- Logout now actually clears Firebase auth state.
- Admin guard no longer sees stale logged-in user after logout.
- Manual navigation to `/admin` after logout should redirect to login.

## Admin UI Work Completed So Far

The admin interface currently has:

- A reusable shell layout with:
  - collapsible sidebar
  - contextual topbar title based on pathname
  - consistent content spacing and page frame

- Navigation routes wired for:
  - dashboard overview
  - supervisors
  - salespersons
  - distributors
  - orders
  - coupons

- Module page/component structure organized for future integration:
  - tables
  - filters
  - stats blocks
  - create modals
  - approval button controls

Many admin pages currently use mock data and scaffolded components, which is expected for this phase.

## Environment Variables Required

Create `.env.local` in `frontend/` and provide:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Without these values, Firebase initialization will fail.

## Run Instructions

From `frontend/`:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verification Checklist (Current)

Use this checklist to validate current behavior:

1. Login with valid admin account -> lands on `/admin`.
2. Login with inactive/pending account -> blocked with error.
3. From admin view, click logout in topbar -> redirected to `/login`.
4. From admin view, click logout in sidebar -> redirected to `/login`.
5. After logout, manually open `/admin` -> should not show admin content.

## Known Gaps / Next Work

These items are not fully complete yet:

- Route protection is currently client-side in admin layout.
  - Next step: add server-side/middleware checks for stronger protection before page render.

- Root route (`app/page.tsx`) is still the default Next.js starter page.
  - Next step: replace with product landing or role-aware entry screen.

- Role-specific dashboards (`/supervisor`, `/salesperson`, `/distributor`) are not fully wired end-to-end.

- Admin modules are UI-first in several sections; backend data integration can be expanded.

## Progress Notes

This repository has progressed from a default Next.js scaffold into a structured, role-aware admin frontend with Firebase-backed auth and Firestore user metadata checks.

Latest completed security-related improvement was fixing logout so it actually invalidates client auth state instead of only changing routes. That closes the immediate issue where `/admin` appeared accessible after logout.
