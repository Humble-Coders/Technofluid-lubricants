# Office — Reports (build brief)

From Ansh, 15 Nov 2026 (relayed by his governing session; Ansh picked Reports as the next phase the same day). Work on `feat/office-reports`, branched from main 7d24149. Deviations, with reasons, go to Ansh's session and are listed in §9.

# 0. What we're building
Three read-only reports for Admin and Accounts on the "Reports" screen (was a placeholder; its text becomes "Money owed, sales by product, stock value"):
1. **Money owed** — who owes us, whom we owe, and which invoices and bills are still open, with their age.
2. **Sales by product** — what we sold in a date range.
3. **Stock value** — what the stock we bought is worth.

Nothing is posted to HL and nothing is written to Firestore. Reports only read.

# 1. Decisions (Ansh, 15 Nov). If one blocks you, ask Ansh through his session.
1. The scope is these three reports. P&L and balance sheet are NOT in this phase — without the cost of the goods we sell, a P&L would mislead.
2. Stock value counts only what has a purchase price. Items bought through Purchases get a value; items made in-house, or never bought, are listed with their quantity and "no cost yet". The report fills in as bills are entered.
3. Stock is valued at the **weighted average purchase price**: Σ taxable ÷ Σ quantity over every ACTIVE purchase line of that item (AS-2). Not the latest price.

# 2. Money owed
- A party's balance (the truth) is HL's: the existing callable `getEntityBalances` (via `ledgerService.getEntityBalances`) returns `balancePaise` per entityId. Positive = they owe us; negative = we owe them.
  - A party that is both customer and supplier nets to ONE figure.
  - The screen splits into "Owed to us" (> 0) and "We owe" (< 0). Zero balances are hidden, with a toggle to show them.
- Open documents come from our own records: sales with status ACTIVE and due > 0, purchases with status ACTIVE and due > 0.
  - Each shows: number (TF/… or PB/… plus the supplier's bill no), date, total, paid, due, age in days.
  - Age buckets, by document date and today's India date: 0–30, 31–60, 61–90, 90+.
- Per party: the HL balance, the open documents under it, and a visible line **"Not matched to an invoice/bill" = HL balance − (open invoices − open bills)**.
  - The two sides won't always add up: openings, money recorded without an invoice, and credit left by cancelled invoices all cause differences. Show the difference; never force the two to tie.
- **ONE paid rule.** A document's due was computed in the desktop hooks (`useSalesPaid`, `usePurchasesPaid`) and again in the functions (`paidLaterOn`, money/entries.ts).
  - One pure core function with a shared cases file: `documentDue({ totalPaise, paidAtCreationPaise, linked[] })`. A linked entry stops counting only once its reversal mirror is SYNCED, exactly as `paidLaterOn` does.
  - The report, the sales and purchase screens and the hooks all use it.
  - `paidLaterOn` is made provably the same via the same cases: its pure filter is exported and tested. Its behaviour doesn't change. Any functions code change waits for the next deploy (Ansh's word).
- Bound: "open" can't be queried (due is derived). Scan documents dated from 1 April of the PREVIOUS financial year onwards (single-field range on invoiceDate / billDate) and filter status in code. Anything older shows up only inside "Not matched" (Known gaps; the books only started in Nov 2026).

# 3. Sales by product
- Inputs: a date range (default: this month) and an optional customer.
- Source: sales with invoiceDate in range (one range query), ACTIVE only; the cancelled count is shown separately and excluded. Only the FROZEN line figures on the sale are used — never re-priced.
- Rows by product (sku → product name + pack): packs, quantity in base units (L / kg / pcs), taxable, GST, total; sorted by taxable, largest first.
  - A toggle groups by product (all packs of one productKey) or by customer.
  - One-off-price lines count normally.
- Freight and round-off each get their own row.
- Acceptance check, shown on screen: report total == Σ grandTotalPaise of the ACTIVE invoices in range, to the paisa.

