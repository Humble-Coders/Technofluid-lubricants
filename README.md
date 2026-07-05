# Technofluid Lubricants Platform

An end-to-end web platform for Technofluid Lubricants' order lifecycle: field-sales visits → distributor onboarding → order placement → manufacturing demand → inventory → dispatch → invoicing. It replaces a manual spreadsheet-and-phone process, plus a public marketing site.

## Tech stack

- **Frontend:** Next.js 16 (App Router, React 19), Tailwind CSS v4, `react-hook-form` + `zod`
- **Backend:** Firebase Auth, Firestore, Cloud Functions (TypeScript, v2 `onCall`, region `us-central1`)
- **Deploy:** Firebase Hosting (frontend) + `firebase deploy` (rules + functions)

## Repository layout

```
frontend/            Next.js app (App Router)
  app/
    (public)/        Public marketing site — landing page, industries, about, contact
    (auth)/          Login / signup
    (dashboard)/     Role-based app shell (admin, salesperson, distributor, ...)
  components/        ui/ + layout/ (reusable presentational components)
  content/           Static content data (industries, product categories, company copy)
  lib/
    services/        Firestore/Functions access layer (*Service.ts)
    hooks/           React hooks (useX) wrapping services
    api/admin.ts     Typed callers for Cloud Functions
    validation/      zod schemas
  types/             Shared TS types (order, distributor, user, product, visit...)
  AGENTS.md          Frontend coding rules

firebase/
  firestore.rules    Security rules (server-side backstop)
  functions/src/     Cloud Functions source

docs/                Product spec, ticket process, catalogue & industries content
handoffs/            Ticket handoff reports
scripts/             Catalogue/content build scripts
Product master resources/   Source catalog data
```

## Getting started

Requirements: Node.js 20+, a Firebase project with Auth/Firestore/Functions enabled.

```bash
cd frontend
npm install
```

Create `frontend/.env.local` with your Firebase web config:

```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

Run the dev server:

```bash
npm run dev
```

### Cloud Functions

```bash
cd firebase/functions
npm install
npm run build
```

## Scripts

| Command (from `frontend/`) | Description |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |

## Deployment

- **Frontend:** Firebase Hosting
- **Rules + Functions:** `firebase deploy` (from `firebase/`)

Any developer may deploy — be deliberate, as deploys hit the live Firebase project.

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — architecture, data model, and security rules (read first)
- [`frontend/AGENTS.md`](./frontend/AGENTS.md) — frontend coding conventions
- [`docs/PRD.md`](./docs/PRD.md) — product spec and build sequence
- [`docs/PROCESS.md`](./docs/PROCESS.md) — ticket workflow
