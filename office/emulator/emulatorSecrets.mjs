/**
 * The Cloud Functions declare the Humble Ledger gateway secret (GATEWAY_ADMIN_TOKEN).
 * In the emulators HL is always the FAKE one, so the secret is never used — but without
 * a local value the Functions emulator tries Google Secret Manager on every start, which
 * is slow and fails without a login. This writes a placeholder to
 * firebase/functions/.secret.local (git-ignored) if it's missing. Not a real secret.
 */
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

export function ensureEmulatorSecrets(functionsDir) {
  const file = path.join(functionsDir, ".secret.local");
  if (!existsSync(file)) {
    writeFileSync(file, "# Emulator-only placeholders (git-ignored). HL is always the fake one in the emulators.\nGATEWAY_ADMIN_TOKEN=emulator-placeholder-not-a-secret\n");
  }
}
