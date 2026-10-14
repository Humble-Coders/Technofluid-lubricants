# Technofluid — complete handover (decisions, data, progress, plan)

**Written:** 14 Oct 2026 · **Owner:** Ansh (Humble Solutions) · **Client:** Gaurav Verma, Technofluid / Lube Chem Industries, Karnal, Haryana
**Read this first if you are a developer (or a Claude session) joining the Technofluid work.** Then read `CLAUDE.md` (rules), `docs/PRD.md` (product spec — §2 roles, §10 decisions, §11 desktop app).

---

## 0. One-paragraph summary

Technofluid makes and sells lubricants (engine oils, gear oils, hydraulic oils, greases…). We have built and deployed their **public website** (Next.js on Vercel, Firebase project `techno-fluid`). We cleaned their **product master** (a Google Sheet Gaurav keeps editing) into one row per *product × grade × pack* with recipes. We are now building **Technofluid Office** — a **desktop app (Electron) for Windows + Mac** that runs their **stock, sales/billing and accounts**. Money/accounting goes into our own **Humble Ledger** API; invoices will use our **billing engine** (access pending). The **ordering system** for distributors on the website comes **after** the office app is stable. The foundation of the office app is built and on branch `feat/office-foundation`.

---

## 1. The systems, and what each one is for

| System | What it is | Where | Status |
|---|---|---|---|
| **Public website** | Marketing site + price-free product catalogue (48 product series, photos, data-sheet PDFs, industries, contact form) | `frontend/` (Next.js 16, React 19, Tailwind 4). Deploys to **Vercel** automatically from `main` (technofluid-lubricants.vercel.app; target domain technofluidlubricants.in) | **Live** |
| **Firebase project `techno-fluid`** | Login (Firebase Auth), database (Firestore, region asia-south1), Cloud Functions (us-central1) | `firebase/` (rules in `firebase/firestore.rules`, functions in `firebase/functions/src`) | Live; security fix C1 still open (see §9) |
| **Product master (Google Sheet)** | The client's own list of everything they sell + recipes + raw materials | Google Sheet **"Technofluid-Product-Master-GRADES"**, id `1P2F2T0kqQtA_8qwuzpPq7rtRic02jMTP9yaEpBEhPLw`, **owned by gauravverma817@gmail.com** | Cleaned 6 Oct 2026; Gaurav still fills gaps |
| **Humble Ledger** (our accounting engine) | Double-entry books: customers, sales, GST postings, payments, vendors, expenses, P&L, balance sheet | `https://hl.humblesolutions.in` · API spec: `https://hl.humblesolutions.in/docs/json` · Swagger: `/docs` | Exists (used by Aromex). Technofluid company account **not created yet** |
| **Billing engine** (our invoice/PDF engine) | Invoice numbering, GST invoice PDF, void, share | Ansh will give access later | **Pending** |
| **Technofluid Office** (NEW) | Desktop app for office staff: products, stock, production, sales/invoices, customers, payments, expenses, reports | `office/` (Electron + React + shared `core`) | **Foundation built** (§7) |

---

## 2. Where every piece of data lives (source of truth)

> Rule of thumb: **one source of truth per thing.** If you change data somewhere that is not its source, it will be overwritten or will drift.

