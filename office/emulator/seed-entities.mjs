/**
 * Sample customers & suppliers for the LOCAL emulators — test data only. They're written
 * as PENDING; the Functions emulator's onEntityWritten then copies each to the fake
 * Humble Ledger (with its opening balance), exactly as the app's saves do.
 *
 * Safe by construction: only 127.0.0.1 and the demo-technofluid project. Re-runnable —
 * existing samples are left alone.
 *
 *   npm run emulators        (in one terminal; must include Functions)
 *   npm run seed:entities    (in another)
 */
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const db = getFirestore(initializeApp({ projectId: "demo-technofluid" }));
const by = { uid: "seed", name: "Test data import" };
const now = FieldValue.serverTimestamp();

const address = (city, district, stateCode, line1 = "", pincode = "") => ({ line1, line2: "", city, district, pincode, stateCode });
const SAMPLES = [
  {
    id: "walk-in-customer",
    name: "Walk-in / cash customer",
    kinds: ["customer"],
    isWalkIn: true,
    address: address("", "", "06"),
    priceTier: "Dealer",
  },
  {
    id: "seed-karnal-auto",
    name: "Karnal Auto Spares",
    kinds: ["customer"],
    phones: ["+919876500101"],
    email: "orders@karnalauto.in",
    gstin: "06AAKFK2021L1ZG",
    address: address("Karnal", "Karnal", "06", "Shop 12, GT Road", "132001"),
    priceTier: "Distributor",
    distributorId: "dist-demo",
    creditLimitPaise: 50_000_000,
  },
  {
    id: "seed-haryana-base-oils",
    name: "Haryana Base Oils Pvt Ltd",
    kinds: ["supplier"],
    phones: ["+919812300202"],
    gstin: "06AAHCH4410K1ZP",
    address: address("Panipat", "Panipat", "06", "Plot 44, Industrial Area", "132103"),
    opening: { amountPaise: 12_000_000, direction: "payable", asOf: "2026-04-01" },
  },
  {
    id: "seed-kurukshetra-lubes",
    name: "Kurukshetra Lubes Trading",
    kinds: ["customer", "supplier"],
    phones: ["+919896300303"],
    gstin: "06AAEFK9001P1Z4",
    address: address("Kurukshetra", "Kurukshetra", "06", "Pipli Road"),
    priceTier: "Dealer",
    notes: "Buys oils, sells us drums back",
  },
  {
    id: "seed-panipat-tractors",
    name: "Panipat Tractor House",
    kinds: ["customer"],
    phones: ["+919416000404"],
    gstin: "06AACCP5150M1ZB",
    address: address("Panipat", "Panipat", "06", "Sanoli Road", "132103"),
    priceTier: "Dealer",
    creditLimitPaise: 10_000_000,
    opening: { amountPaise: 4_500_050, direction: "receivable", asOf: "2026-04-01" },
  },
  {
    id: "seed-delhi-retail",
    name: "Rajdhani Motor Stores",
    kinds: ["customer"],
    phones: ["+919811000505"],
    gstin: "07AABFR8820N1ZT",
    address: address("New Delhi", "Central Delhi", "07", "Kashmere Gate"),
    priceTier: "Dealer",
  },
  {
    id: "seed-yamuna-drums",
    name: "Yamuna Drums & Containers",
    kinds: ["supplier"],
    phones: ["+919034000606"],
    address: address("Yamunanagar", "Yamunanagar", "06"),
    notes: "Empty 210 L drums",
  },
];

// The distributor test login (distributor@technofluid.test) as an approved website distributor.
const dist = db.doc("distributors/dist-demo");
if (!(await dist.get()).exists) {
  await dist.set({
    uid: "dist-demo",
    name: "Karnal Auto Spares",
    email: "distributor@technofluid.test",
    phone: "9876500101",
    address: "Shop 12, GT Road, Karnal",
    gstNumber: "06AAKFK2021L1ZG",
    status: "approved",
    isActive: true,
    deleted: false,
    contactInfo: "",
    createdBy: "seed",
    createdAt: now,
  });
}

let added = 0;
for (const s of SAMPLES) {
  const ref = db.doc(`entities/${s.id}`);
  if ((await ref.get()).exists) continue;
  const { id, opening, ...rest } = s;
  await ref.set({
    phones: [],
    email: null,
    gstin: null,
    gstVerified: null,
    priceTier: null,
    creditLimitPaise: null,
    notes: null,
    distributorId: null,
    isWalkIn: false,
    ...rest,
    nameLower: s.name.toLowerCase(),
    isActive: true,
    deleted: false,
    opening: opening ? { ...opening, posted: false, hlTxnId: null } : null,
    syncStatus: "PENDING",
    hlCustomerId: null,
    hlAccountId: null,
    hlSyncedAt: null,
    hlSyncError: null,
    syncAttempts: 0,
    createdBy: by,
    updatedBy: by,
    createdAt: now,
    updatedAt: now,
  });
  await ref.collection("history").add({ at: now, by, action: "create", changes: {}, reason: "Sample data" });
  added += 1;
}
console.log(`Customers & suppliers → local emulator only: ${added} added, ${SAMPLES.length - added} already there.`);
console.log("They copy to the fake books in a few seconds (needs the Functions emulator running).");

