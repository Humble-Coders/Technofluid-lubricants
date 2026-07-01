**Ticket:** #1 — [M0] Migrate to a dedicated Technofluid Firebase project

**Summary:** Provisioned a new, dedicated Firebase project (`techno-fluid`) and moved the whole backend off the shared `hs-website-21095` placeholder. Firestore was created in `asia-south1` (native mode), Email/Password auth was enabled, the default Storage bucket was confirmed, and a Web app was registered. `firestore.rules` and all 5 Cloud Functions were deployed unchanged to the new project in `us-central1`, including `verifyGST` (its `APPYFLOW_API_KEY` secret was copied over from the old project since it's a third-party GST-provider key, not project-specific). A new `scripts/bootstrap-admin.mjs` seeds the first admin account via the Admin SDK, since normal signup can never self-grant `role: admin`. The repo config (`.firebaserc`, `frontend/.env.local.example`, `CLAUDE.md`) now points at the new project; the old project was left untouched.

**Files changed:**
- `firebase/.firebaserc` — repoint CLI deploy target from `hs-website-21095` to `techno-fluid`; dropped the unused `blaze` alias.
- `frontend/.env.local.example` (new) — documents the `NEXT_PUBLIC_FIREBASE_*` variable names (no real values) so future devs know what to fill in `.env.local`.
- `frontend/.gitignore` — added `!.env.local.example` exception so the example file can be committed despite the blanket `.env*` ignore rule.
- `scripts/bootstrap-admin.mjs` (new) — Admin SDK script that creates/finds the Auth user, writes `users/{uid}` with `role: admin, status: approved, isActive: true, deleted: false`, and prints a password-reset link.
- `scripts/package.json`, `scripts/package-lock.json` (new) — standalone `firebase-admin` dependency for the bootstrap script (no root Node project existed).
- `scripts/.gitignore` (new) — ignores `scripts/node_modules/`.
- `CLAUDE.md` — updated "Deploy & infra" to state the dedicated project is now live (`techno-fluid`, region `asia-south1`), removing the stale "shared placeholder, do not build on this" warning.

**Not committed (out of scope, pre-existing):** `README.md`, `firebase/functions/src/users/approveDistributorCallable.ts`, `frontend/lib/api/admin.ts`, `frontend/schema.md` deletion, `DEAD_FILES.md`, `SCHEMA_REVIEW.md`, `schema.md` were already modified/untracked in the working tree before this ticket started. Left untouched and excluded from this branch's commit.

**How to test:**
1. `git checkout ticket-1-dedicated-firebase-project`
2. `firebase firestore:databases:list --project techno-fluid` → shows `(default)` in `asia-south1`.
3. `firebase functions:list --project techno-fluid` → shows all 5 functions (`createUserByAdminCallable`, `deleteUser`, `approveDistributorCallable`, `verifyGST`, `checkTerritoryConflict`) in `us-central1`.
4. Copy `frontend/.env.local.example` → `frontend/.env.local` and fill in the real `techno-fluid` web config (ask the ticket owner for values, or run `firebase apps:sdkconfig WEB <appId> --project techno-fluid`).
5. `cd frontend && npm run build` → clean. `npm run dev` → visit `/login`, sign in as the bootstrapped admin (`admin@test.com`, password already set via the reset link during this session) → lands on `/admin`, distributors list loads (empty, fresh project).
6. `grep -rn hs-website-21095 . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next` → only hits are the gitignored `.claude/settings.local.json` and the historical ticket doc `docs/tickets/0-dedicated-firebase-migration.md` (both expected/out of scope to edit).

**Acceptance criteria:**
- [x] `firebase/.firebaserc` `default` → `techno-fluid`; no `hs-website-21095` reference in tracked repo content.
- [x] `firebase firestore:databases:list` shows `(default)` in `asia-south1`.
- [x] `firebase functions:list` shows all 5 functions in `us-central1`.
- [x] Firestore rules deployed (deploy succeeded with no errors).
- [x] Email/Password sign-in enabled.
- [x] `frontend/.env.local` has the new project's config (local only, gitignored); `frontend/.env.local.example` committed with names only.
- [x] `npm run dev`, log in as `admin@test.com` → lands on admin dashboard, distributors list read works against the new empty project (confirmed live by ticket owner).
- [x] `npm run build` passes clean.
- [ ] `npm run lint` — **not clean**, but the 19 errors/warnings are pre-existing `react-hooks/set-state-in-effect` issues in files this ticket never touched (`useSalespersonOrders.ts`, `useVisits.ts`, etc.); see Deviations.
- [x] `hs-website-21095` untouched (only read access, to fetch the `APPYFLOW_API_KEY` secret value — no writes/deletes).
- [x] Post-action summary for the manager: project id `techno-fluid`, Firestore region `asia-south1`, all 5 functions deployed to `us-central1`, admin bootstrapped as `admin@test.com`, password-reset link delivered directly to the ticket owner in-session (same person as the engineer here).

**Deviations / decisions:**
- **Storage bucket region mismatch:** the default bucket was auto-provisioned by Firebase in `US-EAST1` rather than `asia-south1` before this ticket's Storage step ran. Bucket location is also immutable. Ticket owner chose to leave it as-is rather than delete/recreate, accepting the region mismatch with Firestore (documented in `CLAUDE.md`).
- **Web app duplication:** running `firebase apps:create WEB` created a second Web app registration because one already existed in the project (`frontend/.env` already had matching config prior to this session — likely from a prior partial setup). Removed the duplicate via the Firebase Management API (no CLI delete command exists) and kept the pre-existing app/config, which `.env.local` now mirrors.
- **`APPYFLOW_API_KEY` secret:** copied from `hs-website-21095`'s Secret Manager into `techno-fluid`'s, with the ticket owner's explicit approval, since it's a third-party (AppyFlow GST) API key tied to the provider account, not the Firebase project.
- **No root Node project existed** for `scripts/bootstrap-admin.mjs` to run against, so a minimal `scripts/package.json` + lockfile were added scoped to that directory only.
- **Branch created late:** work was initially done directly against `main`'s working tree (uncommitted) before the ticket branch was created; corrected before commit — only this ticket's files were staged, pre-existing unrelated uncommitted changes were left alone.

**Open questions / follow-ups:**
- `npm run lint` failures are pre-existing and unrelated — worth a separate cleanup ticket for the `react-hooks/set-state-in-effect` violations.
- Storage bucket region (`US-EAST1` vs Firestore's `asia-south1`) could be revisited pre-launch if latency becomes a concern; currently accepted as-is.
- The other uncommitted, unrelated working-tree changes (`README.md`, `approveDistributorCallable.ts`, `admin.ts`, schema doc changes) still need to be committed or discarded by whoever owns them — not part of this ticket.
