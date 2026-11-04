/**
 * Sample sales for the LOCAL emulators — test data only. Run after `npm run seed`,
 * `npm run seed:entities` and `npm run seed:money`.
 *
 *  - the company details printed on invoices (Lube Chem Industries, a test GSTIN);
 *  - five invoices through the real createSale function, signed in as Accounts: a
 *    Haryana dealer with a discount, freight and part payment; a distributor on credit;
 *    an inter-state (IGST) sale to Delhi; a walk-in paid in cash; and one cancelled;
 *  - a later payment against the first invoice.
 *
 * Everything goes through the Cloud Functions exactly as the app's saves do (numbers,
 * pricing, stock out, the fake books). Safe by construction (127.0.0.1, demo project);
 * re-runnable (fixed request ids — a repeat returns the first result).
 *
 *   npm run emulators      (in one terminal; must include Functions)
 *   npm run seed:sales
 */
import { initializeApp as initAdmin } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { refuseOnRealBooks } from "./realBooks.mjs";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const db = getFirestore(initAdmin({ projectId: "demo-technofluid" }));
await refuseOnRealBooks(db, "seed:sales");
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

async function waitFor(path, field, want, what) {
  for (let i = 0; i < 100; i++) {
    const d = (await db.doc(path).get()).data();
    if (d?.[field] === want) return d;
    if (d?.[field] === "FAILED") throw new Error(`${what} couldn't be saved to the fake books: ${d.hlSyncError ?? d.cancelSyncError}`);
    await sleep(300);
  }
  throw new Error(`${what} isn't in the fake books yet — is the Functions emulator running?`);
}

for (const id of ["seed-panipat-tractors", "seed-karnal-auto", "seed-delhi-retail", "seed-kurukshetra-lubes"]) {
  if (!(await db.doc(`entities/${id}`).get()).exists) {
    console.log("Run `npm run seed:entities` (and `npm run seed:money`) first — the sample customers are missing.");
    process.exit(1);
  }
}
if (!(await db.doc("registers/default-cash").get()).exists) {
  console.log("Run `npm run seed:money` first — the cash and bank accounts are missing.");
  process.exit(1);
}

const admin = client("admin@technofluid.test");
const accounts = client("accounts@technofluid.test");
await signInWithEmailAndPassword(admin.auth, "admin@technofluid.test", "technofluid123");
await signInWithEmailAndPassword(accounts.auth, "accounts@technofluid.test", "technofluid123");

if (!(await db.doc("officeSettings/company").get()).exists) {
  await admin.call("saveCompanyProfile", {
    legalName: "Lube Chem Industries",
    tradeName: "Technofluid Lubricants",
    gstin: "06AAACL1234M1ZO", // a made-up test GSTIN (valid check digit)
    address: { line1: "Adjoining Central Warehouse, Near Gaushala Road", line2: "Matak Majri", city: "Karnal", pincode: "132001" },
    phone: "+91 88148 85245",
    email: "info@technofluidlubricants.in",
    invoicePrefix: "TF",
  });
}

const SALES = [
  {
    requestId: "seed-sale-01",
    customerEntityId: "seed-panipat-tractors",
    lines: [
      { sku: "GEAEP220-26LCANE", packs: 4, discountBp: 0 },
      { sku: "HYDHLP46-20LBUCKE", packs: 6, discountBp: 500 },
    ],
    freightPaise: 75_000,
    payments: [{ registerId: "default-cash", amountPaise: 1_000_000 }],
    note: "Vehicle HR-05 AB 1234",
  },
  {
    requestId: "seed-sale-02",
    customerEntityId: "seed-karnal-auto",
    lines: [
      { sku: "500ML2T-35X500ML", packs: 10, discountBp: 0 },
      { sku: "10KGBUC-10KG-3", packs: 3, discountBp: 250 },
    ],
    freightPaise: 0,
    payments: [],
    note: null,
  },
  {
    requestId: "seed-sale-03",
    customerEntityId: "seed-delhi-retail",
    lines: [
      { sku: "35LIT-4X35LITE-5", packs: 5, discountBp: 0 },
      { sku: "TRAOIL-50LCANE", packs: 2, discountBp: 0 },
    ],
    freightPaise: 120_000,
    payments: [],
    note: "Sent by Gati, LR 88213",
  },
  { requestId: "seed-sale-04", customerEntityId: "walk-in-customer", lines: [{ sku: "500ML2T-35X500ML", packs: 1, discountBp: 0 }], freightPaise: 0, payments: [], note: null, payFull: "default-cash" },
  { requestId: "seed-sale-05", customerEntityId: "seed-kurukshetra-lubes", lines: [{ sku: "CONOIL32-50LCANE", packs: 2, discountBp: 0 }], freightPaise: 0, payments: [], note: null },
];

const made = [];
for (const { payFull, ...s } of SALES) {
  let payments = s.payments;
  if (payFull) {
    // A walk-in pays the full amount (a repeat of this request returns the original sale).
    const existing = (await db.doc(`saleRequests/${s.requestId}`).get()).data()?.result;
    payments = [{ registerId: payFull, amountPaise: existing?.grandTotalPaise ?? (await priceWalkIn(s)) }];
  }
  const r = await accounts.call("createSale", { ...s, payments, invoiceDate: today });
  made.push(r);
  await waitFor(`sales/${r.saleId}`, "syncStatus", "SYNCED", r.invoiceNo);
}

/** The walk-in total: the same product's dealer price × packs + 18 % GST, rounded to the rupee. */
async function priceWalkIn(s) {
  const l = s.lines[0];
  const price = (await db.doc(`product_prices/${l.sku}`).get()).data();
  const product = (await db.doc(`products/${l.sku}`).get()).data();
  const pieces = Number(/(\d+)\s*[x×]\s*\d/i.exec(product.orderableUnit)?.[1] ?? 1);
  const pack = price.pricePer === "per piece" ? price.dealerPrice * pieces : price.pricePer === "per litre" || price.pricePer === "per kg" ? Math.round(price.dealerPrice * product.packQty) : price.dealerPrice;
  const taxable = pack * l.packs;
  const half = Math.round((taxable * 900) / 10_000);
  return Math.round((taxable + 2 * half) / 100) * 100;
}

// The last one was a mistake (wrong grade): cancel it.
const toCancel = made[4];
await accounts.call("cancelSale", { requestId: "seed-cancel-05", saleId: toCancel.saleId, reason: "Wrong grade — rebilled" }).catch((e) => {
  if (!/already cancelled/.test(e.message)) throw e;
});
await waitFor(`sales/${toCancel.saleId}`, "cancelSyncStatus", "SYNCED", `${toCancel.invoiceNo} cancellation`);

// A later payment against the first invoice.
const first = made[0];
const p = await accounts.call("recordMoneyEntry", {
  requestId: "seed-salepay-01",
  from: { kind: "PARTY", entityId: "seed-panipat-tractors", name: "x" },
  to: { kind: "BANK", registerId: "default-bank", name: "x" },
  amountPaise: 500_000,
  businessDay: today,
  note: "NEFT UTR 4471",
  saleId: first.saleId,
});
await waitFor(`moneyEntries/${p.entryId}`, "syncStatus", "SYNCED", "the payment");

console.log(`Sales → local emulator only: ${made.map((m) => m.invoiceNo).join(", ")} (${toCancel.invoiceNo} cancelled), and a payment against ${first.invoiceNo}.`);
process.exit(0);
