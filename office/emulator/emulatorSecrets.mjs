/**
 * The Cloud Functions declare the Humble Ledger sign-in secret (HL_LOGIN_PASSWORD). In
 * the emulators HL is always the FAKE one, so the secret is never used — but without a
 * local value the Functions emulator tries Google Secret Manager on every start, which is
 * slow and fails without a login. This makes sure firebase/functions/.secret.local
 * (git-ignored) has a placeholder for it. Not a real secret.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const NEEDED = ["HL_LOGIN_PASSWORD"];

export function ensureEmulatorSecrets(functionsDir) {
  const file = path.join(functionsDir, ".secret.local");
  let text = existsSync(file) ? readFileSync(file, "utf8") : "# Emulator-only placeholders (git-ignored). HL is always the fake one in the emulators.\n";
  let changed = !existsSync(file);
  for (const name of NEEDED) {
    if (!new RegExp(`^${name}=`, "m").test(text)) {
      text += `${text.endsWith("\n") ? "" : "\n"}${name}=emulator-placeholder-not-a-secret\n`;
      changed = true;
    }
  }
  if (changed) writeFileSync(file, text);
}
