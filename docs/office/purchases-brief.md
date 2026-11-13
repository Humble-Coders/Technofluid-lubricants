# Office — Purchases (build brief)

From Ansh, 12 Nov 2026. Sharnya approved the §4 function list on 13 Nov 2026 (build only; deploying needs her OK and Ansh's word). Work started on `feat/office-purchases`, branched from `feat/office-sales-tweaks` (PR #69) while #69 waits for review; main is merged in once #69 lands.

# 0. What we're building
A supplier's bill for raw materials, consumables (cans, caps, cartons, labels) or bought-in finished goods. One bill, in one transaction:
1. records the bill (supplier, their bill no + date, lines, GST);
2. brings the goods into stock ("Bought" lines, base units);
3. posts to Humble Ledger: the supplier's balance goes up (we owe them), with input GST split out.
Paid now (cash/bank) is recorded with it; paid later is a payment against the bill. A mistake = cancel, never edit. This completes PRD #22 and #21.

# 1. Decisions (ask Ansh via me if one blocks you)
1. The supplier is an ENTITY; kinds are labels only. Post against the same HL customer (netting): POST /api/v1/customer-purchases, then /customer-payouts for payments. No HL vendors.
2. The supplier's bill is the source of truth. GST is per line: taxable × rate; CGST+SGST if the supplier's state = ours (06), else IGST (core gst.ts).
   - A ROUND-OFF field matches their printed total (±₹1 max).
   - Computed + round-off ≠ their total → refuse, showing both figures.
3. Input GST ONLY with a valid supplier GSTIN. GST legs go to the existing Input CGST / Input SGST / Input IGST (money SYSTEM_ACCOUNTS). Unregistered supplier → no GST on the bill.
4. Stock comes in with the bill by default: new movement type PURCHASE (+), base units. It can only be undone by cancelling the bill (PURCHASE_CANCEL); the stock screen can't undo it (like SALE).
   - Per-bill option "Goods already counted in stock" → no stock lines, books only. It's for goods Stock & Production already recorded as "In", so stock never doubles.
5. Buyable: stock items of kind raw_material, consumable, product_pool (bought-in). No unit → refuse (existing rule). Premix/blend → refuse (they're made, not bought).
6. ONE HL inventory account, "Inventory · Purchased stock" (ASSET, getOrCreate). It is debited with the subtotal = taxable + freight + round-off. Freight on a purchase is part of the cost. No COGS yet.
7. Cost is recorded, not used: each PURCHASE stock line stores unitCostPaise (taxable ÷ qty) and lineCostPaise, for future costing. No average-cost maths now.
8. Payments:
   - At purchase: up to 2 (cash/bank), never more than the bill total; the rest stays owed.
   - Later: a money entry register→party with an optional purchaseId (mirror of saleId), never more than still due. HL has no bill link for payouts, so paid status comes from our records, like sales.
9. No duplicate bills: same supplier + same bill no (case/space-insensitive) → refuse, naming the existing one.
10. Our own reference, for finding bills (not a legal number): PB/2026-27/0001, an FY series in a transaction (collection purchaseSeries, the same pattern as invoiceSeries).
11. Roles:
    - Admin + Accounts record and cancel purchases.
    - Stock & Production NEVER sees purchases or money, only the stock lines (item + quantity, no price, no supplier, no amount). The movement note is "Bought · PB/…".
12. Bill date may be past, never future; the posting date = bill date. The PB series doesn't need date order.
13. Not now (§9): returns/debit notes, POs, TDS/TCS, RCM, e-way bill, landed-cost allocation.

# 2. Data
purchases/{id}:
- ref (PB/…), fy, seq
- billNo, billNoKey (normalised), billDate
- supplier {entityId, name, gstin, stateCode}
- supplyType (INTRA / INTER / NONE)
- lines[] {itemId, itemName, itemKind, baseUnit, qtyMilli, taxablePaise, gstRateBp, cgstPaise, sgstPaise, igstPaise, totalPaise, unitCostPaise}
- freight {…}|null (taxed at the highest line rate, like sales)
- roundOffPaise, totals (+byRate), billTotalPaise
- payments[] {registerId, kind, name, amountPaise, hlTxnId}, paidAtPurchasePaise
- stockAlreadyCounted, stockMovementIds[], note
- status ACTIVE/CANCELLED, cancel {reason, by, day}
- syncStatus, hlTxnId, hlLegs, paymentTxnIds, hlSyncError, syncAttempts, lastSyncAttemptAt
- cancelSyncStatus, cancelSyncError, cancelSyncAttempts
- waitIds (supplier + registers), createdBy/At, updatedAt, deleted:false
Server-only: purchaseSeries/{fy}, purchaseRequests/{requestId}, purchaseSync/{id}.
stockMovements: new PURCHASE (+) / PURCHASE_CANCEL (−), with purchaseId + ref. Add them to the type unions, labels ("Bought", "Purchase cancelled") and the stock-screen guard (generalise isSaleLine to "changes only through its document").
moneyEntries: optional purchaseId / purchaseRef.

# 3. Core: office/core/src/purchase.ts + purchase.cases.json (run by core AND the functions mirror functions/src/purchases/purchaseModel.ts)
- pricePurchase({lines, freightPaise, supplierStateCode|null, sellerStateCode}): per-line GST via taxLine / invoiceTotals (no rupee rounding inside; the round-off is the user's field, checked), unit cost, totals.
- purchaseError(header, today) codes:
  - NO_LINES, TOO_MANY_LINES (60)
  - NO_SUPPLIER, NO_BILL_NO, BAD_DATE, FUTURE_DATE
  - BAD_FREIGHT, BAD_ROUND_OFF (|x| > 100 paise), TOTAL_MISMATCH
  - TOO_MANY_PAYMENTS, BAD_PAYMENT, SAME_REGISTER_TWICE, PAYMENT_TOO_MUCH
  - GST_WITHOUT_GSTIN, NOTE_TOO_LONG
- Line codes:
  - UNKNOWN_ITEM, NOT_BUYABLE, NO_UNIT
  - BAD_QTY (whole milli > 0, ≤ MAX_QTY_MILLI)
  - BAD_TAXABLE (integer paise ≥ 0)
  - BAD_GST_RATE (reuse gstRateBp; even bp)
- purchaseRef(fy, seq) → PB/2026-27/0001; billNoKey(s).
- Cases: intra CGST+SGST, inter IGST, unregistered, freight at the highest rate, round-off ±, total mismatch, every code.

# 4. Cloud Functions (Sharnya's OK first)
Callables: us-central1, requireRole(["admin","accounts"]), requestId-idempotent.
- createPurchase: validate with the mirror and RE-PRICE on the server; resolve the supplier (active) and items (exist, buyable, unit set). ONE transaction:
  - duplicate check
  - next PB number
  - doc PENDING
  - PURCHASE stock lines + on-hand (skipped if stockAlreadyCounted)
  - the request record
- cancelPurchase (reason required). One transaction:
  - PURCHASE_CANCEL lines dated today (skipped if already counted)
  - CANCELLED
  - cancelSyncStatus PENDING if already in the books
- retryPurchaseSync: FAILED → PENDING (bill or cancel).
- recordMoneyEntry (extend): optional purchaseId for register→party: right supplier, not cancelled, ≤ still due (paid at purchase + linked payments; a reversal counts only once its mirror is SYNCED, like saleLink).
Background (asia-south1, retry:true, same spine as sales):
- onPurchaseWritten → syncPurchase:
  1. resolve the supplier's HL customer and the registers (Waiting if not in the books; Permanent if gone);
  2. getOrCreate "Inventory · Purchased stock" (ASSET) + Input CGST/SGST/IGST;
  3. POST /customer-purchases {customerId, amount: subtotal incl. freight + round-off, expenseAccountId: inventory, taxLines (one per leg, ≤ 3, rate as a fraction), description "Purchase PB/… · bill <billNo>", date: billDate, sourceId "purchase_<id>:bill", actorRef}.
     - VERIFY ON FIRST LIVE CALL: the response shape (txn id at data.transaction.id, per Ansh HL, for customer-scoped posts), and that taxLines works here as on /sales.
     - Persist hlTxnId + hlLegs (DR inventory subtotal, DR input legs, CR supplier total);
  4. one /customer-payouts per payment at purchase, sourceId "purchase_<id>:payout_<i>", paymentAccountId = the register account;
  5. progress in purchaseSync; one final write; cancelled meanwhile → cancelSyncStatus PENDING.
- cancelPurchaseInBooks: POST /transactions REVERSAL with the stored hlLegs flipped, sourceId "purchase_<id>:cancel", dated today. Payouts already made stay; the supplier then shows a credit (correct); a refund is recorded later as money received.
- Reconcile: add purchases + purchase cancels to reconcileLedgerOnce (after sales, before money entries) and to postWaitingFor.
- Fake HL: customer-purchases (balanced, idempotent, PURCHASE posting type). HTTP client method + stubbed test.
Rules:
- purchases: read Admin + Accounts, write false.
- purchaseSeries / purchaseRequests / purchaseSync: server-only.
- Stock & Production DENIED purchases (test it).
Deploy later with --only (the new functions + recordMoneyEntry/onMoneyEntryWritten if changed + reconcileLedgerSync), never bare.

# 5. Desktop (/purchases, "Suppliers & purchases", currently a placeholder)
- List, like Sales:
  - columns: PB ref, bill no, bill date, supplier, total, paid state (Unpaid / Part paid ₹ due / Paid / Cancelled), books status + Retry;
  - date presets incl. FY; search by PB / bill no / supplier / GSTIN;
  - stat cards: Purchases in range, Still to pay.
- New purchase (full screen):
  - supplier picker (suppliers first, inline "Add supplier"), showing GSTIN / state and "registered (input GST)" or "unregistered (no GST)";
  - bill no, bill date;
  - lines: item picker (raw materials / consumables / bought-in, by name/code, with unit); qty in the item's unit (parseQuantityToMilli); taxable ₹; GST % (default 18); computed split + total; unit cost hint (₹/L);
  - freight; round-off (auto-suggested);
  - REQUIRED "Supplier's bill total" ₹: save refused unless it matches within the round-off;
  - "Goods already counted in stock" checkbox (off by default, one-line explanation);
  - paid now: up to 2;
  - note;
  - the Save button shows the exact problem.
- Purchase view: the bill as recorded, payments, books status; Pay (against this bill); Cancel (reason; explains stock goes back out and the books reverse).
- Supplier detail: a "New purchase" button.
- Stock screens: PURCHASE / PURCHASE_CANCEL labels; not undoable there.

# 6. Tests
- Core cases (both copies).
- Emulator:
  - PB numbering
  - duplicate bill refused
  - stock in per item in base units with unit cost; "already counted" adds no stock
  - HL legs balance (DR inventory + DR input = CR supplier)
  - payment at purchase → payout; payment later ≤ due
  - cancel → stock out + REVERSAL that nets to zero; double cancel refused; cancel before it reached the books → posted then reversed
  - premix/blend, no-unit and GST-without-GSTIN refused
  - Stock & Production can't read purchases but can read the stock lines
  - off mode PENDING; reconcile posts it
- httpHlClient test for postCustomerPurchase.
- Seed: npm run seed:purchases (Haryana base oil CGST+SGST, Delhi cans IGST, unregistered local no GST, one part-paid, one cancelled), with refuseOnRealBooks like the other seeds.

# 7. Keep
- Resolve before posting; Waiting docs left untouched; permanent vs transient.
- Deterministic sourceIds; store txn ids + legs; reversals flip stored legs.
- Paise / milli only.
- Statements match by txn id (ledger/txnSources.ts): add purchase / purchasePayment kinds so supplier statements say "Purchase PB/… (bill X)".

# 8. Handover
- One PR into main (or backend then desktop), with how-to-try, test counts, deviations + reasons.
- No merge or deploy without Ansh's word via this session; deploys always use --only.

# 9. Not in this phase (Known gaps)
Purchase returns/debit notes, POs/GRN, TDS/TCS, RCM, landed-cost allocation, costing/COGS, GSTR-2B reconciliation.

# 10. Build notes (Sharnya's session, 13 Nov 2026)

How to try (local emulators only): `npm run emulators`, then `npm run seed`, `seed:stock`, `seed:entities`, `seed:money`, `seed:purchases`; sign in as the Accounts test login (docs/TECHNOFLUID-HANDOVER.md §7.3) → Suppliers & purchases.

Different from the brief, and why (all OK'd by Ansh's governing session, 13 Nov):
1. **Cost is on the purchase, not the stock line.** `unitCostPaise` / `lineCostPaise` live on `purchases.lines[]`. Stock & Production reads `stockMovements`, which must carry no money; each PURCHASE line keeps `purchaseId` + `purchaseLine` to find its cost.
2. **Only an active bill blocks a duplicate.** A cancelled bill's number can be entered again (the usual fix for a mistake).
3. **Two extra codes:** `BILL_NO_TOO_LONG` (over 40 characters) and `ZERO_BILL` (a total or subtotal of ₹0 or less — HL's minimum amount is ₹0.01).
4. **The reversal's txn id is kept** (`cancelHlTxnId`), so a supplier statement says "Purchase PB/… cancelled".
5. **The walk-in record can't be a supplier.**
6. **Server checks:** the supplier's GST state comes from OUR record's GSTIN (an invalid one counts as none); the mismatch error names both totals.

Tests: core vitest (purchase.cases.json, both copies); emulator `purchases.test.mjs` (PB numbers, duplicates, stock in / already counted, HL legs balance, payouts, paying later ≤ due, cancel → stock out + exact reversal, cancel before the books, off mode + reconcile, rules); `httpHlClient` test for `/customer-purchases`.

Review fixes (Ansh's session, 13 Nov):
- **Deploy list:** `postWaitingFor` (money/sync) now wakes purchases, and `onEntityWritten`, `onRegisterWritten`, `onExpenseCategoryWritten` and `onSaleWritten` all call it, so all four deploy too (otherwise a bill saved right after "Add supplier" waits for the reconcile).
- **"≤ still due" is race-free:** `recordMoneyEntry` reads the invoice / bill and its linked payments inside the transaction. This applies to sales (`saleLink`) as well as purchases. The bill's Pay dialog keeps one request id while it is open.
- **Tax-line rate:** set only when the whole bill has one rate (as sales). A 0 % line next to an 18 % one sends no rate.
- **Cancel after a failed payment:** the cancel keys on the bill's own posting being in HL (`purchaseSync.hlTxnId` + `hlLegs`), which are also copied to the purchase when a later payment fails. The bill view then says "Bill in the books · a payment wasn't saved".
- Nits: a payment linked later reads "Payment made for PB/…"; createPurchase re-checks that items aren't deleted inside its transaction.
- **Follow-up (not here):** sales have the same cancel-after-failed-payment shape.

Deploy later, only with Ansh's go-ahead and Sharnya's OK, never bare: `firebase deploy --only firestore:rules,functions:createPurchase,functions:cancelPurchase,functions:retryPurchaseSync,functions:onPurchaseWritten,functions:recordMoneyEntry,functions:onMoneyEntryWritten,functions:reconcileLedgerSync,functions:onEntityWritten,functions:onRegisterWritten,functions:onExpenseCategoryWritten,functions:onSaleWritten,functions:getEntityStatement,functions:getRegisterStatement,functions:reverseStockMovement --project techno-fluid`. (`onMoneyEntryWritten` now labels a bill payment; the two statements label purchase rows; `reverseStockMovement` refuses purchase lines; the four `on…Written` triggers share money/sync.)

- **Go-live gate:** the first live use is a small test bill, then cancelling it. Confirm in HL that the supplier, "Inventory · Purchased stock" and the Input GST accounts net to zero, and check the 201 body shape. If HL has `GET /transactions/{id}` with legs, prefer storing HL's real legs over the computed ones for the reversal.
