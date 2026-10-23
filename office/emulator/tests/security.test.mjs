/**
 * Security lock (step 1): who can read prices, who can create which account records,
 * and that nobody writes products / prices / logs from a client. Real firestore.rules and
 * Cloud Functions, in throw-away emulators.
 *
 *   npm run test:emulator
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { adminDb, as, closeClients, denied, seedStaff, signedOut, newSignup } from "./helpers.mjs";

const SKU = "TEST-SEC-26L";
const LEGACY_SKU = "TEST-SEC-LEGACY-26L";
const KEPT_SKU = "TEST-SEC-KEPT-26L";

const PRODUCT = {
  sku: SKU,
  product: "TEST SECURITY OIL",
  grade: "46",
  productKey: "test-security-oil-46",
  category: "bulk_oil",
  orderableUnit: "26 L can",
  packQty: 26,
  baseUnit: "L",
  gstPct: 18,
  segment: "Industrial",
  active: true,
  deleted: false,
};
const PRICES = { pricePer: "per litre", dealerPrice: 12000, distributorPrice: 10000 };

let roles;

async function cleanUp() {
  for (const sku of [SKU, LEGACY_SKU, KEPT_SKU, "TEST-SEC-NEW-26L"]) {
    await adminDb.doc(`products/${sku}`).delete();
    await adminDb.doc(`product_prices/${sku}`).delete();
  }
  await adminDb.doc(`public_catalog/${PRODUCT.productKey}`).delete();
}

before(async () => {
  await seedStaff();
  await cleanUp();
  await adminDb.doc(`products/${SKU}`).set(PRODUCT);
  await adminDb.doc(`product_prices/${SKU}`).set(PRICES);
  roles = {
    admin: await as("admin"),
    accounts: await as("accounts"),
    stock: await as("stock"),
    distributor: await as("distributor"),
    signedOut: signedOut(),
  };
});

after(async () => {
  await cleanUp();
  await closeClients();
});

describe("prices (product_prices)", () => {
  const read = (who) => getDoc(doc(roles[who].db, "product_prices", SKU));

  test("Admin and Accounts can read prices", async () => {
    assert.equal((await read("admin")).data().dealerPrice, 12000);
    assert.equal((await read("accounts")).data().dealerPrice, 12000);
    assert.equal((await getDocs(collection(roles.accounts.db, "product_prices"))).empty, false);
  });

  test("Stock & Production, distributors and signed-out visitors cannot", async () => {
    await denied(read("stock"));
    await denied(read("distributor"));
    await denied(read("signedOut"));
    await denied(getDocs(collection(roles.stock.db, "product_prices")));
  });

  test("nobody writes prices from an app — not even Admin", async () => {
    await denied(setDoc(doc(roles.admin.db, "product_prices", SKU), { ...PRICES, dealerPrice: 1 }));
    await denied(updateDoc(doc(roles.accounts.db, "product_prices", SKU), { dealerPrice: 1 }));
    await denied(deleteDoc(doc(roles.admin.db, "product_prices", SKU)));
  });
});

describe("products", () => {
  test("Stock & Production can read products, which carry no prices", async () => {
    const snap = await getDoc(doc(roles.stock.db, "products", SKU));
    assert.equal(snap.data().product, "TEST SECURITY OIL");
    for (const field of ["pricePer", "dealerPrice", "distributorPrice"]) assert.ok(!(field in snap.data()));
  });

  test("signed-out visitors cannot read products", async () => {
    await denied(getDoc(doc(roles.signedOut.db, "products", SKU)));
  });

  test("nobody writes products or the change log from an app", async () => {
    await denied(updateDoc(doc(roles.admin.db, "products", SKU), { product: "HACKED" }));
    await denied(setDoc(doc(roles.stock.db, "products", "X-NEW"), PRODUCT));
    await denied(setDoc(doc(roles.admin.db, "productChanges", "x"), { sku: SKU }));
  });
});

describe("the website's product functions keep prices apart", () => {
  test("createProduct puts prices in product_prices, not on the product", async () => {
    const sku = "TEST-SEC-NEW-26L";
    await roles.admin.call("createProduct", { ...PRODUCT, sku, ...PRICES, dealerPrice: 9900 });
    const product = (await adminDb.doc(`products/${sku}`).get()).data();
    assert.ok(product && !("dealerPrice" in product));
    assert.equal((await adminDb.doc(`product_prices/${sku}`).get()).data().dealerPrice, 9900);
  });

  test("updateProduct on a not-yet-migrated product moves its prices across", async () => {
    await adminDb.doc(`products/${LEGACY_SKU}`).set({ ...PRODUCT, sku: LEGACY_SKU, ...PRICES });
    await roles.admin.call("updateProduct", { sku: LEGACY_SKU, fields: { orderableUnit: "26 L can (new label)" } });
    const product = (await adminDb.doc(`products/${LEGACY_SKU}`).get()).data();
    assert.equal(product.orderableUnit, "26 L can (new label)");
    assert.ok(!("dealerPrice" in product), "legacy price fields stripped");
    assert.deepEqual(
      { ...(await adminDb.doc(`product_prices/${LEGACY_SKU}`).get()).data(), updatedAt: undefined },
      { ...PRICES, updatedAt: undefined },
      "existing prices kept",
    );
  });
});

describe("migrate-product-prices script", () => {
  const script = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../firebase/functions/scripts/migrate-product-prices.mjs",
  );
  const run = (...extra) =>
    execFileSync("node", [script, "--project", "demo-technofluid", ...extra], {
      env: { ...process.env },
      encoding: "utf8",
    });

  test("dry run changes nothing; --write moves prices and keeps newer price docs", async () => {
    await adminDb.doc(`products/${LEGACY_SKU}`).set({ ...PRODUCT, sku: LEGACY_SKU, ...PRICES });
    await adminDb.doc(`product_prices/${LEGACY_SKU}`).delete();
    // This one already has a (newer) price doc — the stale product fields must not win.
    await adminDb.doc(`products/${KEPT_SKU}`).set({ ...PRODUCT, sku: KEPT_SKU, ...PRICES });
    await adminDb.doc(`product_prices/${KEPT_SKU}`).set({ ...PRICES, dealerPrice: 55500 });

    assert.match(run(), /DRY RUN/);
    assert.ok("dealerPrice" in (await adminDb.doc(`products/${LEGACY_SKU}`).get()).data());

    assert.match(run("--write"), /Done/);
    const legacy = (await adminDb.doc(`products/${LEGACY_SKU}`).get()).data();
    assert.ok(!("dealerPrice" in legacy) && !("pricePer" in legacy));
    assert.equal((await adminDb.doc(`product_prices/${LEGACY_SKU}`).get()).data().dealerPrice, 12000);
    assert.ok(!("dealerPrice" in (await adminDb.doc(`products/${KEPT_SKU}`).get()).data()));
    assert.equal((await adminDb.doc(`product_prices/${KEPT_SKU}`).get()).data().dealerPrice, 55500);
  });
});

describe("sign-up can't self-promote (C1)", () => {
  // Exactly what the website's signup page writes today.
  const signupDoc = (email, role) => ({
    email,
    name: "Test Signup",
    phone: "",
    role,
    status: "pending",
    isActive: true,
    distributorCount: 0,
    ordersCount: 0,
    approvedBy: null,
    approvedAt: null,
    lastLoginAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  test("the website's normal sign-up still works (pending salesperson / distributor)", async () => {
    for (const role of ["salesperson", "distributor"]) {
      const email = `signup-ok-${role}@technofluid.test`;
      const me = await newSignup(email);
      await setDoc(doc(me.db, "users", me.uid), { ...signupDoc(email, role), createdBy: me.uid });
    }
    const email = "signup-ok-dist-record@technofluid.test";
    const me = await newSignup(email);
    await setDoc(doc(me.db, "users", me.uid), { ...signupDoc(email, "distributor"), createdBy: me.uid });
    await setDoc(doc(me.db, "distributors", me.uid), {
      email,
      name: "Test Signup",
      status: "pending",
      isActive: true,
      createdBy: me.uid,
      approvedBy: null,
      approvedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  test("signing up as admin, accounts or Stock & Production is refused", async () => {
    for (const role of ["admin", "accounts", "supervisor"]) {
      const email = `signup-role-${role}@technofluid.test`;
      const me = await newSignup(email);
      await denied(setDoc(doc(me.db, "users", me.uid), { ...signupDoc(email, role), createdBy: me.uid }));
    }
  });

  test("signing up already approved (or pre-approved, or deleted) is refused", async () => {
    const email = "signup-approved@technofluid.test";
    const me = await newSignup(email);
    const base = { ...signupDoc(email, "salesperson"), createdBy: me.uid };
    await denied(setDoc(doc(me.db, "users", me.uid), { ...base, status: "approved" }));
    await denied(setDoc(doc(me.db, "users", me.uid), { ...base, approvedBy: me.uid }));
    await denied(setDoc(doc(me.db, "users", me.uid), { ...base, approvedAt: serverTimestamp() }));
    await denied(setDoc(doc(me.db, "users", me.uid), { ...base, deleted: true }));
  });

  test("nobody can create a user record for someone else", async () => {
    const me = await newSignup("signup-other@technofluid.test");
    await denied(setDoc(doc(me.db, "users", "someone-else"), signupDoc("x@technofluid.test", "salesperson")));
  });

  test("a distributor record can't be self-created as approved", async () => {
    const me = await newSignup("signup-dist-approved@technofluid.test");
    await denied(
      setDoc(doc(me.db, "distributors", me.uid), {
        email: "signup-dist-approved@technofluid.test",
        name: "Test",
        status: "approved",
        isActive: true,
        approvedBy: null,
        approvedAt: null,
      }),
    );
  });

  test("a pending account can't read the catalogue until approved", async () => {
    const email = "signup-pending-read@technofluid.test";
    const me = await newSignup(email);
    await setDoc(doc(me.db, "users", me.uid), { ...signupDoc(email, "salesperson"), createdBy: me.uid });
    await denied(getDoc(doc(me.db, "products", SKU)));
  });

  test("a signed-up user can't approve themselves afterwards", async () => {
    const email = "signup-self-approve@technofluid.test";
    const me = await newSignup(email);
    await setDoc(doc(me.db, "users", me.uid), { ...signupDoc(email, "salesperson"), createdBy: me.uid });
    await denied(updateDoc(doc(me.db, "users", me.uid), { status: "approved" }));
    await denied(updateDoc(doc(me.db, "users", me.uid), { role: "admin" }));
  });
});
