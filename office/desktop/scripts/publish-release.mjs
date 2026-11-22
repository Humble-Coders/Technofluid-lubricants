/**
 * Uploads a built Windows installer as a GitHub release that installed apps update from
 * (main/updater.ts). Run by `npm run release:win` AFTER `dist:win` has built everything —
 * electron-builder's own --publish uploads while building and can leave a broken release.
 *
 *  - version from package.json; owner/repo from electron-builder.yml → publish;
 *  - checks release/Technofluid-Office-Setup-<v>.exe, its .blockmap and latest.yml exist;
 *  - creates release v<v> if it isn't there, then uploads the three files (--clobber).
 * Uses the gh CLI that's already signed in — no token ever goes in a file.
 * Afterwards: write the release notes on the GitHub release page (they show in the pop-up).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const platform = process.argv[2];
if (platform !== "win") {
  console.error("Usage: node scripts/publish-release.mjs win");
  process.exit(1);
}

const { version, productName } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const yml = readFileSync(path.join(root, "electron-builder.yml"), "utf8");
const publish = yml.slice(yml.indexOf("\npublish:"));
const owner = publish.match(/^\s+owner:\s*(\S+)/m)?.[1];
const repo = publish.match(/^\s+repo:\s*(\S+)/m)?.[1];
if (!owner || !repo) throw new Error("No publish owner/repo in electron-builder.yml");

const tag = `v${version}`;
const files = [`Technofluid-Office-Setup-${version}.exe`, `Technofluid-Office-Setup-${version}.exe.blockmap`, "latest.yml"].map((f) => path.join(root, "release", f));
const missing = files.filter((f) => !existsSync(f));
if (missing.length) {
  console.error(`Build first (npm run dist:win). Missing:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}
if (!readFileSync(files[2], "utf8").includes(`version: ${version}`)) throw new Error(`release/latest.yml isn't for ${version} — rebuild.`);

const gh = (args) => execFileSync("gh", args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
const R = ["-R", `${owner}/${repo}`];
let exists = true;
try {
  gh(["release", "view", tag, ...R]);
} catch {
  exists = false;
}
if (!exists) {
  gh(["release", "create", tag, ...R, "--title", `${productName} ${version}`, "--notes", `${productName} ${version}`]);
  console.log(`Created release ${tag} on ${owner}/${repo}.`);
}
execFileSync("gh", ["release", "upload", tag, ...files, "--clobber", ...R], { stdio: "inherit" });
console.log(`\nUploaded ${files.length} files to https://github.com/${owner}/${repo}/releases/tag/${tag}\nNow write the release notes there — installed apps show them in the update pop-up.`);
