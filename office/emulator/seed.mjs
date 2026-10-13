/**
 * Fills the LOCAL Firebase emulators with test data: staff logins for every office role
 * and the product master (emulator/seed/products.json, generated from Gaurav's sheet).
 *
 * Safe by construction: it only ever talks to 127.0.0.1 and a `demo-` project id, which
 * Firebase refuses to connect to the real cloud.
 *
 *   npm run emulators      (in one terminal)
 *   npm run seed           (in another)
 */
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";

const app = initializeApp({ projectId: "demo-technofluid" });
const auth = getAuth(app);
const db = getFirestore(app);

const PASSWORD = "technofluid123";
const STAFF = [
  { uid: "staff-admin", email: "admin@technofluid.test", name: "Gaurav Verma", role: "admin" },
  { uid: "staff-accounts", email: "accounts@technofluid.test", name: "Priya Sharma", role: "accounts" },
  { uid: "staff-stock", email: "stock@technofluid.test", name: "Ramesh Kumar", role: "supervisor" },
  { uid: "dist-demo", email: "distributor@technofluid.test", name: "Karnal Auto Spares", role: "distributor" },
];

async function seedStaff() {
  for (const s of STAFF) {
    try {
      await auth.deleteUser(s.uid);
    } catch {
      /* not there yet */
    }
    await auth.createUser({ uid: s.uid, email: s.email, password: PASSWORD, displayName: s.name });
    await db.doc(`users/${s.uid}`).set({
      email: s.email,
      name: s.name,
      role: s.role,
      status: "approved",
      isActive: true,
      deleted: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

async function seedProducts() {
  const products = JSON.parse(readFileSync(new URL("./seed/products.json", import.meta.url), "utf8"));
  let batch = db.batch();
  let n = 0;
  for (const p of products) {
    batch.set(db.doc(`products/${p.sku}`), {
      ...p,
      deleted: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (++n % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
  return products.length;
}

await seedStaff();
const count = await seedProducts();
console.log(`Seeded ${STAFF.length} logins and ${count} products into the emulator.`);
console.log(`Log in with any of: ${STAFF.map((s) => s.email).join(", ")}  (password: ${PASSWORD})`);
