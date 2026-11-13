import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { appRoot, versionOf, repository, feedFor, releaseConfiguration } from "./config.mjs";

const version = versionOf();
if (process.env.RELEASE_VERSION !== version) throw new Error("Input version does not match the checked-out source.");
const repo = repository(process.env.GITHUB_REPOSITORY);
const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const tag = execFileSync("git", ["rev-parse", `refs/tags/v${version}^{commit}`], { encoding: "utf8" }).trim();
if (head !== tag) throw new Error("The checkout must be the exact version tag.");
if (process.env.RECORDLY_LICENSE_REVIEWED !== "true") {
  throw new Error("Complete the licence, third-party source/notice and privacy review before enabling signed releases.");
}
if (!fs.existsSync(path.join(appRoot, "legal/third-party")) ||
    !fs.readdirSync(path.join(appRoot, "legal/third-party")).length) {
  throw new Error("The reviewed exact-version third-party notices/source bundle is missing.");
}
for (const name of ["HAS_GOOGLE_REGISTRATION", "HAS_SIGNPATH_TOKEN", "HAS_TAURI_KEY"]) {
  if (process.env[name] !== "true") throw new Error("Required release credentials are not configured in the protected GitHub environment.");
}
for (const name of [
  "SIGNPATH_ORGANIZATION_ID", "SIGNPATH_PROJECT_SLUG", "SIGNPATH_SIGNING_POLICY_SLUG",
  "SIGNPATH_BINARIES_CONFIGURATION", "SIGNPATH_INSTALLER_CONFIGURATION",
  "RECORD_MAKER_TAURI_PUBLIC_KEY", "RECORD_MAKER_PUBLISHER_NAME",
]) {
  if (!process.env[name]?.trim()) throw new Error(`Configure the required release variable: ${name}.`);
}
releaseConfiguration({ ...process.env, RECORD_MAKER_TAURI_UPDATE_URL: feedFor(repo) });
console.log(`Release ${version} configuration and tag match. No secrets were printed.`);
