---
name: Feature / Task ticket
about: A unit of work for a developer (built with Claude Code)
title: "[M0] Migrate to a dedicated Technofluid Firebase project"
labels: ["infra", "M0"]
assignees: []
---

## 📖 Story / Why

The app is currently wired to **`hs-website-21095`** — a Firebase project shared with the Humble Solutions website. `firebase/.firebaserc` deploys rules + Cloud Functions there, and the frontend connects via `NEXT_PUBLIC_FIREBASE_*` env vars that (today) likely point at the same shared project.

We must NOT build Technofluid's data (catalog, orders, users, the soon-to-be-seeded 320-product master) into someone else's website project — it risks collisions and mixes two products' data. `CLAUDE.md` already states a **dedicated Technofluid Firebase project is required** and `hs-website-21095` is a placeholder not to be built on.

This ticket moves the whole backend onto a clean, dedicated project **before** any product data is seeded (so nothing has to be migrated again later). We **start fresh** — the current data is UNAUDITED test data (PRD §4) and is intentionally left behind.

## 🧭 Context

- **Repo layout:** `frontend/` (Next.js app, Firebase web SDK in `frontend/lib/firebase.ts`) and `firebase/` (`firestore.rules` + `functions/` — 5 callable functions: `createUserByAdminCallable`, `deleteUser`, `approveDistributorCallable`, `verifyGST`, `checkTerritoryConflict`).
- **What connects where today:**
  - `firebase/.firebaserc` → `default` + `blaze` both = `hs-website-21095` (CLI deploy target).
  - `frontend/lib/firebase.ts` → reads `NEXT_PUBLIC_FIREBASE_*` from `frontend/.env.local` (gitignored, not in repo).
  - Cloud Functions region is `us-central1` (`getFunctions(app, "us-central1")` + `onCall({ region: "us-central1" })`). **Keep us-central1 in this ticket — do not change function regions** (Firestore can live in a different region; that's fine).
  - Functions build requires **Node 24** (`firebase/functions/package.json` engines).
- **Provisioning split (decided):** the **manager creates the empty Firebase project, links a billing account (Blaze), and adds the engineer as Owner**. Everything after that is done by the engineer's Claude Code via CLI.
- **Start fresh (decided):** do NOT copy any data from `hs-website-21095`. This ticket bootstraps exactly **one admin account** (manager-provided email) using the Firebase Admin SDK.
- **Leave the shared project untouched** — do not delete or modify anything in `hs-website-21095`.

## 🔑 Access & prerequisites

Obtain BEFORE starting (the manager provides the project-specific values **via secure channel — they are not in this ticket**):

- [ ] **Owner access** to the new Firebase project (manager grants this in the Firebase/GCP console).
- [ ] **`PROJECT_ID`** — the exact project id the manager created (e.g. `technofluid-platform`). *Manager-provided.*
- [ ] **`FIRESTORE_REGION`** — the permanent Firestore location the manager chose (recommended `asia-south1` / Mumbai for India). **This is irreversible — confirm with the manager before running the create command.** *Manager-provided.*
- [ ] **`ADMIN_EMAIL`** — email for the first admin account to bootstrap. *Manager-provided.*
- [ ] **Confirmation that billing (Blaze) is linked** to the project (Functions won't deploy otherwise). Verify with `gcloud billing projects describe <PROJECT_ID>`.
- [ ] Local tooling: **`firebase-tools`** (latest) and **`gcloud` SDK** installed; **Node 24**; authenticated via `firebase login`, `gcloud auth login`, and `gcloud auth application-default login` (the last is needed by the admin-bootstrap script).
- [ ] `gh auth login` for opening the PR.

> No secrets belong in this ticket or in git. The web config written to `frontend/.env.local` stays gitignored; a committed `frontend/.env.local.example` documents the variable names only.

## ✅ Scope / What to build

Execute the migration end-to-end via CLI (run each step, **verify its output before moving on** — Correctness > Speed per `CLAUDE.md`). Substitute the manager-provided values for `<PROJECT_ID>`, `<FIRESTORE_REGION>`, `<ADMIN_EMAIL>`.

- [ ] **0. Preflight.** Confirm tools + auth; select the project:
  - `firebase login` ; `gcloud auth login` ; `gcloud auth application-default login`
  - `gcloud config set project <PROJECT_ID>`
  - `gcloud billing projects describe <PROJECT_ID>`  → confirm `billingEnabled: true`. **Stop and tell the manager if false.**
- [ ] **1. Enable required APIs:**
  - `gcloud services enable firestore.googleapis.com firebasestorage.googleapis.com storage.googleapis.com identitytoolkit.googleapis.com cloudfunctions.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com eventarc.googleapis.com --project <PROJECT_ID>`
- [ ] **2. Create the Firestore database** (⚠️ region is permanent — confirm first):
  - `gcloud firestore databases create --database="(default)" --location=<FIRESTORE_REGION> --type=firestore-native --project <PROJECT_ID>`
  - Verify: `firebase firestore:databases:list --project <PROJECT_ID>` shows `(default)` in `<FIRESTORE_REGION>`.
- [ ] **3. Enable Email/Password auth** (Identity Platform). Primary (CLI):
  - `curl -s -X PATCH "https://identitytoolkit.googleapis.com/admin/v2/projects/<PROJECT_ID>/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired" -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "Content-Type: application/json" -d '{"signIn":{"email":{"enabled":true,"passwordRequired":true}}}'`
  - Fallback if the API errors: enable **Authentication → Sign-in method → Email/Password** in the Firebase console, then continue.
- [ ] **4. Create the default Storage bucket** (used for visit media):
  - `gcloud storage buckets create gs://<PROJECT_ID>.appspot.com --location=<FIRESTORE_REGION> --project <PROJECT_ID>` (fallback: Firebase console → Storage → Get started). Note the resulting bucket name for the env file.
- [ ] **5. Register a Web app and fetch its config:**
  - `firebase apps:create WEB "Technofluid Web" --project <PROJECT_ID>`  → note the returned `APP_ID`
  - `firebase apps:sdkconfig WEB <APP_ID> --project <PROJECT_ID>`  → this prints `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.
- [ ] **6. Point the repo at the new project:**
  - Update `firebase/.firebaserc` so `default` = `<PROJECT_ID>` (replace `hs-website-21095`; remove/repoint the `blaze` alias). `firebase use --add <PROJECT_ID>` then set it as default works too.
- [ ] **7. Write env files:**
  - Write `frontend/.env.local` with the values from step 5 mapped to `NEXT_PUBLIC_FIREBASE_API_KEY`, `..._AUTH_DOMAIN`, `..._PROJECT_ID`, `..._STORAGE_BUCKET`, `..._MESSAGING_SENDER_ID`, `..._APP_ID`. (gitignored — do **not** commit.)
  - Create/commit `frontend/.env.local.example` listing the same variable **names** with empty/placeholder values (no real values). Confirm `.env.local` is in `.gitignore`.
- [ ] **8. Deploy rules + functions to the new project:**
  - `cd firebase && firebase deploy --only firestore:rules,functions --project <PROJECT_ID>`
  - Verify: `firebase functions:list --project <PROJECT_ID>` lists all 5 functions in `us-central1`.
- [ ] **9. Bootstrap the first admin** (Admin SDK, bypasses security rules — the legitimate way to seed the first admin). Create `scripts/bootstrap-admin.mjs` (uses Application Default Credentials; takes the email as an arg; writes the Auth user + `users/{uid}` doc with `role:"admin", status:"approved", isActive:true, deleted:false`, timestamps; then prints a password-reset link for the manager to set their password). Run it: `GOOGLE_CLOUD_PROJECT=<PROJECT_ID> node scripts/bootstrap-admin.mjs <ADMIN_EMAIL>`. Hand the printed reset link to the manager via secure channel.
- [ ] **10. End-to-end verify** (see Acceptance Criteria) and remove any remaining references to `hs-website-21095` from the repo (`grep -rn hs-website-21095 .` should return nothing outside git history).

## 🎯 Acceptance Criteria

- [ ] `firebase/.firebaserc` `default` points to `<PROJECT_ID>`; **no `hs-website-21095` reference remains** anywhere in the repo (`grep -rn hs-website-21095 .` is clean).
- [ ] `firebase firestore:databases:list --project <PROJECT_ID>` shows the `(default)` database in `<FIRESTORE_REGION>`.
- [ ] `firebase functions:list --project <PROJECT_ID>` shows all **5** functions (`createUserByAdminCallable`, `deleteUser`, `approveDistributorCallable`, `verifyGST`, `checkTerritoryConflict`) in `us-central1`.
- [ ] Firestore **rules are deployed** to `<PROJECT_ID>` (the deploy in step 8 succeeded with no errors).
- [ ] Email/Password sign-in is **enabled** on the new project.
- [ ] `frontend/.env.local` contains the new project's web config; `frontend/.env.local.example` is committed with names only; `.env.local` is gitignored and **not** committed.
- [ ] `cd frontend && npm run dev`, log in as `<ADMIN_EMAIL>` (after setting the password via the reset link) → lands on the **admin dashboard**, and a trivial read (e.g. admin distributors list) works against the new, empty project.
- [ ] `cd frontend && npm run build` and `npm run lint` both pass clean.
- [ ] The shared project `hs-website-21095` is **untouched** (no data deleted/modified there).
- [ ] A short post-action summary for the manager: project id, Firestore region, deployed functions, the admin email bootstrapped, and the password-reset link delivery confirmation.

## 🚫 Out of scope

- Copying ANY existing data from `hs-website-21095` (decided: start fresh).
- Changing Cloud Functions regions (stay `us-central1`).
- Firebase **Hosting** setup / the production deploy pipeline (separate later ticket).
- The security-rule hardening for the known findings (C1 privilege escalation, H1 unvalidated orders, etc.) — separate tickets; this ticket deploys the **current** rules as-is.
- The product-master importer and `products`/`public_catalog` schema (Ticket 1).

## 🔗 Dependencies

- **Manager (one-time, before the dev starts):** create the empty Firebase project, **link a billing account (Blaze)**, add the engineer as **Owner**, and send via secure channel: `PROJECT_ID`, `FIRESTORE_REGION` (confirmed permanent), `ADMIN_EMAIL`.
- Blocks **Ticket 1** (product import) and all later data work — they must seed into the dedicated project.

## 📚 References

- `CLAUDE.md` → "Deploy & infra" (dedicated project required; `hs-website-21095` is a placeholder) and the security-model section.
- `docs/PRD.md` §4 (current state is UNAUDITED) and §6 (responsive web).
- `frontend/lib/firebase.ts` (web config shape), `firebase/.firebaserc`, `firebase/functions/src/index.ts` (the 5 functions), `firebase/functions/package.json` (Node 24).

## 🤖 Kickoff prompt (paste into Claude Code)
```
/start-ticket 0
```
