import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import { build } from "electron-builder";

if (process.platform !== "win32") {
  throw new Error("Build the Windows installer on Windows so the bundled Python helper is a Windows executable. Use the manual Windows CI workflow or follow DESKTOP.md.");
}
const root = path.resolve(import.meta.dirname, "..");
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
};
run(process.execPath, [path.join(root, "scripts/build-desktop.mjs")]);
run(process.env.RECORD_MAKER_PYTHON || "python", [
  "-m", "PyInstaller", "--noconfirm", "--clean", "--onefile", "--console",
  "--name", "record-maker-worker", "--distpath", "dist/python", "--workpath", "dist/pyinstaller",
  "--specpath", "dist", "python/worker.py",
]);
if (!existsSync(path.join(root, "dist/python/record-maker-worker.exe"))) throw new Error("Python worker packaging did not produce an executable");
const smoke = spawnSync(path.join(root, "dist/python/record-maker-worker.exe"), ["--workspace-root", path.join(root, "dist/worker-smoke")], {
  cwd: root, encoding: "utf8", shell: false, windowsHide: true, timeout: 30_000,
  input: JSON.stringify({ protocol: 1, id: "packaging-health", action: "health", params: {} }) + "\n",
});
if (smoke.status !== 0 || !smoke.stdout) throw new Error("The bundled Python worker could not run on Windows");
const response = JSON.parse(smoke.stdout.trim());
if (response.ok !== true || response.result?.studentCodeExecution !== false) throw new Error("Bundled worker health check failed");
await build({ projectDir: root, config: path.join(root, "electron-builder.yml") });
