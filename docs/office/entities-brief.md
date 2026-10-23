# Technofluid Office — Customers & Suppliers ("entities") build brief

> From Ansh Technofluid (governing session), 24 Oct 2026. Built on `feat/office-entities`.
> Cloud Function list (§4) approved by Sharnya on 24 Oct 2026. Agreed deviations are at the end.

Base branch: `feat/office-foundation` (adddd2e or later).

## 0. What we are building
Every person or company Technofluid deals with money-wise (a distributor, a walk-in buyer, a raw-material supplier, or a firm that is both) becomes one **entity** in Firestore (`entities/{entityId}`). Each entity is mirrored as exactly ONE Humble Ledger (HL) customer.
- HL holds the money truth: balance, statement, opening balance.
- Firestore holds the profile: name, GSTIN, address/state, price list, credit limit.
- The app NEVER stores a balance; it asks HL.

This phase delivers the list, create/edit/archive, the HL sync, balances and the on-screen statement. Sales, payments and purchases come next and will all post against these entities. This is the design Aromex runs in production; §9 lists the Aromex bugs not to repeat.

## 1. Decisions already made
1. **One HL customer per entity.** Buying and selling net into one balance: positive = they owe us (receivable), negative = we owe them (payable).
   - Suppliers are NOT HL vendors. Later purchases use `POST /customer-purchases` (it supports taxLines for CGST/SGST/IGST input). Paying them uses `POST /customer-payouts`.
   - Why: HL vendors have no opening balance and no taxLines, and Aromex has proved the netting model.
   - PRD #22 ("purchase with supplier") is satisfied this way.
2. **Every write goes through Cloud Functions.** Clients may read entities (Admin + Accounts only) and never write.
3. **HL is called only from Cloud Functions, reads included.** The desktop gets balances and statements through callables and never holds an HL token.
4. **Roles:**
   - Admin and Accounts manage entities.
   - Stock & Production (supervisor) never sees entities, balances or money: no nav item, route guard shows NoAccess, rules deny.
   - Salesperson/distributor: no access.
