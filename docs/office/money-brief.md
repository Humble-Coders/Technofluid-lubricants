# Technofluid Office — Money module build brief

> From Ansh Technofluid (governing session), 26 Oct 2026, based on the Aromex money module as its own team described it, adapted to our rules.
> Cloud Function list (§4) approved by Sharnya on 26 Oct 2026. Built on `feat/office-money` (from `feat/office-entities`). Deviations are at the end.

## 0. What we are building
Every movement of money that is not a sale or a purchase bill:
- a customer pays us
- we pay a supplier
- cash deposited in the bank
- one party's balance moved to another
- an expense paid (freight, electricity, salaries…), with GST input credit when there's a GST bill
- a balance correction

All posted to Humble Ledger (HL). Our cash boxes and bank accounts are **registers**, each pinned to a real HL ASSET account, with a real opening balance.

Five rules:
1. No stored balances, ever.
2. Direction lives in from/to, never in a sign; amounts are always positive.
3. Money is integer paise until the HL boundary, converted in exactly one function.
4. Corrections are postings against a named counter-account, never edits.
5. Nothing is deleted or edited; the mirror is the undo.

## 1. Decisions
1. **One collection.** `moneyEntries` holds every route; expenses are entries whose `to` is an Expense. Registers and categories are ordinary picker choices.
2. **Writes via callables only.** Rules: Admin + Accounts read, nobody writes. The desktop watches an entry until SYNCED/FAILED, and never re-fetches a balance until the entry it depends on is SYNCED.
3. **Roles:**
   - Admin + Accounts record entries and expenses, and reverse ordinary entries.
   - Corrections, and reversing them: Admin, with a reason.
   - Registers: Admin.
   - Expense categories: Admin + Accounts add; Admin renames/archives.
   - Stock & Production: nothing.
4. **GST input on expenses** is built in.
5. **Real register openings**: DR register / CR "Opening Balance Equity".
6. **`businessDay` is required** (YYYY-MM-DD, IST). It is the posting date; future days are refused.
7. **Payments settle the overall balance**; there is no invoice allocation until Sales.
8. **Same HL client and modes** as entities (fake on `demo-` only; live with HL_MODE=live; otherwise off).

## 2. Data model
- **`registers/{id}`**:
  - name (unique, case-insensitive; cash/bank/inventory reserved except a default keeping its own name)
  - kind CASH|BANK, locked after create
  - isActive, displayOrder
  - opening {amountPaise, asOf, posted, hlTxnId}, set once
  - hlAccountId, stamped once
  - sync and audit fields; deleted:false
  - Defaults: `default-cash` "Cash in hand" and `default-bank` "Bank".
- **`expenseCategories/{id}`**: name (unique), isActive, hlAccountId (pinned once), sync and audit fields. Never hard-deleted.
- **`moneyEntries/{id}`**:
  - from, to (MoneyAccountRef), sideIds
  - amountPaise (gross for expenses), businessDay, note, isCorrection
  - gst {supplier{entityId|null, name, gstin, stateCode}, billNo, billDate, rateBp, taxablePaise, cgstPaise, sgstPaise, igstPaise}, where taxable + taxes = amount
  - reversesEntryId / reversedByEntryId
  - syncStatus, hlTxnId, hlLegs, hlSyncError, syncAttempts
  - createdBy, createdAt, deleted:false
- **`MoneyAccountRef`**: PARTY {entityId, name} | CASH/BANK {registerId, name} | EXPENSE {categoryId, name} | ADJUSTMENT.
- **Derived in core**:
  - direction: expense on `to` → OUT; expense on `from` → IN; party→party → INTERNAL; `from` not ours → IN; `to` a party → OUT; else INTERNAL
  - canReverse, isCancelled
  - isSameAccountAs, by id

## 3. Core
`office/core/src/money-entry.ts`, plus `money-entry.cases.json`, run by vitest AND by the functions mirror `firebase/functions/src/money/moneyModel.ts`:
- **`moneyEntryError`** returns the first error, in this order: REASON_REQUIRED, EXPENSE_REVERSAL_ONLY, EXPENSE_NEEDS_REGISTER, ADJUSTMENT_NEEDS_PARTY_OR_REGISTER, CORRECTION_MISMATCH, SAME_ACCOUNT, INVALID_AMOUNT, BAD_DAY/FUTURE_DAY, NOTE_TOO_LONG, then GST_BAD_GSTIN / GST_SPLIT_MISMATCH / GST_WRONG_TYPE.
- **`expenseGstSplit`** works from either the total or the taxable value.
- **`correctionFor`** takes signed balances.
- **sourceIds**: `money_<id>` and `register_<id>:opening`.

