# Technofluid Office — Sales & invoices

Built by the Ansh Technofluid session on 27 Oct 2026, while Sharnya was away. It builds on customers & suppliers (`entities-brief.md`) and money (`money-brief.md`). This note records the design and the decisions, so the next person can carry on.

## What it does

Accounts (or Admin) bills a customer for whole packs at their price list (Dealer / Distributor). Each line can carry an optional discount, and GST is added on top:
- **CGST + SGST** when the place of supply is our state (Haryana, 06);
- **IGST** otherwise.

Freight is optional and is taxed at the goods' rate (the highest line rate). The total is rounded to the rupee.

Saving a sale, all in one transaction, in a Cloud Function:
- numbers the invoice;
- takes the stock out;
- records any payment taken at billing.

The sale is then posted to Humble Ledger. Money received later can be recorded against the invoice. A mistake is a **cancellation**, never an edit.

## Decisions (Ansh, 27 Oct 2026)

| # | Decision |
|---|---|
| 1 | **Invoice numbers are our own financial-year series**: `TF/2026-27/0001`. It restarts every 1 April. Numbers are at most 16 characters (the GST limit), so the prefix is 1–3 characters. The number is allocated in the createSale transaction and sent to HL as `invoiceNumber`. A cancelled invoice keeps its number. Invoice dates may not go backwards within a series (`DATE_BEFORE_LAST_INVOICE`). The prefix is configurable in Settings; once a year has invoices, its prefix is fixed. |
| 2 | **Per-line % discount** (Accounts + Admin), 0–100 % with at most 2 decimals. It is stored in basis points, and GST is charged on the discounted value. The list price never changes. |
| 3 | **No PDF until the billing engine is connected.** The invoice is shown on screen, laid out as a tax invoice. Ansh connects HL and the billing engine. |
| 4 | **Cancel, don't edit** (Admin + Accounts, reason required). Stock comes back as "Sale cancelled" lines dated today. HL `POST /invoices/{id}/cancel` posts the mirror; anything already paid stays as the customer's credit. Credit notes and partial returns come later. |
| 5 | **A missing HSN code is allowed, with a warning** (codes are awaited from the CA). GST is each product's `gstPct`, a placeholder 18 %. |

