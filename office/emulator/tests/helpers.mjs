/**
 * Shared set-up for the emulator tests: an Admin SDK handle for arranging data, and
 * signed-in web-SDK clients per role (so the real security rules apply to them).
 * Ports match firebase/firebase.test.json (see emulator/run-tests.mjs).
 */
import assert from "node:assert/strict";
import { initializeApp as initAdmin } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { deleteApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore as getClientFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

export const PROJECT = "demo-technofluid";
const HOST = "127.0.0.1";
const PORTS = { auth: 9199, firestore: 8180, functions: 5101 };

process.env.FIRESTORE_EMULATOR_HOST = `${HOST}:${PORTS.firestore}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `${HOST}:${PORTS.auth}`;

const adminApp = initAdmin({ projectId: PROJECT }, `admin-${process.pid}`);
export const adminDb = getFirestore(adminApp);
export const adminAuth = getAdminAuth(adminApp);
export { FieldValue };

const PASSWORD = "technofluid123"; // emulator-only test logins

/** The office logins plus a distributor, all approved and active. */
export const STAFF = {
  admin: { uid: "t-admin", email: "admin@technofluid.test", name: "Gaurav Verma", role: "admin" },
  accounts: { uid: "t-accounts", email: "accounts@technofluid.test", name: "Priya Sharma", role: "accounts" },
  stock: { uid: "t-stock", email: "stock@technofluid.test", name: "Ramesh Kumar", role: "supervisor" },
  distributor: { uid: "t-dist", email: "distributor@technofluid.test", name: "Karnal Auto Spares", role: "distributor" },
};

export async function seedStaff() {
  for (const s of Object.values(STAFF)) {
    await adminAuth.deleteUser(s.uid).catch(() => {});
    await adminAuth.createUser({ uid: s.uid, email: s.email, password: PASSWORD, displayName: s.name });
    await adminDb.doc(`users/${s.uid}`).set({
      email: s.email,
      name: s.name,
      role: s.role,
      status: "approved",
      isActive: true,
      deleted: false,
    });
  }
}

const apps = [];

function client(label) {
  const app = initializeApp({ apiKey: "demo-api-key", projectId: PROJECT, appId: "demo-app" }, `${label}-${apps.length}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${HOST}:${PORTS.auth}`, { disableWarnings: true });
  const db = getClientFirestore(app);
  connectFirestoreEmulator(db, HOST, PORTS.firestore);
  const functions = getFunctions(app, "us-central1");
  connectFunctionsEmulator(functions, HOST, PORTS.functions);
  const call = (name, data) => httpsCallable(functions, name)(data).then((r) => r.data);
  return { auth, db, call };
}

/** A web client signed in as one of STAFF (rules apply). */
export async function as(who) {
  const c = client(who);
  await signInWithEmailAndPassword(c.auth, STAFF[who].email, PASSWORD);
  return c;
}

/** A web client nobody is signed in to. */
export function signedOut() {
  return client("anon");
}

/** A brand-new sign-up (like the website's signup page): an auth account with no records yet. */
export async function newSignup(email) {
  const c = client("signup");
  await adminAuth.getUserByEmail(email).then((u) => adminAuth.deleteUser(u.uid)).catch(() => {});
  const { user } = await createUserWithEmailAndPassword(c.auth, email, PASSWORD);
  return { ...c, uid: user.uid };
}

export async function closeClients() {
  await Promise.all(apps.splice(0).map((app) => deleteApp(app)));
}

/** A Firestore read/write the rules must refuse. */
export const denied = (promise) => assert.rejects(promise, /permission|PERMISSION_DENIED/i);

/** A Cloud Function call that must fail with this code (and message pattern). */
export const rejectsWith = (promise, code, pattern) =>
  assert.rejects(promise, (err) => {
    assert.equal(err.code, `functions/${code}`);
    if (pattern) assert.match(err.message, pattern);
    return true;
  });
