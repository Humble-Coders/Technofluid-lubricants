// Usage: GOOGLE_CLOUD_PROJECT=<PROJECT_ID> node scripts/bootstrap-admin.mjs <ADMIN_EMAIL>
// Bootstraps the first admin account using the Admin SDK (bypasses Firestore rules).
// Requires Application Default Credentials: `gcloud auth application-default login`.
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/bootstrap-admin.mjs <ADMIN_EMAIL>");
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });

const auth = getAuth();
const db = getFirestore();

let userRecord;
try {
  userRecord = await auth.getUserByEmail(email);
  console.log(`Auth user already exists: ${userRecord.uid}`);
} catch (err) {
  if (err.code !== "auth/user-not-found") throw err;
  userRecord = await auth.createUser({ email, emailVerified: true });
  console.log(`Created auth user: ${userRecord.uid}`);
}

await db.collection("users").doc(userRecord.uid).set(
  {
    uid: userRecord.uid,
    email,
    name: "Admin",
    role: "admin",
    status: "approved",
    isActive: true,
    deleted: false,
    approvedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  },
  { merge: true },
);
console.log(`Wrote users/${userRecord.uid} with role=admin, status=approved, isActive=true`);

const resetLink = await auth.generatePasswordResetLink(email);
console.log("\nPassword reset link (send to the admin via secure channel):");
console.log(resetLink);