## 4. Cloud Functions (approved by Sharnya, 26 Oct 2026)
- **Callables:** recordMoneyEntry, recordExpense, correctBalance, reverseMoneyEntry, retryMoneyEntrySync, saveRegister, setRegisterOpening, setRegisterActive, ensureDefaultRegisters, saveExpenseCategory, getRegisterBalances, getRegisterStatement.
- **Triggers** (asia-south1): onRegisterWritten, onExpenseCategoryWritten, onMoneyEntryWritten.
- **Scheduled:** `reconcileLedgerSync` (every 10 min) replaces reconcileEntitySync. It sweeps entities → registers → categories → money entries.
- **Posting order (load-bearing):**
  1. reversal
  2. correction: JOURNAL, DR `to`, CR `from`, against "Balance Adjustments" (party) or "Cash Over and Short" (register)
  3. expense: DR category (taxable), DR Input CGST + SGST or IGST (ASSET, tax accounts), CR register
  4. party → register: `/payments`
  5. register → party: `/customer-payouts`
  6. party → party: JOURNAL
  7. register → register: JOURNAL

  Every side is resolved first. A dependency not in the books yet leaves the entry PENDING untouched; missing, archived or wrong-kind → permanent FAILED.

## 5–7. Desktop, rules, tests
As described in the original brief:
- **Desktop:** Money in & out (register cards, quick actions, one From/To picker, a plain-words line, Save disabled with the exact error, "Saving to books…", a filtered table with Reverse, the Admin's registers panel); register history; Expenses (GST bill with a live split); Record payment and Correct balance on the customer panel.
- **Rules:** read by Admin + Accounts, no client writes.
- **Tests:** core cases plus emulator routing, reversal, correction, registers, balances, off mode and rules.

## 8. Lessons from Aromex
No stored balances; plain words; HL's running balance only; corrections are postings; wait for SYNCED; expenses are first-class; pin by id once; a missing balance means ₹0; GST input built now; real openings; businessDay required.

## 9. Not in this phase
Sales/invoices (our own FY invoice numbers, e.g. TF/2026-27/0001, from a Function), invoice-linked payments, refunds, purchases on credit, PDFs, GST returns, bank reconciliation.

---

## Agreed deviations and notes (26 Oct 2026)
- **(a) Reversal posting.** A mirror posts as `POST /transactions` postingType **REVERSAL**: the original's recorded legs (`hlLegs`), flipped, sourceId `money_<mirrorId>`, description "Reversal: <reason>".
  - Why not route it through the cascade: that would turn a reversed payment into a payout and the other way round, and `/payments` rejects over-payments.
  - HL's `/transactions/{id}/reverse` isn't used, because it takes no sourceId, so it isn't retry-safe.
  - Every original stores the legs it posted (`hlLegs`, payments and payouts included), taken from the account ids at posting time. The mirror posts exactly those, flipped, and resolves nothing from today's state: an archived category or register, or a renamed or re-pinned one, can't change a reversal or make it unpostable. Tested for every route.
  - **HL's own payment and payout records are NOT marked reversed by this.** Only the ledger nets to zero. That's fine for now, because we don't use HL's payment lists.
  - A reversed pair only counts as cancelled once the mirror is in the books (core `reversalState`). Until then the original is still shown, with "Reversal pending" or "Reversal not posted · Retry", and still counts in the expense totals.
- **(b) Wording on payments and payouts.** Our wording goes in the top-level `description` of `/payments` and `/customer-payouts` (both have it, per HL's OpenAPI), and in `metadata.description` too. Our statements label money rows from the joined `moneyEntries` doc.
- **(c) Advances.** `/payments` 422 OVERPAYMENT is tied to invoices; we send no invoiceId, so an advance should land as a credit. **Verify on first live call.**
- **(d) Expenses use `/transactions`.** We post postingType EXPENSE with explicit legs; HL's `/expenses` takes one tax account and can't split CGST + SGST.
- **(e) Undocumented response bodies** (balance sheet, payments, payouts, transactions 201) are read defensively and fail loud on surprises. Each is marked "VERIFY ON FIRST LIVE CALL".
- **(f) The fake ledger** is now a real double-entry ledger: it rejects unbalanced postings (> 1 paisa off), unknown accounts and archived accounts. `npm run fake-hl -- reset` rebuilds the local fake books after a format change.
- **(g) Reconcile in tests.** Tested through the exported `reconcileLedgerOnce` (the emulators run no scheduler).
- **(h) Faster than the brief.** Once a party, register or category reaches the books, entries waiting on it are posted straight away (`postWaitingFor`); the reconcile still covers anything missed.
- **(i) No correction against a stale balance.** `correctBalance` refuses while earlier entries for that account are still PENDING or FAILED.
- **(j) Emulator secret.** The emulator start scripts write a placeholder `GATEWAY_ADMIN_TOKEN` to `firebase/functions/.secret.local` (git-ignored), so the Functions emulator stops calling Secret Manager.
