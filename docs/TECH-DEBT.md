# Tech Debt — Public Marketing Site

Known limitations / deferred decisions in the public site's data + showcasing logic.
Not bugs — deliberate trade-offs or gaps to revisit. Keep this list current.

---

## TD-1 — Re-importing the master does NOT fully update the public site

**What:** The public site reads only **pack sizes** live from Firestore (`public_catalog`). Everything else a visitor sees — product **names, descriptions, spec tables, which products exist as "series," categories** — comes from **static repo files** (`frontend/content/catalogue.json`, `frontend/content/catalogue-crosswalk.json`, `frontend/content/product-images.json`). A master re-upload only rewrites `public_catalog`; it does **not** touch those static files.

**Why it bites:**
- ✅ Changing a pack size on an existing family → updates live.
- ⚠️ **Renaming** a family → its `productKey` (slug of the name) changes, so the crosswalk (which points to the old name) no longer resolves → **that product's pack sizes silently disappear** from its page, and the renamed family isn't linked to any series.
- ⚠️ **New products / grade splits** → exist in `public_catalog` but nothing in the static catalogue/crosswalk references them → **they don't appear on the site at all.**

**Concrete trigger (pending):** Gaurav's 17 Jul 2026 changes — rename `Transmission SAE 30` → `TRANSMISSION FLUID CF4 SAE 30`; split `Knitting oil 22` vs `32` (also Coning, Warping, Hydraulic 46 vs 68); add grades `Gear EP 100`, `Gear Lube EP 100`, `Lube 100`. Applying these needs **both** a master re-import **and** matching edits to `catalogue.json` + `catalogue-crosswalk.json` (+ photos). A re-import alone would break the renamed ones.

**Fix options (future):** either (a) generate the crosswalk/catalogue from the master at import time instead of hand-maintaining static files, or (b) a documented checklist: whenever the master's family names change, update the crosswalk (and catalogue.json / images) in the same change. Today it's manual and easy to forget.

---

## TD-2 — The 36 "series" grouping is static and can drift from the master

**What:** The 36 product **series** (the clean, page-level groupings) live in `catalogue.json`, extracted from Gaurav's 2026 Catalogue Word doc — **not** derived from the master. The crosswalk manually maps each series → its master families.

**Why it bites:** The master (what we sell) and the catalogue (how we present it) are two separate sources that must be kept in sync by hand. If the master gains/loses products or renames families, the catalogue + crosswalk won't know unless someone edits them. Over time they can drift.

**Fix options (future):** treat the master as the single source and generate the series/crosswalk from it, or add a reconciliation check that flags master families not covered by any series (and series pointing at families that no longer exist).

---

## TD-3 — Product pages don't show a per-variant (grade × pack-size) breakdown

**What:** A product page (e.g. Hydraulic Oil HLP) shows: the shared description/benefits, a spec table with **grades as columns** (VG 32/46/68…), and pack sizes **merged into one "available in" list** (union across all its SKUs). It does **not** show which specific grade comes in which specific pack size.

**Why:** Deliberate — the public site is a **price-free showcase, not a shop** (locked UX decision: browse by series, show real pack sizes, no per-SKU ordering). Grades are visible in the spec table; exact grade↔pack mapping was intentionally left out.

**Revisit if:** Gaurav/buyers need variant-level clarity (a "grade × pack size" table per product). Doable enhancement, but a new product decision — currently out of scope.

---

_Last updated: 24 Jul 2026._