| Data | Source of truth | Copies / consumers | Notes |
|---|---|---|---|
| **What Technofluid sells** (product, grade, pack, SKU, pack qty, unit, prices, GST, who can buy) | Google Sheet tab **"Product Master (grades)"** | Firestore `products` (doc id = **SKU**), imported by Cloud Function `importProducts`; emulator test copy `office/emulator/seed/products.json` | Importer must be upgraded for the new columns (grade, density, recipe). Once the office app can edit prices, the **app (Firestore) becomes the source** for prices — decision 6 Oct |
| **Recipes** (what each product is made of) | Same sheet, columns F–L ("commodity A–G") as `ingredient/percent` | Shown read-only in the office app | See §3.3 for the format |
| **Raw materials + packaging list** | Sheet tab **Sheet1** | Not imported yet | All **cost** columns are empty |
| **Half-made mixes** (base oil + polymer "VI" premixes) | Sheet tab **Sheet2** | — | e.g. `w150vi10kg` = W150 94.48% + Lubimax 141 5.52% |
| **House base blends** (r5, sn/ci4, g90, g140, gl5, va12.8–19.1, h68/100/150, tq, tfsae30, utto, 0w-20, 5w-30…) | Sheet tab **Sheet3** | — | Reused by many products' recipes |
| **Website series content** (48 series: names, descriptions, specs, categories) | Repo files `frontend/content/catalogue.json` (+ `catalogue-crosswalk.json`, `productCategories.ts`) | Website product pages | **Hand-maintained**, NOT generated from the master — see TD-1 in §9 |
| **Product photos on the website** | `frontend/public/product-photos/` + map `frontend/content/product-images.json` | Website | Fixed display standard; always run `scripts/normalize_product_photos.py`, never hand-resize |
| **Data sheets (PDF)** | `frontend/public/data-sheets/` + `frontend/content/product-datasheets.json` | Website "Data Sheet" download | Originals (.docx) archived in `Product master resources/client-changes-2026-08/` |
| **Industries list** | `frontend/content/industries.json` | Website | |
| **Price-free public catalogue** | Firestore `public_catalog` (written by `importProducts`) | Website | Must never contain prices, GST or SKU |
| **Staff logins + roles** | Firebase Auth + Firestore `users/{uid}` (`name, email, role, status, isActive, deleted`) | Website + office app | Plan: move role to Firebase **custom claims** (server-stamped) |
| **Distributors** | Firestore `distributors` (has `segment` + `priceTier`) | Website ordering (later) + office sales | |
| **Stock (planned)** | Firestore **`stockMovements`** (append-only diary) + per-pool balance, all in **milli base units** | Office app | Not built yet (step 3) |
| **Customers (planned)** | Firestore (our record) **+** Humble Ledger customer linked by `externalId` = our id | Office app | |
| **Sales / invoices (planned)** | Firestore sale doc (lines, qty, prices captured at sale time, stock moved) → posted to **Humble Ledger** (money) → invoice from **billing engine** (PDF + number) | Office app | Posting via a queue: `PENDING → SYNCED / FAILED` |
| **Books: P&L, balance sheet, ledgers, dues** | **Humble Ledger** | Office app reports | Ledger knows rupees, not products |
| **Company / seller details** | `frontend/content/assets.ts` (address, phone, email); seller state **Haryana (GST code 06)**; legal name **"Lube Chem Industries"** | Invoices (later), website | |

---

## 3. The product master — what was done and how to read it

### 3.1 History
1. Original master `docs/Technofluid-Product-Master-DRAFT.xlsx` = **320 SKUs**, one per *pack size*, built from Gaurav's price lists. Grades were often buried in names or missing.
2. We generated a grade-level gap sheet (`scripts/build_grade_master.py` → `docs/Technofluid-Product-Master-GRADES.xlsx`) and Gaurav moved it to Google Sheets and worked in it.
3. **19 Sep 2026:** split rows where Gaurav typed several packs with commas (e.g. "26,50,210") — 63 rows → 200 rows. Verified cell-by-cell.
4. **6 Oct 2026 clean-up** (2,088 cells, verified 0 mismatches against backup + plan): every row got a **unique SKU**, pack labels written one way, pack qty / base unit / price-per filled from the sheet's own conventions, product names unified, 11 recipe typos fixed, "Action needed" column rewritten in plain words, red highlighting now marks only genuinely missing cells, "Summary by product" tab rebuilt. Backup: `~/Downloads/Technofluid-master-BACKUP-before-cleanup-2026-10-06.xlsx` on Ansh's Mac (+ Google Sheets version history).

### 3.2 Numbers today (live sheet, 14 Oct 2026)
- **782 rows** (57 product names). **781 importable** — PVC Oil has no pack size yet.
- **171 stock pools** (product + grade; every pack size of one pool shares the same stock).
- **334 rows priced, 447 without price.** Decision: missing prices can be entered later **in the office app**.
- **779 rows have a recipe.**

### 3.3 Key columns (tab "Product Master (grades)")
`SKU · Product · Grade · Pack · cost from purchase(empty) · commodity A–G % (recipe) · formulation(empty) · cost from formulation(empty) · Do you sell this? (Y/N) · Pack qty · Carton/brl wt · Net Weight · Density · cane size / canes / caps / Pack Wt (empty) · Base unit · Price per · Dealer price · Distributor price · GST % · Visible to · Shown on website as · Action needed · Original master row`

