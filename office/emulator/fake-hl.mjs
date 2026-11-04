/**
 * The LOCAL fake Humble Ledger's switches — emulator only.
 *
 *   npm run fake-hl -- down     balances show "Books unreachable" (try Retry)
 *   npm run fake-hl -- up       back to normal
 *   npm run fake-hl -- reset    empty the fake books and copy everything into them again
 *                               (customers, cash/bank accounts, categories, money entries)
 *                               — use after the fake ledger's format changes.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const db = getFirestore(initializeApp({ projectId: "demo-technofluid" }));
const mode = process.argv[2];

async function clear(path) {
  const s = await db.collection(path).get();
  for (let i = 0; i < s.docs.length; i += 400) {
    const b = db.batch();
    s.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
    await b.commit();
  }
  return s.size;
}

async function resync(collection, patch) {
  const s = await db.collection(collection).get();
  for (const d of s.docs) {
    if (d.data().deleted === true) continue;
    await d.ref.update(patch(d.data()));
  }
  return s.size;
}

if (mode === "down" || mode === "up") {
  await db.doc("_fakeHl/control").set({ down: mode === "down", failNext: 0 }, { merge: true });
  console.log(mode === "down" ? "Fake books are DOWN — balances show 'Books unreachable'." : "Fake books are back UP.");
} else if (mode === "reset") {
  for (const c of ["customers", "accounts", "txns", "log"]) await clear(`_fakeHl/books/${c}`);
  await db.doc("_fakeHl/control").delete();
  const reset = { syncStatus: "PENDING", syncAttempts: 0, hlSyncError: null };
  const n1 = await resync("entities", (d) => ({ ...reset, hlCustomerId: null, hlAccountId: null, ...(d.opening ? { opening: { ...d.opening, posted: false, hlTxnId: null } } : {}) }));
  const n2 = await resync("registers", (d) => ({ ...reset, hlAccountId: null, ...(d.opening ? { opening: { ...d.opening, posted: false, hlTxnId: null } } : {}) }));
  const n3 = await resync("expenseCategories", () => ({ ...reset, hlAccountId: null }));
  const n4 = await resync("moneyEntries", () => ({ ...reset, hlTxnId: null, hlLegs: null }));
  console.log(`Fake books emptied; ${n1} customers/suppliers, ${n2} cash/bank accounts, ${n3} categories and ${n4} entries are being copied in again.`);
} else {
  console.log("Use: npm run fake-hl -- down | up | reset");
  process.exit(1);
}
process.exit(0);
