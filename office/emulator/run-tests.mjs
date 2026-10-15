/**
 * Runs the emulator tests (emulator/tests/*.test.mjs) against a FRESH, throw-away set of
 * emulators on their own ports (firebase/firebase.test.json), so they work whether or not
 * `npm run emulators` is running and never touch your saved test data.
 *
 *   npm run test:emulator
 *
 * Uses the real security rules and the real Cloud Functions (built first).
 */
import { existsSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const firebaseDir = path.resolve(here, "../../firebase");
const functionsDir = path.join(firebaseDir, "functions");
const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";

if (!existsSync(path.join(functionsDir, "node_modules"))) {
  execFileSync(npm, ["--prefix", functionsDir, "ci"], { stdio: "inherit", shell: isWindows });
}
execFileSync(npm, ["--prefix", functionsDir, "run", "build"], { stdio: "inherit", shell: isWindows });

const env = { ...process.env };
if (process.platform === "darwin") {
  try {
    env.JAVA_HOME = execFileSync("/usr/libexec/java_home", ["-v", "21+"], { encoding: "utf8" }).trim();
    env.PATH = `${env.JAVA_HOME}/bin:${env.PATH}`;
  } catch {
    console.warn("Java 21+ not found — the Firestore emulator needs it (https://adoptium.net).");
  }
}

const testsDir = path.join(here, "tests");
// One file at a time: the files share the test logins.
const testCommand = `node --test --test-concurrency=1 "${testsDir}/*.test.mjs"`;
const child = spawn(
  "firebase",
  [
    "emulators:exec",
    "--config",
    path.join(firebaseDir, "firebase.test.json"),
    "--project",
    "demo-technofluid",
    "--only",
    "auth,firestore,functions",
    testCommand,
  ],
  { stdio: "inherit", env, shell: isWindows },
);
child.on("exit", (code) => process.exit(code ?? 1));