Defaults this build chose (not separately confirmed):
- **Stock goes out when the sale is saved.** In direct billing the sale is the dispatch (PRD #19). Stock may go below zero; this is warned about, as in the stock journal.
- **Payment at billing:** up to two payments (e.g. cash + bank), never more than the total.
- **Walk-in customer:** must pay in full. The walk-in record is created on first use, and its place of supply is our own state.
- **Credit limit:** a warning only.
- **Revenue in HL** = taxable value + round-off, so HL's invoice total equals our grand total. There is no separate round-off account.
- **No COGS posting** (no costs yet).
- **Seller details** come from `officeSettings/company` (Admin, Settings screen). Billing is refused until the profile is complete. The seller's state comes from its GSTIN.

## Data

- **`sales/{saleId}`:**
  - `invoiceNo`, `fy`, `seq`, `invoiceDate`
  - `customer` snapshot `{entityId, name, gstin, address, isWalkIn, priceTier}`, `placeOfSupply`, `seller` snapshot
  - `lines[]` (every figure frozen: list price, pack price, discount, taxable, GST, HSN, base-unit quantity), `freight`, `totals` (incl. `byRate`), `missingHsn`
  - `payments[]` `{registerId, kind, name, amountPaise, hlTxnId}`, `paidAtBillingPaise`, `note`
  - `status` ACTIVE | CANCELLED, `cancel {reason, by, day}`, `stockMovementIds`, `waitIds`
  - books: `syncStatus`, `hlInvoiceId`, `hlSaleTxnId`, `cancelSyncStatus`
  - `deleted: false`
- **`invoiceSeries/{fy}`** `{prefix, lastSeq, lastDate}`: server-only.
- **`saleRequests/{requestId}`** (idempotency) and **`saleSync/{saleId}`** (posting progress, so a retry never re-posts a step): server-only.
- **`stockMovements`** gain types `SALE` (−) and `SALE_CANCEL` (+). The stock screen can't undo them; they change only through the invoice.
- **`moneyEntries`** gain `saleId` / `invoiceNo` for "money received against an invoice". These post `/payments` with `invoiceId`, and are never more than what's still due.
- **Rules:** `sales` and `officeSettings` are readable by Admin + Accounts only; everything is written by Functions. Stock & Production never sees sales.

## Posting to the books (`firebase/functions/src/sales/sync.ts`)

1. `POST /sales`:
   - customer = the entity's HL customer
   - `amount` = taxable + round-off
   - one `taxLine` per GST leg and rate (Output CGST / SGST / IGST, LIABILITY tax accounts); `taxAmount` = their sum
   - `invoiceNumber` = ours, `sourceId` = `sale_<id>:sale`
2. One `/payments` per payment taken at billing, with `invoiceId`; `sourceId` = `sale_<id>:payment_<i>`.
3. Cancel: read the invoice, then cancel it once (HL's cancel isn't idempotent).

The sale and its payments are dated with the invoice date.

Same spine as money:
- a customer or account not yet in the books → the sale waits, PENDING and untouched;
- transient failure → FAILED, redelivered (capped by the sale's own attempts) and picked up by `reconcileLedgerSync`;
- books not connected → nothing written;
- once a sale is in the books, money waiting on it posts (`postWaitingFor`).

A sale cancelled before it reached the books is still posted, then cancelled. Money taken at billing is never lost from the books.

**VERIFY ON FIRST LIVE CALL:** the `/sales` 201 body (invoice id at `data.invoice.id` / `data.invoiceId`), the `taxLines[].rate` format (a fraction is assumed), and `/invoices/{id}`.

## Known gaps / next

- Reversing a payment linked to an invoice nets the ledger, but HL's invoice `amountPaid` isn't reduced. Our paid status comes from our own records, which are right.
- No credit notes or partial returns, no e-way bill, no PDF.
- Invoice paid state comes from our records (at billing + linked payments); HL's `/receivables` isn't used yet.
- Freight rate and round-off handling: confirm with the CA.

## Tests

- **`office/core/src/sale.cases.json`:** run by core vitest **and** by the functions mirror (`saleModel.ts`).
- **`office/emulator/tests/sales.test.mjs`:**
  - numbering, server pricing, stock out per pool, HL legs, payment against an invoice
  - walk-in, refusals, cancel (incl. before posting), off mode / reconcile, rules
- **Sample data:** `npm run seed:sales`.

## Connecting Humble Ledger (Ansh, 27 Oct 2026)

There's no gateway for this app. The Cloud Functions sign in to HL **directly** as Technofluid's own app user. That user has the ACCOUNTANT role in Technofluid's main HL company; there is no separate test company. The sign-in is `POST /api/v1/auth/login`, and the token is kept for about 13 minutes and renewed on expiry or a 401.

Settings on the live project:

| setting | value |
|---|---|
| `HL_MODE` | `live` |
| `HL_BASE_URL` | `https://hl.humblesolutions.in` |
| `HL_LOGIN_EMAIL` | the app user's email |
| `HL_LOGIN_PASSWORD` | Functions **secret**: `firebase functions:secrets:set HL_LOGIN_PASSWORD` |

The emulators (`demo-` project) always use the fake ledger.

Facts from the HL owner ("Ansh HL" session), now in the code:
- `/ledger` rows carry no `sourceId` and there's no `openingBalance`. The opening is worked out from the first row, or from `closingBalance` when there are no rows. Rows are matched to our records by txn id (`ledger/txnSources.ts`).
- Txn ids are at `data.transaction.id` (`/transactions`: `data.id`).
- A `/sales` replay returns `existingInvoiceId` / `existingTransactionId`.
- At most 4 `taxLines`; we send one per GST leg, with the rate as a fraction.
- HL creates "Opening Balance Equity" itself on a customer's first opening balance. Our cash/bank openings use our own **"Opening Balances · Cash & Bank"** account.
- "Sales Revenue" already exists in every HL company; it's reused by name.

## Testing on the real books before go-live (Ansh, 28 Oct 2026)

`npm run emulators:real-books` (in `office/`) runs the local emulators, but posting to Technofluid's **real** HL company:
- It asks for the HL app user's password every time and never saves it. The email can be kept in the git-ignored `emulator/real-books.local.json` (`{"email": "…"}`).
- It checks the sign-in before starting.
- It uses its own emulator data (`emulator/data-real-books`), so practice data can never reach the real books.
- The app shows a red **REAL BOOKS** pill in the top bar.
- `seed:entities`, `seed:money` and `seed:sales` refuse to run. `seed` (logins + products) and `seed:stock` are fine, because they don't touch the books.

How the switch works: it is plain process variables set only by that script (`TECHNOFLUID_REAL_BOOKS*`), read only inside the Functions emulator (`getHlClient.realBooksFromEmulator`). No `.env` file can turn it on, and a deployed function ignores it.

Guards in a real-books test run, so the test leaves nothing behind that the live app would trip over:
- **Invoices are numbered `TST/2026-27/0001`**, never `TF/…`. HL refuses a reused number, so test numbers must not take the live ones.
- **The HL accounts it makes for cash/bank registers and expense categories get "· TEST" in their name.** The default registers have fixed ids, and without this the live app would find the test accounts and reuse them.
- **Opening balances (customers, suppliers, registers) are refused.** HL can't undo them.

Undo every test sale and payment when you're done (cancel the invoice, reverse the payment). The real ledger then nets back to zero.
