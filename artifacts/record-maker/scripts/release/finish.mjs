import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { appRoot, workspaceRoot, versionOf, manifest } from "./config.mjs";
import { verifyUpdate } from "./verify-update.mjs";

const version = versionOf();
const mode = process.argv[2];
if (process.platform !== "win32") throw new Error("Signed release packaging must run on Windows.");
const run = (command, args, cwd = appRoot, options = {}) =>
  execFileSync(command, args, { cwd, stdio: "inherit", windowsHide: true, ...options });
const cli = createRequire(import.meta.url).resolve("@tauri-apps/cli/tauri.js");
const verify = files => run("powershell.exe", [
  "-NoProfile", "-NonInteractive", "-File", path.join(import.meta.dirname, "verify-windows.ps1"),
  "-Files", files.join(","),
]);
// Pass separate file checks: native PowerShell argument binding must not treat
// a comma-separated string as a single filename.
const verifyEach = files => files.forEach(file => verify([file]));
const target = path.join(appRoot, "tauri/src-tauri/target/release");
const filename = `Recordly-${version}-x64-setup.exe`;
if (mode === "bundle") {
  const signed = path.join(appRoot, "dist/signpath-binaries-signed");
  const app = path.join(signed, "college-record-maker.exe");
  const worker = path.join(signed, "record-maker-worker.exe");
  verifyEach([app, worker]);
  fs.copyFileSync(app, path.join(target, "college-record-maker.exe"));
  fs.copyFileSync(worker, path.join(appRoot, "dist/tauri-resources/python/record-maker-worker.exe"));
  const before = createHash("sha256").update(fs.readFileSync(app)).digest("hex");
  // Rebuilding or Tauri's normal bundle-type patching would invalidate the
  // signature. A single NSIS bundle needs no bundle-type multiplexing.
  run(process.execPath, [cli, "bundle", "--ci", "--features", "desktop,custom-protocol",
    "--bundles", "nsis", "--no-sign", "--no-binary-patching"], path.join(appRoot, "tauri"));
  if (createHash("sha256").update(fs.readFileSync(path.join(target, "college-record-maker.exe"))).digest("hex") !== before) {
    throw new Error("Bundling changed the already-signed executable.");
  }
  const installers = fs.readdirSync(path.join(target, "bundle/nsis")).filter(f => f.endsWith(".exe"));
  if (installers.length !== 1) throw new Error("Expected one freshly-built NSIS installer.");
  const input = path.join(appRoot, "dist/signpath-installer-input");
  fs.mkdirSync(input, { recursive: true });
  fs.copyFileSync(path.join(target, "bundle/nsis", installers[0]), path.join(input, filename));
} else if (mode === "finalize") {
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY) throw new Error("The Tauri signing key must be provided securely by CI.");
  const installer = path.join(appRoot, "dist/signpath-installer-signed", filename);
  verifyEach([installer]);
  const output = path.join(workspaceRoot, "generated-artifacts/recordly-release");
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  const final = path.join(output, filename);
  fs.copyFileSync(installer, final);
  const hash = createHash("sha256").update(fs.readFileSync(final)).digest("hex");
  // Windows Authenticode must be applied BEFORE the separate Tauri signature.
  run(process.execPath, [cli, "signer", "sign", "--app-version", version, final]);
  if (createHash("sha256").update(fs.readFileSync(final)).digest("hex") !== hash) {
    throw new Error("The installer changed while creating its update signature.");
  }
  const signature = fs.readFileSync(`${final}.sig`, "utf8");
  verifyUpdate(fs.readFileSync(final), process.env.RECORD_MAKER_TAURI_PUBLIC_KEY, signature, version);
  const json = manifest({ version, repo: process.env.GITHUB_REPOSITORY, filename, signature });
  fs.writeFileSync(path.join(output, "latest.json"), JSON.stringify(json, null, 2) + "\n");
  const source = `Recordly-${version}-source.tar.gz`;
  run("git", ["archive", "--format=tar.gz", "--output", path.join(output, source), "HEAD"], workspaceRoot);
  const files = fs.readdirSync(output).sort();
  fs.writeFileSync(path.join(output, "SHA256SUMS"), files.map(file =>
    `${createHash("sha256").update(fs.readFileSync(path.join(output, file))).digest("hex")}  ${file}`).join("\n") + "\n");
  console.log("Signed release files prepared. Publication is still a separate approval.");
} else {
  throw new Error("Choose bundle or finalize.");
}