# 4. Stock value
- Source: stock items with onHandMilli, plus all ACTIVE purchases (any date). Per itemId: Σ taxablePaise and Σ qtyMilli of their lines. "Goods already counted" bills count too — the cost is real even with no stock movement.
- Value per item = round(onHandMilli × Σtaxable ÷ Σqty), rounded ONCE per row, in integer paise. Also the average price per base unit = round(Σtaxable × 1000 ÷ Σqty).
- No purchase line: quantity + "no cost yet", left out of the total, with a count of items with no cost yet.
- On hand below zero: the quantity, flagged "below zero"; its value isn't counted.
- Cost = taxable (ex-GST). Freight isn't spread over items (landed cost is a known gap). For an unregistered supplier, taxable is the full price.
- "As of now" only.

# 5. How to build
- Pure builders in office/core (`reports.ts` + `reports.cases.json`): due, ageing, sales by product, stock value. Money in integer paise, quantities in milli. No floats.
- Desktop: services do ONE-SHOT reads (getDocs), not listeners, chunked like `watchSalePayments` for the linked money entries; hooks wrap services; screens consume hooks; route for Admin + Accounts only; "Save as CSV" per report (a small main-process save dialog); a "figures as of <time>" note and a Refresh button.
- NO new Cloud Functions (ask first if one seems needed).
- NO new indexes: every query single-field (one equality OR one range). A composite index would go into firebase/firestore.indexes.json and needs Ansh's word to deploy — the emulator never enforces indexes; live does.
- Rules: sales, purchases and moneyEntries are already readable by Admin + Accounts only. Nothing changes. Stock & Production never sees this screen.

# 6. Tests
- Core cases: due (partial, full, reversed with mirror pending vs SYNCED, deleted); ageing edges (30/31, 60/61, 90/91); sales by product (several packs of one product, freight, round-off, cancelled excluded, the total check); stock value (weighted average over 2 bills, no cost, below zero, rounding). The shared due cases also run against the functions filter.
- Desktop typecheck + build clean; core vitest passes.
- Seed: reuse seed:sales and seed:purchases; any added data uses made-up names (the repo is PUBLIC).
- Manual run on the emulators, a screenshot of each report in the PR (the PM's preview).

# 7. Handover
- One PR into main: how to try it, test counts, deviations and reasons.
- Merge on Sharnya's OK (merge commit, `--match-head-commit`); send the PR to Ansh's session first for review.
- Desktop-only, so no deploy. If anything in firebase/ changes, its deploy waits for Ansh.

# 8. Not in this phase (Known gaps)
- P&L and balance sheet (need the cost of goods sold).
- GST summary / GSTR-3B figures (a good next candidate).
- Purchases by supplier.
- Stock value for items made in-house (needs production costing).
- Landed cost (spreading freight over items).
- As-of-date stock value.
- Charts and dashboards.
- Open documents older than the previous financial year.

# 9. Deviations (sent to Ansh's session with the PR)
1. **Placeholder text.** The placeholder is replaced by the real screen. Its three tabs are "Money owed · Sales by product · Stock value", so no separate subtitle.
2. **On hand exactly 0** shows a value of ₹0 and is not flagged. Only below zero is flagged "below zero" (§4 said ≤ 0; "below zero" on a 0 would read wrong). Either way nothing is added to the total.
3. **Items with nothing in stock are hidden by default** in Stock value, with a toggle and a count. Hundreds of items have 0 on hand (256 in the test data), which would bury the useful rows. "In stock, no cost yet" counts only items with stock above 0. The CSV always has every item.
4. **Zero-balance parties** are hidden, as asked, even when they have an open document. The toggle says how many of them have one. A party with an open document but no balance in the books (not synced) sits there too, marked "Not in the books".
5. **A bill's due shows with a minus sign** in the list and the CSV, matching the signed balance (+ owed to us, − we owe).
6. **Stock items without a unit** are left out of Stock value: they can't hold stock or be bought.
7. **Where the functions' pure filter lives.** It's `paidLaterSum` in `money/moneyModel.ts`, the server's mirror module (pure and loadable by the emulator tests), and `paidLaterOn` in `money/entries.ts` calls it. Same behaviour. The only deployed function affected is `recordMoneyEntry`; it can ride the next deploy on Ansh's word.
8. **Lint in firebase/functions.** `money/moneyModel.ts` and `entries.ts` already fail the functions eslint (max-len and similar: 210 errors on main). The new function adds 8 of the same kind, written line for line like its core twin, as the rest of that file is. `tsc` is clean.
