#!/usr/bin/env python3
"""
Step 3 — structure marketing + industries content.

Reads the verbatim source (docs/_source-gaurav-whatsapp-2026-03-31.txt) and the
step-2 catalogue crosswalk, and emits:
  - docs/company-copy.json        (brand line, about, why-choose-us, commitment)
  - docs/industries-2026.json     (28 industries + automotive-oils group; each
                                   lubricant type linked to a real catalogue
                                   series where a confident match exists)
  - docs/industries-2026.md       (human-readable review copy)

Linking is deliberately conservative: only high-confidence keyword matches link
to a catalogue series. Everything else is left unmatched (site renders it as
"available on request"). Nothing is invented.
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "_source-gaurav-whatsapp-2026-03-31.txt"
CATALOGUE = ROOT / "docs" / "catalogue-2026.json"

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

# ---- parse the verbatim source -------------------------------------------
raw = SRC.read_text(encoding="utf-8")

# company copy
def grab(label, nxt):
    m = re.search(rf"{label}:\n(.*?)\n\n(?={nxt})", raw, re.S)
    return m.group(1).strip() if m else ""

brand_line = grab("BRAND LINE", "ABOUT")
about = grab("ABOUT", "WHY CHOOSE US")
why_block = grab("WHY CHOOSE US", "OUR COMMITMENT")
commitment = grab("OUR COMMITMENT", "===")

# why-choose-us: intro line, bullet reputation points, closing line
why_lines = [l.strip() for l in why_block.splitlines() if l.strip()]
why_intro = why_lines[0]
why_points = [l[2:].strip() for l in why_lines if l.startswith("- ")]
why_closing = why_lines[-1] if not why_lines[-1].startswith("- ") else ""

company = {
    "brandLine": brand_line,
    "tagline": "Decimating friction since 1971",   # confirmed by Ansh 2026-07-03 as the real client tagline
    "certification": "JAS-ANZ ISO 9001:2015",   # source typo 'JAS-ANS' -> JAS-ANZ (Joint Accreditation System of Australia & New Zealand)
    "since": 1971,
    "parentCompany": "Lube Chem. Industries",
    "about": about,
    "whyChooseUs": {"intro": why_intro, "points": why_points, "closing": why_closing},
    "ourCommitment": commitment,
    "_sourceNote": "Copy verbatim from Gaurav Verma WhatsApp, 31 Mar 2026. Tagline confirmed separately by Ansh. Certification corrected JAS-ANS->JAS-ANZ (about-prose keeps the verbatim wording).",
}

# industries: split on '### ' headers, honoring the three top-level sections
industries, automotive = [], None
current_section = None
for line in raw.splitlines():
    if line.startswith("=== INDUSTRIES"):
        current_section = "industries"; continue
    if line.startswith("=== AUTOMOTIVE"):
        current_section = "automotive"; continue
    if line.startswith("### "):
        entry = {"name": line[4:].strip(), "types": []}
        if current_section == "automotive":
            automotive = entry
        else:
            industries.append(entry)
    elif line.startswith("- ") and 'entry' in dir() and industries:
        target = automotive if current_section == "automotive" else industries[-1]
        target["types"].append(line[2:].strip())

# ---- load catalogue series for matching ----------------------------------
cat = json.loads(CATALOGUE.read_text(encoding="utf-8"))
series = cat["products"]
by_title = {s["title"]: s for s in series}

def find(substr):
    for s in series:
        if substr.lower() in s["title"].lower():
            return s["title"]
    return None

# ordered keyword rules: (regex on normalized type, catalogue-series title).
# First match wins. Order matters (specific before generic).
S = find
NONE = "__NONE__"   # sentinel: force-unlinked (distinct product not in catalogue)
RULES = [
    # --- force-unlinked guards (chemistry/grade we don't make) come first ---
    (r"fire.?resistant|aviation grade|synthetic hydraulic|skydrol|phosphate ester", NONE),
    (r"food.?grade|pharma.?grade|\(h1\)",           NONE),
    (r"moly|mos|calcium sulfonate|high.?temp",      NONE),
    (r"neat cutting",                    S("NEAT CUTTING OIL")),
    (r"semi.?synthetic cutting",         S("SEMI SYNTHETIC")),
    (r"(water.?soluble|soluble oil|emulsion coolant).*cut|cutting oil.*emulsion|water-soluble cutting", S("METAL WORKING")),
    (r"^cutting oil|cutting fluid",      S("METAL WORKING")),
    (r"quench",                          S("QUENCHING")),
    (r"heat transfer|thermic fluid",     S("HEAT TRANSFER")),
    (r"refrigerat",                      S("REFRIGERATION")),
    (r"rust preventive|rp oil|preservative oil", S("RUST PREVENTIVE")),
    (r"transformer|insulating",          S("INSULATING OIL")),
    (r"knitting",                        S("KNITTING")),
    (r"coning",                          S("CONING")),
    (r"warping",                         S("WARPING")),
    (r"submersible|electrical motor",    S("SUBMERSIBLE")),
    (r"rotavator|agricultural gear",     S("ROTAVATOR")),
    (r"coolant|antifreeze",              S("COOLANT")),
    (r"\butto\b|wet brake|multipurpose tractor|\bmto\b", S("UTTO")),
    (r"transmission fluid|\batf\b|to-4|\btq\b", S("TRANSMISSION FLUID")),
    (r"chain (oil|lubricant)|conveyor (oil|lubricant)|bar oil", S("CHAIN LUBRICANT")),
    (r"open gear|girth gear",            S("GIRTH GEAR")),
    (r"gear oil.*(80w|85w|75w|manual|axle|differential)|automotive gear|\bep – 80|\bep 80", S("AUTOMOTIVE GEAR")),
    (r"ep gear|industrial gear|gear oil.*iso|gear lube", S("INDUSTRIAL GEAR")),
    (r"engine oil.*(hdeo|15w-40|20w-40|ci4|cf4|diesel)|tractor engine|marine engine|diesel engine", S("INDUSTRIAL ENGINE")),
    (r"4t|motorcycle|two.?wheeler engine", S("4T ENGINE")),
    (r"engine oil.*(petrol|pcmo|sn |5w30|20w50)|automotive engine", S("AUTOMOTIVE ENGINE")),
    (r"hydraulic oil.*hlp|\bhlp\b",      S("HYDRAULIC OIL HLP")),
    (r"hydraulic oil.*(hvi|high.?performance|heavy.?duty)", S("HYDRAULIC OIL HVI")),
    (r"hydraulic oil|hydraulic",         S("HYDRAULIC OIL AW")),
    (r"circulating|lubricating oil|paper machine|bearing oil|machine oil", S("LUBE SERIES")),
    (r"lithium complex",                 S("LITHIUM COMPLEX")),
    (r"\bep.?grease|grease ep",          S("EP GREASE")),
    (r"wheel bearing|water.?resistant grease|wr-2", S("WR-2")),
    (r"lithium",                         S("LITHIUM GREASE")),
    (r"calcium.?based|calcium base|multipurpose grease|\bmp3\b|chassis", S("CALCIUM BASE GREASE")),
    (r"rolling mill oil|rolling oil|cold rolling|roll perfect|skin pass|temper rolling", S("ROLL PERFECT 22")),
    (r"pvc|process oil|white oil|rubber processing|rpo|plasticizer", S("PVC OIL")),
]
RULES = [(re.compile(p, re.I), t) for p, t in RULES]

def match_type(t):
    for rx, title in RULES:
        if title and rx.search(t):
            return None if title == NONE else title
    return None

# apply matching
def enrich(entry):
    out = []
    for t in entry["types"]:
        title = match_type(t)
        out.append({"label": t, "series": title, "seriesSlug": slug(title) if title else None})
    entry["types"] = out
    return entry

for e in industries:
    enrich(e)
if automotive:
    enrich(automotive)

# ---- coverage summary ----------------------------------------------------
all_types = [x for e in industries for x in e["types"]] + (automotive["types"] if automotive else [])
matched = sum(1 for x in all_types if x["series"])
unmatched_labels = sorted({x["label"] for x in all_types if not x["series"]})

industries_doc = {
    "source": "Gaurav Verma WhatsApp, 31 Mar 2026",
    "generatedFrom": {"content": str(SRC.relative_to(ROOT)), "catalogue": str(CATALOGUE.relative_to(ROOT))},
    "summary": {
        "industries": len(industries),
        "totalTypeMentions": len(all_types),
        "linkedToSeries": matched,
        "unlinked": len(all_types) - matched,
        "distinctUnlinkedTypes": len(unmatched_labels),
    },
    "industries": [{"name": e["name"], "slug": slug(e["name"]), "types": e["types"]} for e in industries],
    "automotiveOils": {"name": automotive["name"], "slug": slug(automotive["name"]), "types": automotive["types"]} if automotive else None,
}

(ROOT / "docs" / "company-copy.json").write_text(json.dumps(company, ensure_ascii=False, indent=2), encoding="utf-8")
(ROOT / "docs" / "industries-2026.json").write_text(json.dumps(industries_doc, ensure_ascii=False, indent=2), encoding="utf-8")

# markdown review copy
md = ["# Industries We Serve — structured content", "",
      f"_Source: {industries_doc['source']}. {len(industries)} industries + Automotive Oils group._", "",
      f"**Linking:** {matched}/{len(all_types)} lubricant-type mentions map to a real catalogue series; "
      f"{len(all_types)-matched} are unlinked (render as *available on request*).", "",
      "Legend: **[series]** = links to a catalogue series · _(no link)_ = not in current catalogue.", ""]
def render(e):
    md.append(f"### {e['name']}")
    for x in e["types"]:
        if x["series"]:
            md.append(f"- {x['label']} → **{by_title[x['series']]['displayName']}**")
        else:
            md.append(f"- {x['label']} _(no link)_")
    md.append("")
for e in industries:
    render(e)
md.append("## Automotive Oils (product group)")
md.append("")
if automotive:
    render(automotive)
md += ["## Distinct unlinked lubricant types (candidates for 'available on request')", ""]
md += [f"- {l}" for l in unmatched_labels]
(ROOT / "docs" / "industries-2026.md").write_text("\n".join(md), encoding="utf-8")

print(f"industries: {len(industries)}  type-mentions: {len(all_types)}  linked: {matched}  unlinked: {len(all_types)-matched}")
print(f"distinct unlinked types: {len(unmatched_labels)}")
print("\nUnlinked (distinct):")
for l in unmatched_labels:
    print("  -", l)
