import { build as viteBuild } from "vite";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { parseDesktopRegistration } from "../services/google-registration.mjs";

const root = path.resolve(import.meta.dirname, "..");
const assetsOnly = process.argv.includes("--assets-only");
const run = (command, args, cwd = root) => {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Desktop build failed with exit code ${result.status}.`);
};
await fs.mkdir(path.join(root, "dist"), { recursive: true });
run(process.execPath, [path.join(root, "scripts/build-tauri-service.mjs")]);
await viteBuild({ configFile: path.join(root, "vite.tauri.config.ts") });
// Generated icon, without a runtime dependency on uploaded images.
const dib = Buffer.alloc(40 + 32 * 32 * 4 + 32 * 4);
dib.writeUInt32LE(40); dib.writeInt32LE(32, 4); dib.writeInt32LE(64, 8);
dib.writeUInt16LE(1, 12); dib.writeUInt16LE(32, 14);
for (let i = 40; i < 40 + 32 * 32 * 4; i += 4) {
  dib[i] = 70; dib[i + 1] = 95; dib[i + 2] = 37; dib[i + 3] = 255;
}
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header[6] = 32; header[7] = 32;
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(dib.length, 14); header.writeUInt32LE(22, 18);
await fs.writeFile(path.join(root, "dist/tauri-icon.ico"), Buffer.concat([header, dib]));
if (assetsOnly) process.exit(0);
if (process.platform !== "win32" || process.arch !== "x64" || !process.versions.node.startsWith("22.")) {
  throw new Error("Package this Windows x64 application on Windows x64 with Node 22.");
}
const resources = path.join(root, "dist/tauri-resources");
await fs.rm(resources, { recursive: true, force: true });
await fs.mkdir(path.join(resources, "config"), { recursive: true });
await fs.cp(path.join(root, "dist/tauri-host"), path.join(resources, "host"), { recursive: true });
await fs.copyFile(process.execPath, path.join(resources, "node.exe"));
const registration = process.env.GOOGLE_DESKTOP_CLIENT_JSON_PATH
  ? await fs.readFile(process.env.GOOGLE_DESKTOP_CLIENT_JSON_PATH, "utf8")
  : process.env.GOOGLE_DESKTOP_CLIENT_JSON;
if (!registration) throw new Error("Provide the registered Google Desktop client through the build secret. No registration was bundled.");
await fs.writeFile(path.join(resources, "config/google-client.json"), JSON.stringify(parseDesktopRegistration(registration)));
const feed = process.env.RECORD_MAKER_TAURI_UPDATE_URL || null;
const publicKey = process.env.RECORD_MAKER_TAURI_PUBLIC_KEY || null;
const publisherNames = (process.env.RECORD_MAKER_PUBLISHER_NAME || "").split(";").map(s => s.trim()).filter(Boolean);
if (feed && (new URL(feed).protocol !== "https:" || !publicKey || !publisherNames.length)) {
  throw new Error("An update-enabled build needs HTTPS, the Tauri public verification key and publisher names.");
}
if (feed && (!process.env.TAURI_SIGNING_PRIVATE_KEY || !process.env.RECORD_MAKER_CERTIFICATE_THUMBPRINT)) {
  throw new Error("An update-enabled release requires Tauri signing credentials and a Windows certificate already installed for the build user. Trial builds must leave the feed unset.");
}
await fs.writeFile(path.join(resources, "config/release-config.json"), JSON.stringify({ feed, publicKey, publisherNames }));
run(process.env.RECORD_MAKER_PYTHON || "python", [
  "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir", "--console", "--name", "record-maker-worker",
  "--distpath", "dist/tauri-python", "--workpath", "dist/tauri-pyinstaller", "--specpath", "dist",
  "python/worker.py", "--add-data", `${path.resolve(root, "../../attached_assets/pdf_to_qns_1793905163999.py")};extractor`,
  "--collect-data", "docx", "--collect-data", "docxcompose", "--collect-all", "pymupdf",
  "--hidden-import", "win32com.client", "--hidden-import", "pythoncom", "--hidden-import", "win32timezone",
]);
await fs.cp(path.join(root, "dist/tauri-python/record-maker-worker"), path.join(resources, "python"), { recursive: true });
const health = spawnSync(path.join(resources, "python/record-maker-worker.exe"), ["--workspace-root", path.join(root, "dist/tauri-worker-health")], {
  encoding: "utf8", shell: false, timeout: 30_000, windowsHide: true,
  input: JSON.stringify({ protocol: 1, id: "packaging-health", action: "health", params: {} }) + "\n",
});
if (health.status !== 0 || !health.stdout.trim() || JSON.parse(health.stdout.trim()).ok !== true) {
  throw new Error("The actual packaged Python helper failed its Windows health check.");
}
const require = createRequire(import.meta.url);
const args = [require.resolve("@tauri-apps/cli/tauri.js"), "build", "--ci", "--features", "desktop,custom-protocol", "--bundles", "nsis", "--", "--locked"];
if (feed) {
  const override = path.join(root, "dist/tauri-release-config.json");
  await fs.writeFile(override, JSON.stringify({ bundle: {
    createUpdaterArtifacts: true,
    windows: { certificateThumbprint: process.env.RECORD_MAKER_CERTIFICATE_THUMBPRINT, digestAlgorithm: "sha256", timestampUrl: "https://timestamp.digicert.com" },
  } }));
  args.splice(args.indexOf("--"), 0, "--config", override);
}
// Authenticode signing must be configured separately by the owner; unsigned
// trial installers do not claim release/update readiness.
run(process.execPath, args, path.join(root, "tauri"));
const output = path.resolve(root, "../../generated-artifacts/tauri-desktop");
await fs.mkdir(output, { recursive: true });
await fs.cp(path.join(root, "tauri/src-tauri/target/release/bundle/nsis"), output, { recursive: true });
await fs.copyFile(path.join(root, "tauri/src-tauri/target/release/college-record-maker.exe"), path.join(output, "college-record-maker.exe"));
await fs.copyFile(path.join(root, "tauri/WINDOWS-VERIFICATION.md"), path.join(output, "WINDOWS-VERIFICATION.md"));
await fs.writeFile(path.join(output, "build-status.json"), JSON.stringify({
  version: "0.2.0", host: "tauri", ownerCutoverApproved: false, targetHardwarePerformanceVerified: false,
  officeVerified: false, updateFeedConfigured: !!feed, pythonPackaging: "directory",
}, null, 2));
console.log("Tauri trial installer created. Complete Windows verification before replacing Electron.");
