/**
 * Switch the LOCAL fake Humble Ledger off and on, to try the "Books unreachable" screens
 * and Retry. Emulator only.
 *
 *   npm run fake-hl -- down
 *   npm run fake-hl -- up
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const db = getFirestore(initializeApp({ projectId: "demo-technofluid" }));
const mode = process.argv[2];
if (mode !== "down" && mode !== "up") {
  console.log("Use: npm run fake-hl -- down   (or up)");
  process.exit(1);
}
await db.doc("_fakeHl/control").set({ down: mode === "down", failNext: 0 }, { merge: true });
console.log(mode === "down" ? "Fake books are DOWN — balances show 'Books unreachable'." : "Fake books are back UP.");
