import * as admin from "firebase-admin";
import {defineSecret, defineString} from "firebase-functions/params";

import {FakeHlClient} from "./fakeHlClient";
import {NotConnectedHlClient, type HlClient} from "./hlClient";
import {HttpHlClient} from "./httpHlClient";

/**
 * Which Humble Ledger the functions talk to — config, not code (brief §1.8, §4):
 *  - a demo- project (the emulators) → ALWAYS the fake (_fakeHl/*), whatever HL_MODE
 *    says; no code path can reach live HL from demo-technofluid;
 *  - any other project → live HL only with HL_MODE=live (+ the gateway params and
 *    secret). Otherwise "off": every call fails loud ("books not connected yet"), so
 *    the live project can never book into a practice ledger and mark openings posted
 *    that the real books never got (Ansh's review, 24 Oct 2026).
 */
export const HL_MODE = defineString("HL_MODE", {default: "off", description: "live | off (the fake is only ever used on demo- projects)"});
export const GATEWAY_BASE_URL = defineString("GATEWAY_BASE_URL", {default: ""});
export const HL_BASE_URL = defineString("HL_BASE_URL", {default: ""});
export const HL_PROJECT_ID = defineString("HL_PROJECT_ID", {default: ""});
export const GATEWAY_ADMIN_TOKEN = defineSecret("GATEWAY_ADMIN_TOKEN");

/** Pass to every function that talks to HL. */
export const HL_SECRETS = [GATEWAY_ADMIN_TOKEN];

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
  live?: () => {gatewayBaseUrl: string; hlBaseUrl: string; projectId: string; adminToken: string};
}): HlClient {
  const mode = hlModeFor(opts.projectId, opts.mode);
  if (mode === "fake") return new FakeHlClient(opts.db);
  if (mode === "live" && opts.live) return new HttpHlClient(opts.live());
  return new NotConnectedHlClient();
}

/** The client for this function run. */
export function getHlClient(): HlClient {
  return createHlClient({
    projectId: currentProjectId(),
    mode: HL_MODE.value(),
    db: admin.firestore(),
    live: () => ({
      gatewayBaseUrl: GATEWAY_BASE_URL.value(),
      hlBaseUrl: HL_BASE_URL.value(),
      projectId: HL_PROJECT_ID.value(),
      adminToken: GATEWAY_ADMIN_TOKEN.value(),
    }),
  });
}
