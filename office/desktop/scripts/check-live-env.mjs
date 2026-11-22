/**
 * Runs before an office installer is built (npm run dist:win / dist:mac): refuses unless
 * .env.local points the app at the LIVE Technofluid project, so a test build (which shows
 * "Development mode" and talks to emulators on the builder's own computer) can never be
 * handed to the office by mistake. A trial build of the setup screens: npm run dist:win:trial.
 * Prints key names only, never values.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, "../.env.local");
const KEYS = ["VITE_FIREBASE_API_KEY", "VITE_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_PROJECT_ID", "VITE_FIREBASE_STORAGE_BUCKET", "VITE_FIREBASE_MESSAGING_SENDER_ID", "VITE_FIREBASE_APP_ID"];

const fail = (why) => {
  console.error(`\nNot building the installer: ${why}\nCopy desktop/.env.example to desktop/.env.local, fill in the live Firebase web config and set VITE_USE_EMULATORS=false.\n(For a trial of the setup screens only: npm run dist:win:trial)\n`);
  process.exit(1);
};

if (!existsSync(file)) fail("desktop/.env.local is missing.");
const env = Object.fromEntries(
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
if (env.VITE_USE_EMULATORS !== "false") fail("VITE_USE_EMULATORS must be false for an office build.");
const missing = KEYS.filter((k) => !env[k]);
if (missing.length) fail(`missing ${missing.join(", ")}.`);
if (env.VITE_FIREBASE_PROJECT_ID.startsWith("demo-")) fail("the project id is a demo (emulator-only) project.");
console.log(`Live build for Firebase project ${env.VITE_FIREBASE_PROJECT_ID}.`);
