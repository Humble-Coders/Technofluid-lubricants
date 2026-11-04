/**
 * The local emulators, but posting to Technofluid's REAL Humble Ledger company — for
 * testing on the main account before go-live (Ansh, 28 Oct 2026).
 *
 *   npm run emulators:real-books
 *
 *  - Asks for the app user's login (the ACCOUNTANT "Technofluid Office app" user in HL).
 *    The password is typed here and never stored; the email can be kept in
 *    emulator/real-books.local.json ({"email": "…"}, git-ignored).
 *  - Checks the login against HL before starting.
 *  - Uses its OWN emulator data (emulator/data-real-books), never the practice data, so
 *    no practice customer, sale or payment can reach the real books.
 *  - Marks the run: the app shows "REAL BOOKS"; seed:entities / seed:money / seed:sales
 *    refuse to run. (`npm run seed` — logins and products — and seed:stock are fine:
 *    they don't touch the books.)
 * Everything you save while it runs goes into the real ledger for good — HL never
 * deletes; mistakes are reversed / cancelled.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import readline from "node:readline";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { REAL_BOOKS_DOC } from "./realBooks.mjs";

const HL_URL = "https://hl.humblesolutions.in";
const localFile = new URL("./real-books.local.json", import.meta.url);
const saved = existsSync(localFile) ? JSON.parse(readFileSync(localFile, "utf8")) : {};

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (text) => {
      if (!muted) rl.output.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
    muted = hidden;
  });
}

console.log("\n⚠️  REAL BOOKS: these emulators will post to Technofluid's REAL Humble Ledger company.");
console.log("   Everything saved goes into the real ledger for good (mistakes are reversed, never deleted).\n");

const email = saved.email || (await ask("HL app user email: "));
const password = await ask(`Password for ${email} (not shown, not saved): `, { hidden: true });
if (!email || !password) {
  console.error("Email and password are both needed.");
  process.exit(1);
}

// Check the login before starting anything.
const login = await fetch(`${HL_URL}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }).catch((e) => {
  console.error(`Couldn't reach Humble Ledger: ${e.message}`);
  process.exit(1);
});
const body = await login.json().catch(() => ({}));
if (!login.ok || !body?.data?.accessToken) {
  console.error(`Humble Ledger refused the sign-in (${login.status}${body?.error?.message ? `: ${body.error.message}` : ""}).`);
  process.exit(1);
}
const role = body.data.user?.role;
console.log(`✓ Signed in to Humble Ledger as ${email}${role ? ` (${role})` : ""}${body.data.user?.company?.name ? ` — company ${body.data.user.company.name}` : ""}.`);
if (role && role !== "ACCOUNTANT") console.warn(`  Note: the app user should be an ACCOUNTANT (it is ${role}).`);

const child = spawn(process.execPath, ["emulator/start.mjs"], {
  stdio: "inherit",
  env: {
    ...process.env,
    OFFICE_EMULATOR_DATA: "emulator/data-real-books",
    TECHNOFLUID_REAL_BOOKS: "yes",
    TECHNOFLUID_REAL_BOOKS_URL: HL_URL,
    TECHNOFLUID_REAL_BOOKS_EMAIL: email,
    TECHNOFLUID_REAL_BOOKS_PASSWORD: password,
  },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));

// Once Firestore answers, mark this run so the app and the sample-data scripts know.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const db = getFirestore(initializeApp({ projectId: "demo-technofluid" }, "real-books-marker"));
for (let i = 0; i < 300; i++) {
  try {
    await db.doc(REAL_BOOKS_DOC).set({ realBooks: true, hlUser: email, since: FieldValue.serverTimestamp() });
    console.log("\n⚠️  REAL BOOKS mode is on — the app shows it in the top bar. Stop with Ctrl+C.\n");
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 1000));
  }
}
