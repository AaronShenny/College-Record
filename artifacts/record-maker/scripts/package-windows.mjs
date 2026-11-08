import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { build } from "electron-builder";
import { parseDesktopRegistration } from "../desktop/google-registration.mjs";

if (process.platform !== "win32") {
  throw new Error("Build the Windows installer on Windows so the bundled Python helper is a Windows executable. Use the manual Windows CI workflow or follow DESKTOP.md.");
}
const root = path.resolve(import.meta.dirname, "..");
const configDirectory = path.join(root, "dist/runtime-config");
rmSync(configDirectory, { recursive: true, force: true });
mkdirSync(configDirectory, { recursive: true });
const feed = process.env.RECORD_MAKER_UPDATE_URL || null;
const publisherNames = (process.env.RECORD_MAKER_PUBLISHER_NAME || "").split(";").map(s => s.trim()).filter(Boolean);
if (feed && (new URL(feed).protocol !== "https:" || !publisherNames.length)) throw new Error("Updates require an HTTPS feed and signing-certificate publisher name.");
writeFileSync(path.join(configDirectory, "release-config.json"), JSON.stringify({ feed, publisherNames }));
const registration = process.env.GOOGLE_DESKTOP_CLIENT_JSON_PATH
  ? readFileSync(process.env.GOOGLE_DESKTOP_CLIENT_JSON_PATH, "utf8")
  : process.env.GOOGLE_DESKTOP_CLIENT_JSON;
if (registration) writeFileSync(path.join(configDirectory, "google-client.json"), JSON.stringify(parseDesktopRegistration(registration)), { mode: 0o600 });
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
};
run(process.execPath, [path.join(root, "scripts/build-desktop.mjs")]);
run(process.execPath, [path.join(root, "scripts/smoke-desktop.mjs")]);
run(process.env.RECORD_MAKER_PYTHON || "python", [
  "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir", "--console",
  "--name", "record-maker-worker", "--distpath", "dist/python", "--workpath", "dist/pyinstaller",
  "--specpath", "dist", "python/worker.py",
  "--add-data", `${path.resolve(root, "../../attached_assets/pdf_to_qns_1793905163999.py")};extractor`,
  "--collect-data", "docx", "--collect-data", "docxcompose", "--collect-all", "pymupdf",
  "--hidden-import", "win32com.client", "--hidden-import", "pythoncom", "--hidden-import", "win32timezone",
]);
if (!existsSync(path.join(root, "dist/python/record-maker-worker/record-maker-worker.exe"))) throw new Error("Python worker packaging did not produce an executable");
const smoke = spawnSync(path.join(root, "dist/python/record-maker-worker/record-maker-worker.exe"), ["--workspace-root", path.join(root, "dist/worker-smoke")], {
  cwd: root, encoding: "utf8", shell: false, windowsHide: true, timeout: 30_000,
  input: JSON.stringify({ protocol: 1, id: "packaging-health", action: "health", params: {} }) + "\n",
});
if (smoke.status !== 0 || !smoke.stdout) throw new Error("The bundled Python worker could not run on Windows");
const response = JSON.parse(smoke.stdout.trim());
if (response.ok !== true || response.result?.studentCodeExecution !== false) throw new Error("Bundled worker health check failed");
await build({ projectDir: root, config: {
  extends: path.join(root, "electron-builder.yml"),
  ...(feed ? { publish: [{ provider: "generic", url: feed }], forceCodeSigning: true, win: { publisherName: publisherNames } } : {}),
} });
