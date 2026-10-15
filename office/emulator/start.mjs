/**
 * Starts the local Firebase emulators. Test data is saved to emulator/data when you stop
 * them (Ctrl+C) and loaded again next time, so your test sales and stock survive restarts.
 */
import { existsSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";

// Uses the real project config (firebase/firebase.json): the live security rules and
// the real Cloud Functions — so what passes here is what ships.
const dataDir = "emulator/data";
const config = "../firebase/firebase.json";
const functionsDir = "../firebase/functions";
const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";

// The Functions emulator runs the compiled code in firebase/functions/lib, so install
// (first time only) and build it before starting, then keep rebuilding while you edit.
if (!existsSync(`${functionsDir}/node_modules`)) {
  console.log("Installing Cloud Functions packages (first run only)…");
  execFileSync(npm, ["--prefix", functionsDir, "ci"], { stdio: "inherit", shell: isWindows });
}
console.log("Building Cloud Functions…");
execFileSync(npm, ["--prefix", functionsDir, "run", "build"], { stdio: "inherit", shell: isWindows });
const watcher = spawn(
  npm,
  ["--prefix", functionsDir, "run", "build:watch", "--", "--preserveWatchOutput"],
  { stdio: ["ignore", "pipe", "inherit"], shell: isWindows },
);
// Stay quiet unless a rebuild fails — then say so, or the emulator keeps running old code.
watcher.stdout.on("data", (chunk) => {
  for (const line of String(chunk).split("\n")) {
    if (/error TS\d+/.test(line)) console.error(`[functions build] ${line.trim()}`);
  }
});

const args = [
  "emulators:start",
  "--config",
  config,
  "--project",
  "demo-technofluid",
  "--only",
  "auth,firestore,functions",
  "--export-on-exit",
  `${process.cwd()}/${dataDir}`,
];
if (existsSync(`${dataDir}/firebase-export-metadata.json`)) args.push("--import", `${process.cwd()}/${dataDir}`);

// The emulators need Java 21+. On a Mac with several JDKs installed, pick 21 for this run
// only (nothing system-wide changes). Elsewhere, JAVA_HOME / PATH is used as-is.
const env = { ...process.env };
if (process.platform === "darwin") {
  try {
    env.JAVA_HOME = execFileSync("/usr/libexec/java_home", ["-v", "21+"], { encoding: "utf8" }).trim();
    env.PATH = `${env.JAVA_HOME}/bin:${env.PATH}`;
  } catch {
    console.warn("Java 21+ not found — the Firestore emulator needs it (https://adoptium.net).");
  }
}

const child = spawn("firebase", args, { stdio: "inherit", env, shell: isWindows });
child.on("exit", (code) => {
  watcher.kill();
  process.exit(code ?? 0);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    watcher.kill(signal);
    child.kill(signal);
  });
}
