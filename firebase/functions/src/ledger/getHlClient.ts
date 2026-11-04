import * as admin from "firebase-admin";
import {defineSecret, defineString} from "firebase-functions/params";
import {HttpsError} from "firebase-functions/v2/https";

import {FakeHlClient} from "./fakeHlClient";
import {NotConnectedHlClient, type HlClient} from "./hlClient";
import {HttpHlClient} from "./httpHlClient";

/**
 * Which Humble Ledger the functions talk to — config, not code (brief §1.8, §4):
 *  - a demo- project (the emulators) → ALWAYS the fake (_fakeHl/*), whatever HL_MODE
 *    says; no code path can reach live HL from demo-technofluid;
 *  - any other project → live HL only with HL_MODE=live (+ HL_BASE_URL, HL_LOGIN_EMAIL
 *    and the HL_LOGIN_PASSWORD secret). Otherwise "off": every call fails loud ("books
 *    not connected yet"), so the live project can never book into a practice ledger and
 *    mark openings posted that the real books never got (Ansh's review, 24 Oct 2026).
 *
 * No gateway (Ansh, 27 Oct 2026): the functions sign in to HL directly as Technofluid's
 * own app user (an ACCOUNTANT in Technofluid's HL company). Its password is a Functions
 * secret — never in the repo, never in the desktop app.
 */
export const HL_MODE = defineString("HL_MODE", {default: "off", description: "live | off (the fake is only ever used on demo- projects)"});
export const HL_BASE_URL = defineString("HL_BASE_URL", {default: "", description: "e.g. https://hl.humblesolutions.in"});
export const HL_LOGIN_EMAIL = defineString("HL_LOGIN_EMAIL", {default: "", description: "the app's HL user (ACCOUNTANT role)"});
export const HL_LOGIN_PASSWORD = defineSecret("HL_LOGIN_PASSWORD");

/** Pass to every function that talks to HL. */
export const HL_SECRETS = [HL_LOGIN_PASSWORD];

export function currentProjectId(): string {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  try {
    return String(JSON.parse(process.env.FIREBASE_CONFIG ?? "{}").projectId ?? "");
  } catch {
    return "";
  }
}

/**
 * Whether a failed background sync should be rethrown so the platform redelivers it.
 * Not in the emulators (demo- projects): they don't redeliver, and an unhandled error
 * kills the worker — losing any other event it was running at the time.
 */
export function platformRedelivers(): boolean {
  return !currentProjectId().startsWith("demo-");
}

export function hlModeFor(projectId: string, requested: string): "fake" | "live" | "off" {
  if (projectId.startsWith("demo-")) return "fake";
  return projectId && requested === "live" ? "live" : "off";
}

export function createHlClient(opts: {
  projectId: string;
  mode: string;
  db: admin.firestore.Firestore;
  live?: () => {hlBaseUrl: string; email: string; password: string};
}): HlClient {
  const mode = hlModeFor(opts.projectId, opts.mode);
  if (mode === "fake") return new FakeHlClient(opts.db);
  if (mode === "live" && opts.live) return new HttpHlClient(opts.live());
  return new NotConnectedHlClient();
}

/**
 * Pre-go-live testing against Technofluid's REAL HL company from the emulators (Ansh,
 * 28 Oct 2026). Only `npm run emulators:real-books` sets these — it asks for the app
 * user's password at start (never stored) and uses its own emulator data. They are plain
 * process variables, not params: no .env file can switch it on, and outside the Functions
 * emulator it never applies.
 */
export function realBooksFromEmulator(env: NodeJS.ProcessEnv = process.env): {hlBaseUrl: string; email: string; password: string} | null {
  if (env.FUNCTIONS_EMULATOR !== "true" || env.TECHNOFLUID_REAL_BOOKS !== "yes") return null;
  const hlBaseUrl = env.TECHNOFLUID_REAL_BOOKS_URL ?? "";
  const email = env.TECHNOFLUID_REAL_BOOKS_EMAIL ?? "";
  const password = env.TECHNOFLUID_REAL_BOOKS_PASSWORD ?? "";
  return hlBaseUrl && email && password ? {hlBaseUrl, email, password} : null;
}

/**
 * An opening balance can never be undone in HL — so a real-books TEST run refuses them
 * (they'd stay in Technofluid's real books for good).
 */
export function refuseOpeningOnRealBooks(): void {
  if (realBooksFromEmulator()) {
    throw new HttpsError("failed-precondition", "Opening balances are off in a real-books test run — they can't be undone in the real ledger. Set them after go-live.");
  }
}

/** The client for this function run. */
export function getHlClient(): HlClient {
  const real = currentProjectId().startsWith("demo-") ? realBooksFromEmulator() : null;
  if (real) return new HttpHlClient(real);
  return createHlClient({
    projectId: currentProjectId(),
    mode: HL_MODE.value(),
    db: admin.firestore(),
    live: () => ({
      hlBaseUrl: HL_BASE_URL.value(),
      email: HL_LOGIN_EMAIL.value(),
      password: HL_LOGIN_PASSWORD.value(),
    }),
  });
}