- **SKU format for new codes:** `PRODUCTCODE-GRADE-PACK`, e.g. `CIR-68-26L` = Circulating Oil 68 in a 26 L can. Old price-list SKUs kept where unique.
- **Price per:** `per litre` / `per kg` (price × pack qty), `per case` / `per bucket` (price is for the whole pack), `per piece` (price per bottle inside a case, e.g. 35 × 500 ml). See `office/core/src/pricing.ts`.
- **Visible to:** `Automotive` / `Industrial` / `Both` (Both = every buyer).
- **Recipe format:** each cell is `ingredient/percent`, e.g. `w150/50`. A cell with **no percent** (e.g. `w70/`) appears to mean **"alternative ingredient"** — with that reading **773 of 779 recipes add up to exactly 100%**. ⚠️ Not yet confirmed by Gaurav.
- **3-level recipe chain:** raw material (Sheet1) → half-made mix (Sheet2) → base blend (Sheet3) → finished product. Example: PCMO 15W-40 CF4 = `r5` 100% → `r5` (Sheet3) contains `w150vi10kg` → `w150vi10kg` (Sheet2) = W150 + Lubimax 141.
- **"diesel engine oil common"** in the Y/N column on PCMO 15W-40 CF4/CI4 = Gaurav's answer: those are the **same product** as Diesel Engine Oils.

### 3.4 Rules for touching the sheet
- **Always download a fresh copy first** (he edits it), keep a backup, never overwrite his columns, and verify cell-by-cell after any scripted edit. Edits were done with a guarded Apps Script that aborts if the sheet changed.

---

## 4. Decisions log (all confirmed by Ansh)

