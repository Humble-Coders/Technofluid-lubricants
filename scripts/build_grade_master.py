#!/usr/bin/env python3
"""Build the grade-level product master (gap sheet) for Technofluid.

WHY THIS EXISTS
---------------
docs/Technofluid-Product-Master-DRAFT.xlsx was transcribed from the client's own
price lists, which price per PACK SIZE. The grade is therefore not a column — it
is buried in the free-text product name, and only where his sheet happened to
name it. That leaves four problems:

  1. grade is not a field, so it cannot be ordered, priced or stocked against
  2. some products state no grade at all      (Air Compressor Oil, Refrigeration…)
  3. some rows carry several grades at once   ("Hydraulic 46/68", "Coning 22/32")
  4. some grades the client sells have no SKU (Hydraulic AW 100–460, …)

This rebuilds the master as one row per (product × grade × pack), with Grade as
a real column. Everything derivable from the existing master or from the client's
own website/data sheets is filled in; only what he alone can answer is left blank
and shaded red.

Usage:  python3 scripts/build_grade_master.py [output.xlsx]
Requires: openpyxl
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "docs/Technofluid-Product-Master-DRAFT.xlsx"
CATALOGUE = ROOT / "frontend/content/catalogue.json"
CROSSWALK = ROOT / "frontend/content/catalogue-crosswalk.json"

NEED = PatternFill("solid", fgColor="FFC7CE")     # red   — client must supply
CONFIRM = PatternFill("solid", fgColor="FFEB9C")  # amber — carried over, confirm
HEAD = PatternFill("solid", fgColor="2B2B2B")
NEED_FONT = Font(color="9C0006")
CONFIRM_FONT = Font(color="9C6500")
THIN = Side(style="thin", color="D9D9D9")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

# Grades per series, from the website catalogue and the client's own data sheets.
# Series absent from this map are single-grade and pass through untouched.
GRADES: dict[str, list[str]] = {
    "HYDRAULIC OIL – TECHNOFLUID HYDRAULIC OIL AW (ISO VG 32, 46,68,100,150,220,320 & 460)":
        ["32", "46", "68", "100", "150", "220", "320", "460"],
    "HYDRAULIC OIL – TECHNOFLUID HYDRAULIC OIL HLP": ["32", "46", "68", "100", "150"],
    "HYDRAULIC OIL – TECHNOFLUID HYDRAULIC OIL HVI": ["46", "68", "100"],
    "INDUSTRIAL GEAR OILS – TECHNOFLUID GEAR OILS (ISO VG 100, 150, 220, 320 & 460)":
        ["100", "150", "220", "320", "460"],
    "TECHNOFLUID GEAR LUBE EP SERIES": ["150", "220", "320", "460"],
    "LUBRICATING OILS – TECHNOFLUID LUBE SERIES":
        ["20W-40", "100", "150", "220", "320", "460"],
    "REFRIGERATION OIL – TECHNOFLUID REFRIGERATION OIL (Grades 46 & 68)": ["46", "68"],
    "TEXTILE LUBRICANT – TECHNOFLUID KNITTING OIL": ["22", "32"],
    "TEXTILE LUBRICANT – TECHNOFLUID CONING OIL": ["22", "32"],
    "QUENCHING OIL – TECHNOFLUID Q 39 & QLP 32": ["Q 39", "QLP 32"],
    "4T ENGINE OILS – TECHNOFLUID FOUR-STROKE MOTORCYCLE ENGINE OILS":
        ["20W-40 SM", "20W-40 SN", "15W-50 SN", "20W-50 SM", "10W-30 SM", "10W-40"],
    "AUTOMOTIVE ENGINE OILS – TECHNOFLUID PCMO":
        ["5W-30 SN", "10W-40 SN", "15W-40 CF4", "15W-40 CI4 Plus", "20W-50 SN",
         "15W-50 SN", "20W-50 SM", "CNG 20W-50"],
    "INDUSTRIAL ENGINE OILS – TECHNOFLUID DIESEL ENGINE OILS":
        ["15W-40 CI4 Plus", "15W-40 CF4", "20W-40 CH4", "SAE 40 CF", "SAE 50 CF"],
    "TRANSMISSION FLUID – TECHNOFLUID TQ / ATF": ["TQ / ATF", "CF-4 SAE 30"],
    "AUTOMOTIVE GEAR OILS – TECHNOFLUID EP SERIES":
        ["90 GL4", "140 GL4", "75W90 GL4", "75W90 GL5", "80W90 GL4", "80W90 GL5",
         "85W140 GL4"],
    "GREASE – TECHNOFLUID CALCIUM BASE GREASE": ["C Red Gel", "G Red Gel", "MP3", "SLR"],
    "GREASE – TECHNOFLUID LITHIUM GREASE AP3 & APLR": ["AP3", "APLR"],
    "GREASE – TECHNOFLUID LITHIUM COMPLEX GREASE": ["Red Gel", "Blue Gel", "222"],
    "GREASE – TECHNOFLUID EP GREASE SERIES": ["000", "00", "0", "1", "2", "3"],
    # series created after the crosswalk was generated — no SKUs at all yet
    "COMPRESSOR OILS – TECHNOFLUID SCREW & AIR COMPRESSOR OILS":
        ["Screw 32", "Screw 46", "Screw 68", "Air 100", "Air 150", "Air 220"],
    "TURBINE OIL – TECHNOFLUID TURBINE OILS": ["32", "46", "68", "100"],
    "SPINDLE OIL – TECHNOFLUID SPINDLE OIL": ["2", "5", "10", "12", "22"],
    "CIRCULATING OIL – TECHNOFLUID CIRCULATING OIL":
        ["32", "46", "68", "100", "150", "220", "320", "460"],
    "TRACTOR ENGINE OILS – TECHNOFLUID TRACTOR ENGINE OILS":
        ["15W-40 CH-4", "20W-40 CF"],
    "RUBBER PROCESS OILS – TECHNOFLUID RPO & ELASTOL SERIES":
        ["RPO 710", "Elastol 245", "Elastol 541", "P 165"],
    "WHITE OILS – TECHNOFLUID WHITE OIL": ["12", "32", "100"],
    "MARINE ENGINE OILS – TECHNOFLUID MARINE SERIES":
        ["SAE 30 TBN 12", "SAE 30 TBN 15", "SAE 40 TBN 20", "SAE 40 TBN 30",
         "SAE 40 TBN 40", "15W-40", "Cylinder Oil 50 TBN", "Cylinder Oil 70 TBN",
         "System Oil SAE 30"],
    "FOOD GRADE LUBRICANTS – TECHNOFLUID FOOD GRADE RANGE":
        ["Hydraulic 22", "Hydraulic 32", "Hydraulic 46", "Hydraulic 68",
         "Hydraulic 100", "Gear 220", "Gear 320", "Grease EP 2 (H1)",
         "White Oil 32", "White Oil 46", "White Oil 68", "White Oil 100",
         "Chain Oil 150"],
    "BRAKE FLUIDS – TECHNOFLUID BRAKE FLUID (DOT 3 / DOT 4 / DOT 5)":
        ["DOT 3", "DOT 4", "DOT 5"],
    "SHOCK ABSORBER OILS – TECHNOFLUID SHOCK ABSORBER OIL":
        ["2.5W", "5W", "7.5W", "10W", "15W", "20W", "30W"],
    "REAR AXLE OIL – TECHNOFLUID REAR AXLE OIL": ["SAE 80W", "SAE 90"],
}

EXTRA_FAMILY_SERIES = {
    "Air Compressor Oil": "COMPRESSOR OILS – TECHNOFLUID SCREW & AIR COMPRESSOR OILS",
    "5 liter Air Compressor Oil": "COMPRESSOR OILS – TECHNOFLUID SCREW & AIR COMPRESSOR OILS",
}

PACK_PREFIX = re.compile(
    r"^\s*(\d+(\.\d+)?\s*[xX]\s*)?\d+(\.\d+)?\s*(ml|ML|g|gm|l|L|ltr|litre|liter|Liter|kg|Kg|KG)\b\.?\s*",
)
PACK_WORDS = re.compile(r"\b(bucket|barrel|cane|bottle|pail|tin|box|case|jar|drum)\b", re.I)
SLASH_GRADES = re.compile(r"(\d+(?:\s*/\s*\d+)+)")


def squash(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def clean_family(name: str) -> str:
    s = name
    for _ in range(2):                     # "4 x 3 Kg", "24 x 500 g"
        s = PACK_PREFIX.sub("", s)
    return PACK_WORDS.sub("", s).strip(" -–()")


def detect_grades(name: str, grades: list[str]) -> tuple[list[str], bool]:
    """Grades this master row names, and whether they were listed as "46/68".

    Returns ([], False) when the row states no grade at all. When more than one
    grade matches but they were NOT written as a slash list, the row is genuinely
    ambiguous (e.g. "4T 20W-40" could be the SM or the SN) — the caller flags it
    for the client rather than inventing a SKU per candidate.
    """
    if not grades:
        return [], False
    cleaned = clean_family(name)
    numeric = {g for g in grades if re.fullmatch(r"[\d.]+", g)}

    # several numeric grades in one name: "Hydraulic 46/68", "Oil-32/46/68"
    m = SLASH_GRADES.search(cleaned)
    if m and numeric:
        found = [t.strip() for t in re.split(r"/", m.group(1))]
        hit = [g for g in grades if g in found]
        if len(hit) > 1:
            return hit, True

    tokens = set(re.findall(r"\d+(?:\.\d+)?", cleaned))
    sq = squash(cleaned)
    hits: list[str] = []
    loose: list[str] = []
    for g in grades:
        if g in numeric:
            if g in tokens:
                hits.append(g)
            continue
        if squash(g) in sq:                 # the whole grade is spelled out
            hits.append(g)
            continue
        # "20W-40 SM" may also appear as a bare "20W40" — but "Air 100" must
        # NOT match on the word "Air", so only fall back to a grade-like part.
        parts = re.split(r"[ /]+", g)
        if len(parts) > 1 and any(ch.isdigit() for ch in parts[0]) and squash(parts[0]) in sq:
            loose.append(g)
    if not hits:                            # only the vaguer match applied
        hits = loose
    # prefer the most specific match (20W-40 SN over 20W-40)
    if len(hits) > 1 and not numeric:
        longest = max(len(squash(h)) for h in hits)
        specific = [h for h in hits if len(squash(h)) == longest]
        if len(specific) == 1:
            return specific, False
    return hits, False


COLUMNS = ["SKU", "Product", "Grade", "Pack", "Pack qty", "Base unit", "Price per",
           "Dealer price", "Distributor price", "GST %", "Visible to",
           "Website series", "Action needed", "Original master row"]


def main() -> None:
    out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs/Technofluid-Product-Master-GRADES.xlsx"

    sheet = openpyxl.load_workbook(MASTER, read_only=True)["Product Master"]
    raw = list(sheet.iter_rows(values_only=True))
    hdr = list(raw[0])
    master = [dict(zip(hdr, r)) for r in raw[1:] if r and r[0]]

    catalogue = {p["title"]: p for p in json.loads(CATALOGUE.read_text())["products"]}
    fam2series = dict(EXTRA_FAMILY_SERIES)
    crosswalk_status: dict[str, str] = {}
    for s in json.loads(CROSSWALK.read_text())["series"]:
        crosswalk_status[s["catalogueTitle"]] = s.get("status", "")
        for f in s.get("masterFamilies", []):
            fam2series.setdefault(f["product"], s["catalogueTitle"])

    def product_name(series: str | None, fallback: str) -> str:
        p = catalogue.get(series or "")
        if not p:
            return fallback
        # "TECHNOFLUID HYDRAULIC OIL AW (ISO VG 32, 46…)" -> "HYDRAULIC OIL AW".
        # The bracketed part is the grade list, which is now its own column.
        name = p["displayName"].replace("TECHNOFLUID ", "").strip()
        return re.sub(r"\s*\((?:ISO VG|Grades|NLGI|SAE|For |Water Resistant)[^)]*\)\s*$", "", name, flags=re.I).strip()

    out: list[dict] = []
    stats: dict[str, int] = defaultdict(int)
    seen: dict[str, set[tuple[str, str]]] = defaultdict(set)   # series -> {(grade, pack)}
    packs_seen: dict[str, dict[str, dict]] = defaultdict(dict)  # series -> pack -> sample row
    audit: dict[str, set[str]] = defaultdict(set)

    for d in master:
        family = str(d["Product"])
        series = fam2series.get(family)
        grades = GRADES.get(series or "", [])
        found, listed_together = detect_grades(family, grades)
        pack = str(d["Orderable unit"])
        name = product_name(series, family)
        if series:
            packs_seen[series][pack] = d

        if len(found) > 1 and listed_together:
            for g in found:
                out.append(row_from(d, name, g, series,
                                    "SPLIT out of a combined SKU — confirm the price is right for this grade",
                                    confirm={"Dealer price", "Distributor price"}))
                seen[series].add((g, pack)); audit[series].add(g)
            stats["split"] += 1
        elif len(found) == 1:
            out.append(row_from(d, name, found[0], series, ""))
            seen[series].add((found[0], pack)); audit[series].add(found[0])
            stats["ok"] += 1
        elif len(found) > 1:
            out.append(row_from(
                d, name, "", series,
                f"WHICH GRADE? your wording matches more than one: {' or '.join(found)}",
                need={"Grade"}))
            stats["ambiguous"] += 1
        elif grades:
            out.append(row_from(d, name, "", series,
                                "GRADE NOT STATED in your price list — which grade is this price for?",
                                need={"Grade"}))
            stats["nograde"] += 1
        else:
            out.append(row_from(d, name, "—", series, ""))
            stats["single"] += 1

    # grades the client sells that have no SKU at any pack
    for series, grades in GRADES.items():
        if series not in packs_seen:
            continue
        for g in grades:
            for pack, sample in packs_seen[series].items():
                if (g, pack) in seen[series]:
                    continue
                out.append(row_from(sample, product_name(series, ""), g, series,
                                    "MISSING GRADE — do you sell this grade in this pack? If yes, give the price",
                                    need={"Dealer price", "Distributor price"}, new=True))
                stats["missing_grade"] += 1

    # products on the website with no SKUs at all
    for title, p in catalogue.items():
        if title in packs_seen:
            continue
        on_request = p.get("aspirational") or crosswalk_status.get(title) == "available-on-request"
        action = ("AVAILABLE ON REQUEST on your website — if you now sell it, give packs and prices"
                  if on_request else
                  "NOT IN MASTER — sold on the website but has no SKU. Give packs and prices.")
        for g in GRADES.get(title, ["—"]):
            out.append({
                "SKU": "", "Product": product_name(title, ""), "Grade": g, "Pack": "",
                "Pack qty": "", "Base unit": "", "Price per": "", "Dealer price": "",
                "Distributor price": "", "GST %": 18, "Visible to": "",
                "Website series": title,
                "Action needed": action,
                "Original master row": "",
                "_need": {"Pack", "Pack qty", "Base unit", "Price per", "Dealer price",
                          "Distributor price", "Visible to"},
                "_confirm": set(), "_new": True,
            })
            stats["new_series"] += 1

    write(out_path, out, stats, len(master))

    print(f"wrote {out_path}\n  old master {len(master)} rows -> gap sheet {len(out)} rows")
    for k in ("ok", "single", "split", "nograde", "missing_grade", "new_series"):
        print(f"    {k:14s} {stats[k]}")
    print("\nAUDIT — grades found in the master per product:")
    for series, grades in sorted(GRADES.items()):
        if series not in packs_seen:
            continue
        miss = [g for g in grades if g not in audit[series]]
        print(f"  {product_name(series,'')[:34]:36s} have {len(audit[series])}/{len(grades)}"
              + (f"   MISSING: {', '.join(miss)}" if miss else ""))


def row_from(d: dict, name: str, grade: str, series, action: str, *,
             need: set[str] | None = None, confirm: set[str] | None = None,
             new: bool = False) -> dict:
    need = need or set()
    return {
        "SKU": "" if new else d.get("SKU"),
        "Product": name,
        "Grade": grade,
        "Pack": d.get("Orderable unit"),
        "Pack qty": d.get("Pack qty"),
        "Base unit": d.get("Base unit"),
        "Price per": d.get("Price per"),
        "Dealer price": "" if "Dealer price" in need else d.get("Dealer price"),
        "Distributor price": "" if "Distributor price" in need else d.get("Distributor price"),
        "GST %": d.get("GST %"),
        "Visible to": d.get("Visible to"),
        "Website series": series or "",
        "Action needed": action,
        "Original master row": "" if new else d.get("Product"),
        "_need": need, "_confirm": confirm or set(), "_new": new,
    }


def write(path: Path, rows: list[dict], stats: dict, old: int) -> None:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Read me"
    intro = [
        ("Technofluid product master — one row per grade", True),
        ("", False),
        ("Why we rebuilt it", True),
        ("Your current master has one SKU per PACK SIZE, because it was built from your price", False),
        ("lists — and those price by pack. The grade was only captured where your sheet happened", False),
        ("to write it into the product name. So today: some products have a SKU per grade, some", False),
        ("have none at all, and a few carry two or three grades in a single SKU (for example", False),
        ("\"Hydraulic 46/68\" and \"Coning Oil 22/32\").", False),
        ("", False),
        ("This sheet makes GRADE a proper column, one row per grade per pack.", True),
        ("", False),
        ("The colours", True),
        ("RED — we need this from you. Nobody can work it out from what we already have.", False),
        ("AMBER — we carried your existing value over; please confirm it is right for that grade.", False),
        ("WHITE — straight from your existing master, unchanged.", False),
        ("", False),
        ("What to do", True),
        ("1. Filter the 'Action needed' column — every row that needs you is labelled there.", False),
        ("2. Fill the red cells.", False),
        ("3. Delete any row for a grade or pack you do not actually sell.", False),
        ("4. Add anything we have missed at the bottom.", False),
        ("5. Send it back — we load it into the website and the ordering system.", False),
        ("", False),
        ("The last column keeps your original wording for every row, so you can cross-check.", False),
        ("", False),
        ("Where the rows come from", True),
        (f"Your master today: {old} rows.    This sheet: {len(rows)} rows.", True),
        (f"   {stats['ok']:>4}  grade was already named — nothing to do", False),
        (f"   {stats['single']:>4}  single-grade product — nothing to do", False),
        (f"   {stats['split']:>4}  rows carried 2+ grades and were split apart", False),
        (f"   {stats['nograde']:>4}  a price exists but no grade was ever stated", False),
        (f"   {stats['missing_grade']:>4}  grade you sell that has no SKU at that pack", False),
        (f"   {stats['new_series']:>4}  product on your website with no SKU at all", False),
    ]
    for i, (text, bold) in enumerate(intro, start=1):
        c = ws.cell(row=i, column=1, value=text)
        if bold:
            c.font = Font(bold=True, size=13 if i == 1 else 11)
    ws.column_dimensions["A"].width = 96
    ws.cell(row=13, column=1).fill = NEED
    ws.cell(row=14, column=1).fill = CONFIRM

    ms = wb.create_sheet("Product Master (grades)")
    for j, name in enumerate(COLUMNS, start=1):
        c = ms.cell(row=1, column=j, value=name)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = HEAD
        c.alignment = Alignment(vertical="center", wrap_text=True)
    ms.freeze_panes = "D2"
    ms.row_dimensions[1].height = 30

    for i, r in enumerate(rows, start=2):
        for j, name in enumerate(COLUMNS, start=1):
            c = ms.cell(row=i, column=j, value=r.get(name, ""))
            c.border = BORDER
            c.alignment = Alignment(vertical="center",
                                    wrap_text=name in ("Action needed", "Original master row"))
            if name in r["_need"]:
                c.fill, c.font = NEED, NEED_FONT
            elif name in r["_confirm"]:
                c.fill, c.font = CONFIRM, CONFIRM_FONT
        if r["Action needed"]:
            ms.cell(row=i, column=COLUMNS.index("Action needed") + 1).font = Font(
                bold=True, color="9C0006" if r["_need"] else "9C6500")

    widths = {"SKU": 22, "Product": 30, "Grade": 17, "Pack": 17, "Pack qty": 9,
              "Base unit": 10, "Price per": 11, "Dealer price": 12,
              "Distributor price": 14, "GST %": 8, "Visible to": 12,
              "Website series": 40, "Action needed": 54, "Original master row": 38}
    for j, name in enumerate(COLUMNS, start=1):
        ms.column_dimensions[get_column_letter(j)].width = widths.get(name, 16)
    ms.auto_filter.ref = f"A1:{get_column_letter(len(COLUMNS))}{len(rows) + 1}"
    wb.save(path)


if __name__ == "__main__":
    main()
