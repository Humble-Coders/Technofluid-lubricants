import * as admin from "firebase-admin";
import {defineSecret, defineString} from "firebase-functions/params";

import {FakeHlClient} from "./fakeHlClient";
import type {HlClient} from "./hlClient";
import {HttpHlClient} from "./httpHlClient";

/**
 * Which Humble Ledger the functions talk to — config, not code (brief §1.8, §4):
 *  - HL_MODE=fake (default) → FakeHlClient on this project's Firestore (_fakeHl/*).
 *  - HL_MODE=live → HttpHlClient through the Humble gateway (params below + secret).
 * A demo- project (the emulators) ALWAYS gets the fake, whatever HL_MODE says — no code
 * path can reach live HL from demo-technofluid.
 */
export const HL_MODE = defineString("HL_MODE", {default: "fake", description: "fake | live"});
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

export function hlModeFor(projectId: string, requested: string): "fake" | "live" {
  if (!projectId || projectId.startsWith("demo-")) return "fake";
  return requested === "live" ? "live" : "fake";
}

export function createHlClient(opts: {
  projectId: string;
  mode: string;
  db: admin.firestore.Firestore;
  live?: () => {gatewayBaseUrl: string; hlBaseUrl: string; projectId: string; adminToken: string};
}): HlClient {
  if (hlModeFor(opts.projectId, opts.mode) === "fake" || !opts.live) return new FakeHlClient(opts.db);
  return new HttpHlClient(opts.live());
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