| Date | Decision |
|---|---|
| Jun–Aug 2026 | Public site first; price-free catalogue; browse by series; aspirational products shown "available on request"; distributor "Become a distributor" CTA **deferred** |
| Aug 2026 | Product photo display standard (script); data sheets as PDF downloads |
| 6 Oct 2026 | **Build the ACCOUNTING / office software first** (stock + sell to anyone), **ordering system after**. Missing prices can be entered in the software |
| 6 Oct 2026 | Stay on **Firebase** (pay-as-you-go, ~₹0 at their size). Rejected: Supabase (fixed ~$25 + ~$10/client/month, Postgres not NoSQL), DigitalOcean droplet (costs more, ops burden, single point of failure), native Swift for Mac (Windows still unsolved), Convex (shared free allowance, rewrite) |
| 9 Oct 2026 | Desktop app = **Electron + React + official Firebase JS SDK**, sharing a **TypeScript core** with the website. Windows **and** Mac |
| 9 Oct 2026 | **Roles:** Admin · **Accounts** (new) · **Stock & Production** (Supervisor + Manufacturing merged, role key `supervisor`). Salesperson + Distributor use the website (ordering, later). Recorded in PRD §2/§10/§11 (PR #54) |
| 9 Oct 2026 | **Sell to distributors AND any customer** (simple record; Dealer price by default) |
| 9 Oct 2026 | **Signing:** Mac via **Apple Developer account** (required for Gatekeeper + auto-update). **Windows unsigned for now** (one-time "Run anyway" per PC). **No Microsoft signing service** |
| 9 Oct 2026 | Accounting engine = **Humble Ledger**; invoices = our **billing engine** (access pending) |
| 13 Oct 2026 | Build directly on Ansh's PC, **no tickets** for the office app. Colours/feel from technofluid website; proper desktop UX |
| 13 Oct 2026 | Office app lives in **`office/`** (own npm workspace) so the website's Vercel build is untouched |

**Other Humble Coders context (not Technofluid-specific):** KMP desktop apps (e.g. Aromex) have a Firebase problem — they use Google's *server* library with a service-account token, which **bypasses security rules** and causes listener "reconnect storms". Options researched: GitLive Firebase Kotlin SDK (fixes storm + security, alpha), or signing in with the user's ID token (fixes security only). Not part of Technofluid.

---

## 5. Engineering rules for Technofluid Office (non-negotiable)

1. **Money = whole paise** (₹1 = 100). Never decimal rupees in maths. Convert only for display or for APIs that want rupees (Humble Ledger takes decimal rupees).
2. **Stock = whole milli base units** (mL for litre products, g for kg products). Never decimal litres — running sums drift.
3. **Stock is per stock pool (product + grade), never per pack.** Packs are derived: `floor(onHand / packQty)`. (PRD §7)
4. **Money and stock are only written on the server** (Cloud Functions check role + numbers). The app *asks*; it never writes balances.
5. **Stock is a diary** (`stockMovements`, append-only: what, how much, who, why). Mistakes are fixed with a reversing entry, never by editing.
6. **Everything is safely retryable** — one id per sale/payment/movement; Humble Ledger is idempotent on `(appId, sourceId)`.
7. **Ledger posting goes through a queue:** sale saved in Firebase first (stock moved) → status `PENDING` → server posts to Humble Ledger → `SYNCED` or `FAILED` (auto-retry, visible badge). The desktop app **never holds Ledger credentials**.
8. **GST:** seller in Haryana (06). Same state → CGST + SGST (each computed at half the rate, so they print equal); other state → IGST. Rates in **basis points** (18% = 1800). Invoice total rounded to the rupee with a "Round off" line.
9. **Test before screens** for anything with money, GST, units or permissions; security-rule tests in the emulator.
10. **Development never touches live data:** the app uses project id `demo-technofluid` when `VITE_USE_EMULATORS=true` (Firebase refuses to connect `demo-` projects to the cloud).
11. Prices are **never shown to Stock & Production** — and (to do) must also be **unreadable** by them at the rules level.

---

## 6. Humble Ledger — what we'll use and what's missing

API: `https://hl.humblesolutions.in/docs/json` (OpenAPI 3, 69 endpoints). Auth: Bearer JWT per company (15-min access + 30-day refresh). Roles there: OWNER / ACCOUNTANT / VIEWER. Multi-tenant (token = one company). Amounts in **decimal rupees**.

**We will use:** `/customers` (link to ours via `externalId`), `/sales` (with `taxLines` for CGST/SGST or IGST, optional COGS fields), `/payments` (cash/bank, partial, linked to invoice), `/invoices` + `/invoices/{id}/cancel`, `/refunds`, `/receivables` (ageing), `/ledger` (statements), `/vendors` + `/purchases` + `/vendor-payments`, `/expenses`, `/customers/{id}/opening-balance`, `/reports/pnl|balance-sheet|trial-balance`, `/transactions` (raw, as escape hatch).

**How the app will reach it:** a Cloud Function (server) holds the Technofluid Ledger login (as a Functions secret) and posts on the app's behalf. Aromex instead uses a gateway `/hl-token`; we keep credentials server-side only. **Stock & Production never touches money.**

**Gaps found (must be solved before billing real customers):**
1. Billing lines only have name/qty/rate — a **GST tax invoice** also needs HSN code, per-line GST rate, unit, place of supply, CGST/SGST/IGST breakup, buyer address + state. (Check in the billing engine when access arrives.)
2. Invoice series `PREFIX-YYYY-####` resets in **January**; Indian invoices usually follow the **April–March financial year** (ask their CA).
3. **No partial sales returns / credit notes** (only full cancel or refund of paid money); no purchase returns.
4. **No GST return reports** (GSTR-1 / 3B, HSN summary) — we may build from our own sale records.
5. `/purchases` debits an "expense account" — check it accepts an **Inventory (asset)** account for raw materials.
6. No **vendor opening balance** endpoint (workaround: raw transaction).
7. No **e-way bill** (needed for goods over ₹50,000) — decide manual vs later.

---

## 7. Technofluid Office — what is built (branch `feat/office-foundation`)

### 7.1 Layout
```
office/                     npm workspace (own package-lock; NOT at repo root on purpose)
  core/                     @technofluid/core — pure TypeScript rules, no UI/Firebase
    src/money.ts            paise, exact rupee parsing, ₹ Indian grouping, % in basis points, round-off
    src/units.ts            milli base units, L↔kg by density, packs available
    src/gst.ts              state codes, GSTIN check digit, CGST/SGST vs IGST, invoice totals
    src/pricing.ts          per litre / per pack / per piece pack pricing; refuses unknown labels
    src/core.test.ts        15 tests (vitest) — all pass
  desktop/                  @technofluid/desktop — Electron 44 + electron-vite 5 + Vite 7 + React 19
    src/main/index.ts       window, security hardening, single instance, remembered size, menu, IPC
    src/preload/index.ts    the ONLY bridge: window.office { platform, getAppInfo }
    src/shared/ipc.ts       types for that bridge
    src/renderer/src/
      lib/firebase.ts       official Firebase JS SDK, offline cache, emulator / demo- project switch
      lib/access.ts         roles, sidebar items per role, canSeePrices
      features/auth/        sign-in, session (live users/{uid} profile), blocked screen
      components/layout/    AppShell (sidebar, top bar, online badge), CommandPalette (⌘/Ctrl+K)
      components/ui/        Button, Input, Field, Badge, Card, EmptyState, Kbd, Spinner
      features/products/    Products screen (virtual list, search, filters, detail panel)
      features/dashboard/   Dashboard
      services/, hooks/     data access layer (UI → hooks → services → Firestore)
    .env.example            Firebase web config template (real values in .env.local, not committed)
  emulator/
    start.mjs               starts Auth + Firestore emulators (picks Java 21 on Mac), saves data on exit
    seed.mjs                creates test logins + loads products
    seed/products.json      781 products generated from the live sheet (13–14 Oct 2026)
firebase/firebase.json      gained an "emulators" block (deploys ignore it) — emulators run the REAL rules
```

### 7.2 What works today
- Sign in (email + password), live role check; non-office roles get a clear "can't use this app" screen.
- Role-based sidebar and route guard: Admin sees all; Accounts sees money + products/stock; Stock & Production sees Dashboard, Products, Stock, Production — **no prices**.
- ⌘/Ctrl+K command palette, ⌘/Ctrl+1–6 screen shortcuts, `/` to search, arrow keys in lists, online/offline badge, "Test data" badge in development.
- **Products screen:** all 781 items live, search (numbers match whole tokens, SKU search), filters (category, buyer type), "No price (447)" view, compact columns when narrow, detail panel with **price of one pack** (computed by core) and recipe.
- Other screens are placeholders saying what they will do.
- Verified in a browser preview (no console errors) and launched as a real Electron window.

### 7.3 How to run (needs Node 20+, Java 21 for emulators, Firebase CLI)
```bash
cd office
npm install
node node_modules/electron/install.js     # only if Electron says "Electron uninstall"
cp desktop/.env.example desktop/.env.local # keep VITE_USE_EMULATORS=true; Firebase values are only needed for the live
                                           # project (get them: firebase apps:sdkconfig WEB --project techno-fluid)
npm run emulators                          # terminal 1 (Auth 9099, Firestore 8080, UI http://127.0.0.1:4000)
npm run seed                               # terminal 2, once
npm run dev                                # opens the Electron app
npm test                                   # core tests
npm run typecheck
```
Screens only, in a browser: `npm run dev:screens -w desktop` → http://localhost:5173.
**Test logins** (password `technofluid123`): `admin@technofluid.test`, `accounts@technofluid.test`, `stock@technofluid.test`, `distributor@technofluid.test` (shows the blocked screen).

### 7.4 Product record (Firestore `products/{sku}`)
Existing website fields: `sku, product, productKey, category (bulk_oil|grease|retail), orderableUnit, packQty, baseUnit (L|kg|piece), pricePer, dealerPrice, distributorPrice (integer paise), gstPct, segment (Automotive|Industrial|Both)`.
Added for the office app: `grade, densityKgPerL, recipe[]` (+ `deleted:false`). `productKey` = slug of product + grade = the **stock pool**.

---

## 8. The plan from here (in order)

| Step | What | Notes |
|---|---|---|
| **1. Security lock** | Fix **C1** (anyone can make themselves admin on signup); roles as Firebase **custom claims**; add `accounts` + merged `supervisor` to rules; **move prices to a separate collection** readable only by admin/accounts (Firestore can't hide fields); rule tests per role in the emulator | Must happen **before** any accounting data exists. Deploying rules to live affects the website — do with care |
| **2. Product importer upgrade** | `firebase/functions/src/products/importProducts.ts` + `validateProductRow.ts` to accept grade, density, recipe, nullable prices; import from the cleaned sheet with preview | Also remember TD-1 (website series files are separate) |
| **3. Stock engine** | `stockMovements` diary + pool balances (milli units), opening stock, stock screens, production (adds stock; later deducts raw materials by recipe) | Writes via Cloud Functions only |
| **4. Money engine** | Cloud Function connection to Humble Ledger (secret), customers sync (`externalId`), **sale** (customer + lines → GST → stock down → ledger queue), payments, statements, dues, cancellations | Needs the Technofluid Ledger company account |
| **5. Billing** | GST-compliant invoice (HSN, per-line rate, CGST/SGST/IGST, place of supply), number series, PDF, print | Needs billing-engine access |
| **6. Rest** | Suppliers & purchases, expenses, reports (Ledger reports + our sales-by-product/stock), production by recipe, partial returns | |
| **7. Go-live** | Daily Firestore backups, error reporting, nightly reconciliation (Firebase sales vs Ledger; stock diary vs balances), signed Mac build, Windows installer, auto-update, **2–4 weeks running alongside their current system** | |
| **Later** | Distributor ordering system on the website (reuses `core`) | After office app is stable |

---

## 9. Known problems, tech debt and open questions

**Known problems**
- **C1 (critical):** `firebase/firestore.rules` → `users` create lets any signed-in user write their own `role/status/isActive` → self-made admin. Also H1–H5 in `CLAUDE.md`.
- **Prices readable by Stock & Production** at the rules level (UI hides them). Fix in step 1.
- **Contact form on the live site fails:** Vercel env vars point at Firebase project `hs-website-21095` instead of `techno-fluid`. Ansh must update the 6 `NEXT_PUBLIC_FIREBASE_*` vars in Vercel and redeploy.
- **TD-1:** re-importing the master only updates pack sizes on the website; series names, descriptions, images and new products live in hand-edited repo files (`catalogue.json`, `catalogue-crosswalk.json`, `product-images.json`). New master products (PCMO 0W-20 / 10W-30 SN, Megacut 150, Submersible Motor Starter Oil, Warping 22/32, Rear Axle SAE 10W30…) are **not on the website** yet. `catalogue-crosswalk.json` is stale (built at 36 series; site has 48).
- **TD-2:** website series grouping can drift from the master (manual sync). **TD-3:** website shows grades + merged packs, not per-variant rows (deliberate).
- 2 series without data sheets on the website: Coolant, Gear EP Series.

**Waiting on Gaurav / their CA**
1. Raw-material **costs** (all cost columns empty) — needed for stock value and profit.
2. ~15 recipe ingredients **not defined anywhere**: TOY, TOR, W60, WBT100, HSD, 2 cSt, EP / TB / HT / TQ / UTTO additive, `nvi10kg`, `n500vi10kg`.
3. Are recipe % by **litre or kg**? Does a blank % mean **"alternative"**?
4. Which products are **bought ready-made and repacked** (greases, brake fluid, chain oil?).
5. **Packaging per product** (can, cap, carton).
6. Small fixes: PVC Oil pack size; Brake Fluid "Visible to"; 4T 15W-50 SN 2.5 L case qty says 20 (4×2.5 = 10); is "Submersible Motor Starter Oil" its own product?
7. **HSN code + GST rate per product** (needed on invoices); **invoice number format** (financial year?); **e-way bill** manual or automated?

**Waiting on Ansh / Humble**
- Humble Ledger company account for Technofluid · billing-engine access · **Apple Developer account** (company name; takes days) · fix Vercel env vars · decide when to deploy the security rules.

---

## 10. How to work on this without stepping on each other

- **Branches:** office work is on `feat/office-foundation`. Make your own branch from it for parallel work; keep PRs small. `main` auto-deploys the **website** to Vercel — anything merged to `main` that touches `frontend/` goes live.
- **Don't edit Gaurav's Google Sheet** without: fresh download → backup → scripted, guarded change → cell-by-cell verification.
- **Never deploy Firestore rules or Functions** to `techno-fluid` without telling Ansh — the live website uses them.
- **Follow the layering** (UI → hooks → services → Firestore/Functions) and the rules in §5.
- Good parallel tasks that don't collide with the office foundation: the **product importer upgrade** (step 2), **rule tests + C1 fix** (step 1, coordinate on deploy), **Humble Ledger Cloud Function client** (step 4 groundwork), website **TD-1 catch-up** for new products.

---

## 11. Glossary (plain words)

- **SKU** — one sellable item: one product, one grade, one pack size (e.g. Hydraulic AW 68 in a 26 L can).
- **Grade** — the variant of a product (e.g. 32 / 46 / 68 thickness, 20W-40, DOT 4).
- **Stock pool / productKey** — all pack sizes of one product + grade, sharing one stock figure in litres/kg.
- **Base unit** — litre (L), kilogram (kg) or piece.
- **Paise / milli units** — whole-number storage for money (₹1 = 100 paise) and stock (1 L = 1,000 mL).
- **Segment** — which buyers see a product: Automotive / Industrial / Both. **Price tier** — Dealer (higher) or Distributor (~20% lower).
- **CGST / SGST / IGST** — GST split: within Haryana half central + half state; outside Haryana all "integrated".
- **HSN** — product tax classification code printed on invoices.
- **Emulator** — a fake Firebase running on your own computer for safe testing.
- **Humble Ledger** — our accounting engine (the money book). **Billing engine** — our invoice/PDF engine.
- **Idempotent** — sending the same thing twice only records it once.