5. **Role checks** via requireRole (doc-based, decision #25). No custom claims.
6. **Money** is integer paise in Firestore and in every core/function type. HL speaks decimal rupees, so convert only at the HL boundary:
   - Sending: paise → rupees in one function.
   - Reading: HL decimal STRINGS → paise without floats.
7. **Reuse the website's distributors; don't duplicate them.** An entity can link to an approved distributor (`distributorId`). The entity is the accounting record; there is no live two-way sync with the distributor doc (§6).
8. **Fake HL first.** Until Technofluid's HL company exists, build against a fake HL (§4). Switching to live must be a config change, not a code change.

## 2. Data model — `entities/{entityId}`
Id: Firestore auto-id. It never changes and is sent to HL as `externalId`. Walk-in uses the fixed id `walk-in-customer` (one constant in core).

Fields:
- `name` (trimmed, required), `nameLower`.
- `kinds`: `("customer"|"supplier")[]`, non-empty. Labels only: they sort pickers and never block anything.
- `phones`: 0–3, normalised `+91XXXXXXXXXX`. `phones[0]` is the one sent to HL.
- `email`: string or null. Blank → null, and OMITTED from HL payloads.
- `gstin`: normalised; must pass core `checkGstin`.
- `gstVerified`: `{legalName, tradeName, status, verifiedAt}` or null.
- `address`: `{line1, line2, city, district, pincode, stateCode}`.
  - `stateCode` is REQUIRED (GST place of supply).
  - If `gstin` is set, `stateCode` must equal its first 2 digits (server-enforced).
- `priceTier`: `"Dealer"|"Distributor"|null`.
  - New customers default "Dealer".
  - Imported distributors start null; Sales will refuse to bill until it is set.
- `creditLimitPaise`: int or null. A warning only, never blocks.
- `notes`.
- `distributorId`: approved distributors only, at most one entity per distributor.
- `isWalkIn`, `isActive`, `deleted:false` (always written on create; never hard-delete).
- `opening`: `{amountPaise, direction, asOf, posted, hlTxnId}` or null.
  - CREATE-ONLY.
  - `posted` and `hlTxnId` are set by the sync function.
- `syncStatus`: `PENDING|SYNCED|FAILED`.
- Function-owned: `hlCustomerId`, `hlAccountId`, `hlSyncedAt`, `hlSyncError`, `syncAttempts`.
- `createdBy`/`updatedBy` `{uid,name}`; `createdAt`/`updatedAt`.

Other documents:
- `entities/{id}/history/{auto}`: `{at, by, action: create|edit|archive|unarchive|link|unlink, changes:{field:{from,to}}}`.
- `entityRequests/{requestId}`: server-only idempotency.

## 3. Shared core — `office/core/src/entity.ts`
- Types.
- The input rules.
- `normalizePhone`, `stateCodeFromGstin`, and the GSTIN/state agreement check.
- `balanceDirection`.
- `hlAmountToPaise(decimalString)`: string-only, rejects more than 2 decimals.
- `hlProfileChanged`: true only when name, `phones[0]`, email or GSTIN changed.
- `sourceId` builders: `entity_<id>:opening`, `sale_<id>:<leg>`, `payment_<id>`, `purchase_<id>:<leg>`, `payout_<id>`. The prefix before ":" groups statement rows.

## 4. Cloud Functions (approved by Sharnya, 24 Oct 2026)
All callables: `us-central1` and `requireRole(["admin","accounts"])` unless noted; writes take a `requestId` and are idempotent on it.

- **saveEntity**: create or edit.
  - Edit refuses opening, distributorId and isWalkIn; writes a history diff; goes back to PENDING when the HL profile changed or the doc was FAILED.
  - Duplicate GSTIN among active entities → error, unless `allowSameGstin` (Admin only).
  - Same phone → a warning only.
  - Walk-in: only notes can change.
- **setEntityActive**: archive/unarchive with a reason.
  - Archive asks HL for the balance and refuses unless it is zero ("Settle ₹X first").
  - Also archives/unarchives in HL.
  - Walk-in refused.
- **linkEntityToDistributor** (Admin): approved, active, not-deleted distributors only; one entity per distributor (checked in the transaction).
- **importDistributorEntities** (Admin, `{dryRun}`): one customer per approved, active distributor without one.
  - Copies name, phone, email and GSTIN; the free-text address goes to line1; the state comes from the GSTIN or is flagged; priceTier is null.
  - Returns a summary the PM can read. Safe to re-run.
- **ensureSystemEntities** (Admin): creates the walk-in.
- **retryEntitySync**: FAILED → PENDING.
- **getEntityBalances**: pages HL `GET /customers` → `{[entityId]: {balancePaise, direction}}`, reading `balance ?? outstanding`.
- **getEntityStatement**: HL `GET /ledger`. Rows in paise; HL's running balance as given; an opening line for "from"; rows grouped by sourceId prefix.
- **onEntityWritten** (`asia-south1`, retry): runs syncEntity when PENDING, or when SYNCED with a changed HL profile. Anything else is a no-op (the loop guard).
- **syncEntity**:
  1. Create, or update after an idempotent create.
  2. Post the opening balance once (`date: opening.asOf`, `sourceId entity_<id>:opening`).
  3. One merge write.
  - Transient error → FAILED and rethrow. Permanent error → FAILED, no rethrow.
- **reconcileEntitySync**: every 10 min; picks PENDING/FAILED entities whose last edit is more than 3 min old; backs off; stops after about 10 attempts.
- **Self-heal**: a 404 on a stored hlCustomerId → re-create and retry once.

HL plumbing (`firebase/functions/src/ledger/`):
- `hlClient.ts`: one interface.
- `httpHlClient.ts`:
  - Gateway token: `POST <GATEWAY_BASE_URL>/internal/hl-token`, header `X-Admin-Token`, body `{projectId}`. Secret `GATEWAY_ADMIN_TOKEN`.
  - 30 s timeout; one retry; refresh the token on 401.
  - Every post carries `appId "technofluid-office"`, a `sourceId` and an `actorRef`.
  - Pages ≤ 100.
- `fakeHlClient.ts`:
  - Idempotent on externalId and on (appId, sourceId).
  - 404s; archive refuses a non-zero balance.
  - A real ledger.
  - Test hook `_fakeHl/control {failNext:n}`.
- `HL_MODE = fake|live`. A demo- project never calls live HL.

## 5. Firestore rules
`entities` and their `history`: read by Admin + Accounts, no client writes. `entityRequests` and `_fakeHl/**`: no client access.

## 6. Distributors — the trap
approveDistributorCallable re-creates a distributor under a new doc id on approval. So:
- Link only APPROVED distributors.
- The entity's own id is what HL knows. It never depends on the distributor id.
- If a linked distributor is deleted on the website, the entity stays. The books must survive.
- Do NOT edit approveDistributorCallable or any website functions.

## 7. Desktop app
- Layers: services → hooks → screens.
- Route `/customers`; nav label "Customers & suppliers". Supervisor gets no nav item and NoAccess.
- List:
  - Search over name, phone and GSTIN.
  - Chips: All / Customers / Suppliers / Archived. Sort by name or balance.
  - Stat cards "They owe us" and "We owe them", which double as filters.
  - Each row: name, kinds, city · state, balance (green / red / grey).
  - A sync badge when not synced, with Retry.
- Detail:
  - Balance, details, distributor, price list (warning if not set), credit limit, read-only opening.
  - Edit, Archive, History.
  - Statement with a date range.
- Form:
  - Name, kinds, phones, email, GSTIN + "Fill from GST", address + state, price list, credit limit (₹ → paise), notes.
  - Create-only opening balance ("can't be changed later").
  - Inline duplicate-phone warning.
- HL down: the list still loads; balances show "—" with a "Books unreachable" banner and a working Retry.
- Admin only: "Import website distributors" (dry run first) and "Link distributor".
- All amounts via formatINR.

## 8. Tests and seed
Core vitest + emulator tests as listed in the brief; seed `npm run seed:entities` (walk-in + samples).

## 9. Lessons from Aromex (do not repeat)
1. Edits to FAILED parties never re-synced → re-flag PENDING; show the status with Retry.
2. The opening balance was booked on the sync day → always send `asOf`.
3. Archive was Firebase-only → archive in HL too, at zero balance only.
4. One HL error blanked the screen → keep the list; make Retry work.
5. Two walk-in ids → one constant.
6. A "still waiting" rewrite caused a hot trigger loop → never rewrite a doc just to say it's waiting.
7. Blank email sent as "", limit > 100, missing balance field → omit blanks, keep pages ≤ 100, read `balance ?? outstanding`.
8. A shared admin token → use one scoped to Technofluid.

## 9b. Rules for every HL post
1. Deterministic sourceIds.
2. Persist HL's txn id.
3. An explicit business date on every leg.
4. Resolve everything before posting.
5. A failed read is an error, never ₹0.
6. Never show a raw transport error.
7. Accounts are list → create → re-list (not needed this phase).
8. Running balances come only from HL.
9. One paise→number conversion.

## 10. Not in this phase
Sales, payments, purchases, money in/out, corrections, statement PDF, aging, anything on the website.

## 11. Handover
PR into `feat/office-foundation`. No merge and no deploy by this session; Ansh's session reviews and Ansh decides.

---

## Agreed deviations (Ansh, 24 Oct 2026)
- **(a) No zod; shared cases instead.** The rules are plain TypeScript in `office/core/src/entity.ts`, mirrored in `firebase/functions/src/entities/entityModel.ts`, because the core package isn't built for the functions.
  - Both run ONE table, `office/core/src/entity.cases.json`: vitest against core, and the emulator tests against the functions' copy (pure functions and the real `saveEntity`). A change to one copy without the other fails a test.
- **(b) Distributor fields.** Distributors use `gstNumber` and a free-text `address`, so the import maps them.
  - The summary lists which entities got their state from the GSTIN (`stateFromGstin`) and which need one (`stateNeeded`).
- **(c) Reconcile in tests.** The emulators run no scheduler, so `reconcileOnce(db, hl)` is exported and the test calls it directly. No extra callable.
- **(d) Fake on demo projects.** `HL_MODE` defaults to fake, and a `demo-` project always gets the fake client. Tested.
- **(e) Fill from GST.** It uses the existing website `verifyGST` unchanged; in the emulator it usually says "disabled", and details are typed by hand. Its sign-in-only check is existing debt.
