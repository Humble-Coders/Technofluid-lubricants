/**
 * Adds Gaurav's raw materials and consumables (Sheet1), premixes (Sheet2) and blends
 * (Sheet3), cleaned by Ansh in data/master/*.json, to the LOCAL emulators as stock
 * items — test data only. Premixes and blends come with their recipes and start as
 * "mixed on the spot" (Sharnya, 23 Oct 2026); a blend with no recipe (brake fluid —
 * a bought-in product) is skipped.
 *
 * Safe by construction: it only talks to 127.0.0.1 and the `demo-technofluid` project,
 * which Firebase refuses to connect to the real cloud. It writes stockItems only —
 * never products, recipes or anything the website reads.
 *
 * Re-runnable: an item already there (same recipe code, or same name for a
 * consumable) is kept — only its missing code, other names, density or unit are
 * filled in, and a premix/blend's recipe is updated unless it was changed in the app.
 * On-hand stock is never touched. Items the sheet gives no unit for are
 * added with none ("Unit not set") until an Admin sets it (Sharnya, 23 Oct 2026).
 *
 *   npm run emulators      (in one terminal)
 *   npm run seed:stock     (in another)
 */
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

const db = getFirestore(initializeApp({ projectId: "demo-technofluid" }));
const read = (file) => JSON.parse(readFileSync(new URL(`../data/master/${file}`, import.meta.url), "utf8"));
const CODE_RE = /^[a-z0-9][a-z0-9 .()\-]{0,39}$/;
const UNITS = ["L", "kg", "piece"];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const by = { uid: "seed", name: "Test data import" };
const now = FieldValue.serverTimestamp();

const recipeOf = (r) => (r.lines ?? []).map((l) => `${String(l.code).trim().toLowerCase()}/${l.pctBp == null ? "" : l.pctBp / 100}`);
const rows = [
  ...read("raw-materials.json").map((r) => ({ ...r, kind: "raw_material" })),
  ...read("consumables.json").map((r) => ({ ...r, kind: "consumable" })),
  ...read("premixes.json").map((r) => ({ ...r, kind: "premix", recipe: recipeOf(r) })),
  ...read("blends.json").map((r) => ({ ...r, kind: "blend", recipe: recipeOf(r) })),
];
const MIX = ["premix", "blend"];
const PREFIX = { raw_material: "rm", consumable: "cons", premix: "pm", blend: "bl" };
const sameList = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

const existing = (await db.collection("stockItems").get()).docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .filter((d) => d.deleted !== true && d.kind !== "product_pool");

const report = { created: [], filledIn: [], unchanged: [], noUnit: [], skipped: [] };

for (const r of rows) {
  const name = String(r.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const coded = r.kind === "raw_material" || MIX.includes(r.kind);
  const code = coded ? String(r.code ?? "").trim().toLowerCase().replace(/\s+/g, " ") : null;
  if (!name) {
    report.skipped.push(`${r.source ?? "?"}: no name`);
    continue;
  }
  if (MIX.includes(r.kind) && r.recipe.length === 0) {
    report.skipped.push(`${name}: no recipe (bought in?) — not added as a ${r.kind}`);
    continue;
  }
  if (coded && !CODE_RE.test(code)) {
    report.skipped.push(`${name}: code "${code}" isn't a valid recipe code`);
    continue;
  }
  const unit = UNITS.includes(r.baseUnit) ? r.baseUnit : null;
  const density = typeof r.densityKgPerL === "number" && r.densityKgPerL >= 0.3 && r.densityKgPerL <= 3 ? r.densityKgPerL : null;
  const aliases = [...new Set((r.aliases ?? []).map((a) => String(a).trim().slice(0, 40)).filter((a) => a && a !== code && a !== name))].slice(0, 20);
  if (!unit) report.noUnit.push(name);

  const match =
    existing.find((e) => coded && e.code === code) ??
    existing.find((e) => e.kind === r.kind && e.nameLower === name.toLowerCase());

  if (match) {
    const hasHistory = Boolean(match.lastMovementAt) || (match.onHandMilli ?? 0) !== 0;
    const patch = {};
    if (code && !match.code) patch.code = code;
    const mergedAliases = [...new Set([...(match.aliases ?? []), ...aliases])].slice(0, 20);
    if (mergedAliases.length !== (match.aliases ?? []).length) patch.aliases = mergedAliases;
    if (density !== null && match.densityKgPerL == null) patch.densityKgPerL = density;
    if (unit && !UNITS.includes(match.baseUnit) && !hasHistory) patch.baseUnit = unit;
    if (MIX.includes(r.kind) && !(match.appEdited ?? []).includes("recipe") && !sameList(match.recipe ?? [], r.recipe)) {
      patch.recipe = r.recipe;
    }
    if (MIX.includes(r.kind) && !match.stockMode) patch.stockMode = "breakDown";
    if (Object.keys(patch).length === 0) {
      report.unchanged.push(name);
      continue;
    }
    await db.doc(`stockItems/${match.id}`).update({ ...patch, updatedAt: now, updatedBy: by });
    report.filledIn.push(`${name} (${Object.keys(patch).join(", ")})`);
    continue;
  }

  const id = `${PREFIX[r.kind]}-${slug(code || name)}`;
  await db.doc(`stockItems/${id}`).create({
    kind: r.kind,
    name,
    nameLower: name.toLowerCase(),
    code,
    baseUnit: unit,
    densityKgPerL: density,
    aliases,
    productKey: null,
    ...(MIX.includes(r.kind) ? { recipe: r.recipe, recipeAlternates: [], stockMode: "breakDown" } : {}),
    onHandMilli: 0,
    lastMovementAt: null,
    deleted: false,
    source: r.source ?? null,
    createdAt: now,
    createdBy: by,
    updatedAt: now,
    updatedBy: by,
  });
  existing.push({ id, kind: r.kind, code, nameLower: name.toLowerCase(), aliases, baseUnit: unit, densityKgPerL: density });
  report.created.push(name);
}

const kinds = {};
for (const r of rows) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
console.log(`Stock items from Gaurav's Sheet1/2/3 → local emulator only (${Object.entries(kinds).map(([k, v]) => `${v} ${k}`).join(", ")} in the files)`);
console.log(`  added:          ${report.created.length}`);
console.log(`  filled in:      ${report.filledIn.length}${report.filledIn.length ? ` — ${report.filledIn.join("; ")}` : ""}`);
console.log(`  already there:  ${report.unchanged.length}`);
console.log(`  no unit yet:    ${report.noUnit.length}${report.noUnit.length ? ` — ${report.noUnit.join(", ")} (an Admin sets it on Live stock → Edit)` : ""}`);
console.log(`  skipped:        ${report.skipped.length}${report.skipped.length ? ` — ${report.skipped.join("; ")}` : ""}`);
