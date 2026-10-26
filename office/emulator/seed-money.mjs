/**
 * Sample money for the LOCAL emulators — test data only. Run after `npm run seed:entities`.
 *
 *  - "Cash in hand", "Bank" and "HDFC Current", each with an opening balance;
 *  - the starter expense categories;
 *  - ~10 entries across every route (received, paid, transfer, balance move, expenses —
 *    one with a GST bill — a correction, and a reversal).
 *
 * Everything is written as PENDING; the Functions emulator posts it to the fake Humble
 * Ledger exactly as the app's saves do. Safe by construction (127.0.0.1, demo project);
 * re-runnable (fixed ids — existing ones are left alone).
 *
 *   npm run emulators      (in one terminal; must include Functions)
 *   npm run seed:entities  then  npm run seed:money
 */
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const db = getFirestore(initializeApp({ projectId: "demo-technofluid" }));
const by = { uid: "seed", name: "Test data import" };
const now = FieldValue.serverTimestamp();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const daysAgo = (n) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitSynced(path, what) {
  for (let i = 0; i < 100; i++) {
    const d = (await db.doc(path).get()).data();
    if (d?.syncStatus === "SYNCED") return d;
    if (d?.syncStatus === "FAILED") throw new Error(`${what} couldn't be saved to the fake books: ${d.hlSyncError}`);
    await sleep(300);
  }
  throw new Error(`${what} isn't in the fake books yet — is the Functions emulator running?`);
}

// Customers & suppliers from seed:entities.
const P = {
  panipat: "seed-panipat-tractors",
  karnal: "seed-karnal-auto",
  baseOils: "seed-haryana-base-oils",
  kurukshetra: "seed-kurukshetra-lubes",
  rajdhani: "seed-delhi-retail",
  yamuna: "seed-yamuna-drums",
};
const names = {};
for (const [k, id] of Object.entries(P)) {
  const d = (await db.doc(`entities/${id}`).get()).data();
  if (!d) {
    console.log("Run `npm run seed:entities` first — the sample customers & suppliers are missing.");
    process.exit(1);
  }
  names[k] = d.name;
  await waitSynced(`entities/${id}`, d.name);
}

// Registers, with openings.
const REGISTERS = [
  { id: "default-cash", name: "Cash in hand", kind: "CASH", displayOrder: 0, opening: 2_500_000 },
  { id: "default-bank", name: "Bank", kind: "BANK", displayOrder: 1, opening: 15_000_000 },
  { id: "seed-hdfc-current", name: "HDFC Current", kind: "BANK", displayOrder: 2, opening: 32_000_050 },
];
for (const r of REGISTERS) {
  const ref = db.doc(`registers/${r.id}`);
  if ((await ref.get()).exists) continue;
  await ref.set({
    name: r.name,
    nameLower: r.name.toLowerCase(),
    kind: r.kind,
    isActive: true,
    displayOrder: r.displayOrder,
    opening: { amountPaise: r.opening, asOf: "2026-04-01", posted: false, hlTxnId: null },
    hlAccountId: null,
    syncStatus: "PENDING",
    hlSyncError: null,
    syncAttempts: 0,
    deleted: false,
    createdBy: by,
    updatedBy: by,
    createdAt: now,
    updatedAt: now,
  });
}

