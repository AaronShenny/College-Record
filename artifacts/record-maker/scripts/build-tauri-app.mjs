import { build as viteBuild } from "vite";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { parseDesktopRegistration } from "../services/google-registration.mjs";
import { versionOf, releaseConfiguration, repository } from "./release/config.mjs";

const root = path.resolve(import.meta.dirname, "..");
const assetsOnly = process.argv.includes("--assets-only");
const prepareSignpath = process.argv.includes("--prepare-signpath");
const version = versionOf();
const run = (command, args, cwd = root) => {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Desktop build failed with exit code ${result.status}.`);
};
await fs.mkdir(path.join(root, "dist"), { recursive: true });
run(process.execPath, [path.join(root, "scripts/build-tauri-service.mjs")]);
await viteBuild({ configFile: path.join(root, "vite.tauri.config.ts") });
// The supplied logo is a small, tracked, multi-resolution local asset.
await fs.copyFile(path.join(root, "public/recordly-icon.ico"), path.join(root, "dist/tauri-icon.ico"));
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
const { feed, publicKey, publisherNames } = releaseConfiguration(process.env);
if (prepareSignpath && !feed) throw new Error("SignPath release preparation requires the update feed and verification policy.");
if (prepareSignpath) repository(process.env.GITHUB_REPOSITORY);
if (feed && !prepareSignpath && (!process.env.TAURI_SIGNING_PRIVATE_KEY || !process.env.RECORD_MAKER_CERTIFICATE_THUMBPRINT)) {
  throw new Error("An update-enabled release requires Tauri signing credentials and a Windows certificate already installed for the build user. Trial builds must leave the feed unset.");
}
await fs.writeFile(path.join(resources, "config/release-config.json"), JSON.stringify({ feed, publicKey, publisherNames }));
await fs.mkdir(path.join(resources, "legal"), { recursive: true });
for (const filename of ["LICENSE", "COPYING", "docs/PRIVACY.md", "docs/THIRD-PARTY-NOTICES.md"]) {
  await fs.copyFile(path.resolve(root, "../..", filename), path.join(resources, "legal", path.basename(filename)));
}
const reviewedLegal = path.join(root, "legal/third-party");
try {
  if (prepareSignpath && !(await fs.readdir(reviewedLegal)).length) throw new Error("The reviewed legal bundle is empty.");
  await fs.cp(reviewedLegal, path.join(resources, "legal/third-party"), { recursive: true });
} catch (error) {
  if (prepareSignpath || error.code !== "ENOENT") throw new Error("Add the reviewed third-party licence/source bundle under artifacts/record-maker/legal/third-party before preparing a signed release.");
}
if (prepareSignpath) {
  await fs.writeFile(path.join(resources, "legal/SOURCE.txt"),
    `Recordly ${version} corresponding application source:\nhttps://github.com/${process.env.GITHUB_REPOSITORY}/releases/download/v${version}/Recordly-${version}-source.tar.gz\n\nSee the included third-party notices/source bundle for dependency source and terms.\n`);
}
// Recordly-owned worker metadata must match the native app for signing policy.
const winVersion = path.join(root, "dist/worker-version.txt");
const tuple = [...version.split(".").map(Number), 0].join(", ");
await fs.writeFile(winVersion, `VSVersionInfo(ffi=FixedFileInfo(filevers=(${tuple}), prodvers=(${tuple}), mask=0x3f, flags=0, OS=0x40004, fileType=1, subtype=0, date=(0,0)), kids=[StringFileInfo([StringTable('040904B0', [StringStruct('CompanyName', 'extapano'), StringStruct('ProductName', 'Recordly'), StringStruct('FileDescription', 'Recordly document worker'), StringStruct('FileVersion', '${version}'), StringStruct('ProductVersion', '${version}'), StringStruct('OriginalFilename', 'record-maker-worker.exe')])]), VarFileInfo([VarStruct('Translation', [1033, 1200])])])`);
run(process.env.RECORD_MAKER_PYTHON || "python", [
  "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir", "--console", "--name", "record-maker-worker",
  "--distpath", "dist/tauri-python", "--workpath", "dist/tauri-pyinstaller", "--specpath", "dist",
  "python/worker.py", "--add-data", `${path.resolve(root, "../../attached_assets/pdf_to_qns_1793905163999.py")};extractor`,
  "--collect-data", "docx", "--collect-data", "docxcompose", "--collect-all", "pymupdf",
  "--hidden-import", "win32com.client", "--hidden-import", "pythoncom", "--hidden-import", "win32timezone",
  "--version-file", winVersion,
]);
await fs.cp(path.join(root, "dist/tauri-python/record-maker-worker"), path.join(resources, "python"), { recursive: true });
const health = spawnSync(path.join(resources, "python/record-maker-worker.exe"), ["--workspace-root", path.join(root, "dist/tauri-worker-health")], {
  encoding: "utf8", shell: false, timeout: 30_000, windowsHide: true,
  input: JSON.stringify({ protocol: 1, id: "packaging-health", action: "health", params: {} }) + "\n",
});
let healthResponse;
try { healthResponse = JSON.parse(health.stdout?.trim() || ""); } catch { /* Report only the fixed diagnostic below. */ }
if (health.error || health.status !== 0 || healthResponse?.protocol !== 1 ||
    healthResponse?.id !== "packaging-health" || healthResponse?.ok !== true ||
    healthResponse?.result?.protocol !== 1 || healthResponse?.result?.status !== "ready" ||
    healthResponse?.result?.studentCodeExecution !== false ||
    !Array.isArray(healthResponse?.result?.capabilities) ||
    !["health", "snapshot-summary"].every(capability => healthResponse.result.capabilities.includes(capability))) {
  throw new Error("The actual packaged Python helper failed its Windows health check.");
}
const require = createRequire(import.meta.url);
if (prepareSignpath) {
  run(process.execPath, [require.resolve("@tauri-apps/cli/tauri.js"), "build", "--ci",
    "--features", "desktop,custom-protocol", "--no-bundle", "--", "--locked"], path.join(root, "tauri"));
  const input = path.join(root, "dist/signpath-binaries-input");
  await fs.rm(input, { recursive: true, force: true });
  await fs.mkdir(input, { recursive: true });
  await fs.copyFile(path.join(root, "tauri/src-tauri/target/release/college-record-maker.exe"), path.join(input, "college-record-maker.exe"));
  await fs.copyFile(path.join(resources, "python/record-maker-worker.exe"), path.join(input, "record-maker-worker.exe"));
  console.log("Recordly binaries prepared for SignPath. No release installer or update was published.");
  process.exit(0);
}
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
  version, host: "tauri", ownerCutoverApproved: false, targetHardwarePerformanceVerified: false,
  officeVerified: false, updateFeedConfigured: !!feed, pythonPackaging: "directory",
}, null, 2));
console.log("Tauri trial installer created. Complete Windows verification before replacing Electron.");
