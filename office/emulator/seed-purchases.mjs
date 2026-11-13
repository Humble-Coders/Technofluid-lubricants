/**
 * Sample purchases (supplier bills) for the LOCAL emulators — test data only. Run after
 * `npm run seed`, `npm run seed:stock`, `npm run seed:entities` and `npm run seed:money`.
 *
 *  - Haryana Base Oils: base oil, CGST + SGST, part paid from the bank;
 *  - a made-up Delhi supplier of cans: IGST, freight and a round-off, on credit;
 *  - Yamuna Drums (no GSTIN): no GST, paid in cash;
 *  - one bill entered by mistake and cancelled;
 *  - a later payment against the first bill.
 *
 * Everything goes through the Cloud Functions exactly as the app's saves do (PB numbers,
 * re-pricing, stock in, the fake books). Safe by construction (127.0.0.1, demo project);
 * re-runnable (fixed request ids — a repeat returns the first result).
 *
 *   npm run emulators      (in one terminal; must include Functions)
 *   npm run seed:purchases
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { initializeApp as initAdmin } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { refuseOnRealBooks } from "./realBooks.mjs";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const db = getFirestore(initAdmin({ projectId: "demo-technofluid" }));
await refuseOnRealBooks(db, "seed:purchases");
const here = path.dirname(fileURLToPath(import.meta.url));
// The server's own copy of the purchase rules (built by `npm run emulators`), to work out each bill's total.
const model = createRequire(path.join(here, "../../firebase/functions/package.json"))("./lib/purchases/purchaseModel.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

function client(email) {
  const app = initializeApp({ apiKey: "demo-api-key", projectId: "demo-technofluid", appId: "demo-app" }, email);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const functions = getFunctions(app, "us-central1");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  return { auth, call: (name, data) => httpsCallable(functions, name)(data).then((r) => r.data) };
}

async function waitFor(p, field, want, what) {
  for (let i = 0; i < 100; i++) {
    const d = (await db.doc(p).get()).data();
    if (d?.[field] === want) return d;
    if (d?.[field] === "FAILED") throw new Error(`${what} couldn't be saved to the fake books: ${d.hlSyncError ?? d.cancelSyncError}`);
    await sleep(300);
  }
  throw new Error(`${what} isn't in the fake books yet — is the Functions emulator running?`);
}

for (const id of ["seed-haryana-base-oils", "seed-yamuna-drums"]) {
  if (!(await db.doc(`entities/${id}`).get()).exists) {
    console.log("Run `npm run seed:entities` (and `npm run seed:money`) first — the sample suppliers are missing.");
    process.exit(1);
  }
}
if (!(await db.doc("registers/default-cash").get()).exists) {
  console.log("Run `npm run seed:money` first — the cash and bank accounts are missing.");
  process.exit(1);
}

/** The first live stock item of a kind and unit (seed:stock makes them). */
async function pick(kind, unit) {
  const s = await db.collection("stockItems").where("kind", "==", kind).where("baseUnit", "==", unit).limit(20).get();
  const d = s.docs.find((x) => x.data().deleted !== true);
  if (!d) {
    console.log(`Run \`npm run seed:stock\` first — no ${kind.replace("_", " ")} in ${unit} found.`);
    process.exit(1);
  }
  return { id: d.id, name: String(d.data().name), kind, baseUnit: unit };
}
const oil = await pick("raw_material", "L");
const can = await pick("consumable", "piece");

const accounts = client("accounts@technofluid.test");
await signInWithEmailAndPassword(accounts.auth, "accounts@technofluid.test", "technofluid123");

// A made-up Delhi supplier (valid check digit), so one bill is inter-state.
const delhi = (
  await accounts.call("saveEntity", {
    requestId: "seed-pur-delhi-cans",
    input: {
      name: "Delhi Cans & Caps (sample)",
      kinds: ["supplier"],
      phones: [],
      email: null,
      gstin: "07AABCD1234E1ZA",
      address: { line1: "Sample Industrial Area", line2: "", city: "New Delhi", district: "", pincode: "110020", stateCode: "07" },
      priceTier: null,
      creditLimitPaise: null,
      notes: null,
    },
  })
).entityId;
await waitFor(`entities/${delhi}`, "syncStatus", "SYNCED", "the Delhi supplier");