// Starter expense categories.
const CATEGORIES = ["Freight", "Electricity", "Salaries & wages", "Rent", "Repairs & maintenance", "Fuel", "Office & stationery", "Bank charges", "Other"];
const catId = (name) => `seed-cat-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
for (const name of CATEGORIES) {
  const ref = db.doc(`expenseCategories/${catId(name)}`);
  if ((await ref.get()).exists) continue;
  await ref.set({ name, nameLower: name.toLowerCase(), isActive: true, hlAccountId: null, syncStatus: "PENDING", hlSyncError: null, syncAttempts: 0, deleted: false, createdBy: by, updatedBy: by, createdAt: now, updatedAt: now });
}
for (const r of REGISTERS) await waitSynced(`registers/${r.id}`, r.name);
for (const c of ["Freight", "Electricity", "Salaries & wages"]) await waitSynced(`expenseCategories/${catId(c)}`, c);

// Entries.
const party = (k) => ({ kind: "PARTY", entityId: P[k], name: names[k] });
const reg = (id) => {
  const r = REGISTERS.find((x) => x.id === id);
  return { kind: r.kind, registerId: r.id, name: r.name };
};
const cat = (name) => ({ kind: "EXPENSE", categoryId: catId(name), name });
const side = (x) => (x.kind === "PARTY" ? x.entityId : x.kind === "EXPENSE" ? x.categoryId : x.kind === "ADJUSTMENT" ? "ADJUSTMENT" : x.registerId);
const kurukshetra = (await db.doc(`entities/${P.kurukshetra}`).get()).data();

const ENTRIES = [
  ["seed-m01", party("panipat"), reg("default-cash"), 1_500_000, 9, "Cash at the counter"],
  ["seed-m02", party("karnal"), reg("seed-hdfc-current"), 2_500_000, 8, "RTGS"],
  ["seed-m03", reg("seed-hdfc-current"), party("baseOils"), 6_000_000, 7, "Part payment for base oil"],
  ["seed-m04", reg("default-cash"), reg("default-bank"), 1_000_000, 6, "Deposited at the branch"],
  ["seed-m05", party("kurukshetra"), party("panipat"), 500_000, 5, "Agreed set-off"],
  ["seed-m06", reg("default-cash"), cat("Freight"), 236_000, 4, "Drums to Panipat", {
    supplier: { entityId: P.kurukshetra, name: kurukshetra.name, gstin: kurukshetra.gstin, stateCode: "06" },
    billNo: "KL-118",
    billDate: daysAgo(4),
    rateBp: 1800,
    taxablePaise: 200_000,
    cgstPaise: 18_000,
    sgstPaise: 18_000,
    igstPaise: 0,
  }],
  ["seed-m07", reg("seed-hdfc-current"), cat("Electricity"), 845_000, 3, "October bill"],
  ["seed-m08", reg("default-bank"), cat("Salaries & wages"), 4_500_000, 2, "October salaries"],
  ["seed-m09", { kind: "ADJUSTMENT" }, party("rajdhani"), 120_000, 1, "Old balance from the paper ledger", null, true],
  ["seed-m10", reg("default-cash"), party("yamuna"), 300_000, 1, "Empty drums"],
];
for (const [id, from, to, amountPaise, ago, note, gst = null, isCorrection = false] of ENTRIES) {
  const ref = db.doc(`moneyEntries/${id}`);
  if ((await ref.get()).exists) continue;
  await ref.set({
    from, to, sideIds: [side(from), side(to)], amountPaise, businessDay: daysAgo(ago), note, isCorrection, gst,
    reversesEntryId: null, reversedByEntryId: null, syncStatus: "PENDING", hlTxnId: null, hlLegs: null, hlSyncError: null, syncAttempts: 0,
    deleted: false, createdBy: by, createdAt: now, updatedAt: now,
  });
}
for (const [id] of ENTRIES) await waitSynced(`moneyEntries/${id}`, id);

// One reversal: the electricity bill was entered twice — reverse seed-m07.
const mirror = db.doc("moneyEntries/seed-m11");
if (!(await mirror.get()).exists) {
  const o = (await db.doc("moneyEntries/seed-m07").get()).data();
  await db.runTransaction(async (tx) => {
    tx.set(mirror, {
      from: o.to, to: o.from, sideIds: [side(o.to), side(o.from)], amountPaise: o.amountPaise, businessDay: today, note: "Reversal: entered twice",
      isCorrection: false, gst: null, reversesEntryId: "seed-m07", reversedByEntryId: null, syncStatus: "PENDING", hlTxnId: null, hlLegs: null,
      hlSyncError: null, syncAttempts: 0, deleted: false, createdBy: by, createdAt: now, updatedAt: now,
    });
    tx.update(db.doc("moneyEntries/seed-m07"), { reversedByEntryId: "seed-m11" });
  });
  await waitSynced("moneyEntries/seed-m11", "the reversal");
}
console.log(`Money → local emulator only: ${REGISTERS.length} cash/bank accounts, ${CATEGORIES.length} categories, ${ENTRIES.length + 1} entries — all in the fake books.`);
process.exit(0);