const gstState = async (entityId) => model.supplierGstState((await db.doc(`entities/${entityId}`).get()).data()?.gstin ?? null);

/** Works the bill out like the form does, rounds to the rupee, and sends that as the supplier's printed total. */
async function bill(b) {
  const items = { [oil.id]: oil, [can.id]: can };
  const state = await gstState(b.supplierEntityId);
  const exact = model.pricePurchase({ items, lines: b.lines, freightPaise: b.freightPaise ?? 0, supplierStateCode: state, sellerStateCode: "06", roundOffPaise: 0 });
  if (!exact.ok) throw new Error(`Sample bill ${b.billNo}: ${JSON.stringify(exact.errors)}`);
  const roundOffPaise = model.suggestRoundOff(exact.totals.exactTotalPaise);
  return { freightPaise: 0, payments: [], stockAlreadyCounted: false, note: null, billDate: today, ...b, roundOffPaise, supplierBillTotalPaise: exact.totals.exactTotalPaise + roundOffPaise };
}

const BILLS = [
  await bill({
    requestId: "seed-pur-01",
    supplierEntityId: "seed-haryana-base-oils",
    billNo: "HBO/2026/1182",
    lines: [{ itemId: oil.id, qtyMilli: 1_000_000, taxablePaise: 8_500_000, gstRateBp: 1800 }],
    payments: [{ registerId: "default-bank", amountPaise: 5_000_000 }],
    note: "Tanker HR99X0001",
  }),
  await bill({
    requestId: "seed-pur-02",
    supplierEntityId: delhi,
    billNo: "DCC-0457",
    lines: [{ itemId: can.id, qtyMilli: 500_000, taxablePaise: 1_875_050, gstRateBp: 1800 }],
    freightPaise: 25_000,
  }),
  await bill({
    requestId: "seed-pur-03",
    supplierEntityId: "seed-yamuna-drums",
    billNo: "Y-31",
    lines: [{ itemId: can.id, qtyMilli: 40_000, taxablePaise: 240_000, gstRateBp: 0 }],
  }),
  await bill({
    requestId: "seed-pur-04",
    supplierEntityId: "seed-haryana-base-oils",
    billNo: "HBO/2026/1182-A",
    lines: [{ itemId: oil.id, qtyMilli: 200_000, taxablePaise: 1_700_000, gstRateBp: 1800 }],
  }),
];
// Yamuna Drums is paid in full in cash (its total is known only now).
BILLS[2].payments = [{ registerId: "default-cash", amountPaise: BILLS[2].supplierBillTotalPaise }];

const made = [];
for (const b of BILLS) {
  const r = await accounts.call("createPurchase", b);
  made.push(r);
  await waitFor(`purchases/${r.purchaseId}`, "syncStatus", "SYNCED", r.ref);
}

// The last one was entered by mistake: cancel it.
const toCancel = made[3];
await accounts.call("cancelPurchase", { requestId: "seed-pur-cancel-04", purchaseId: toCancel.purchaseId, reason: "Entered twice — same delivery as HBO/2026/1182" }).catch((e) => {
  if (!/already cancelled/.test(e.message)) throw e;
});
await waitFor(`purchases/${toCancel.purchaseId}`, "cancelSyncStatus", "SYNCED", `${toCancel.ref} cancellation`);

// A later payment against the first bill (it stays part paid).
const first = made[0];
const p = await accounts.call("recordMoneyEntry", {
  requestId: "seed-purpay-01",
  from: { kind: "BANK", registerId: "default-bank", name: "x" },
  to: { kind: "PARTY", entityId: "seed-haryana-base-oils", name: "x" },
  amountPaise: 2_000_000,
  businessDay: today,
  note: "NEFT UTR 5520",
  purchaseId: first.purchaseId,
});
await waitFor(`moneyEntries/${p.entryId}`, "syncStatus", "SYNCED", "the payment");

console.log(`Purchases → local emulator only: ${made.map((m) => m.ref).join(", ")} (${toCancel.ref} cancelled), and a payment against ${first.ref}.`);
process.exit(0);
