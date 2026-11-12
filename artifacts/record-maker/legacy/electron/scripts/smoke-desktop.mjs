import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

// Run against the real compiled Electron/preload/UtilityProcess code on the
// Windows build machine, using a disposable cache and no Google credentials.
if (process.platform !== "win32") throw new Error("The native packaging smoke check requires Windows.");
const root = path.resolve(import.meta.dirname, "../../..");
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "record-native-smoke-"));
const revision = randomUUID();
const snapshot = path.join(directory, "workspaces/local-development/snapshots", revision);
const subjectId = randomUUID();
const stamp = new Date().toISOString();
const write = async (filename, data) => {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, JSON.stringify(data));
};
try {
  await write(path.join(snapshot, "app.json"), { schemaVersion: 1, subjects: [{ id: subjectId, path: "subject.json" }] });
  await write(path.join(snapshot, "subject.json"), {
    id: subjectId, name: "Native startup smoke fixture", semester: 1, courseCode: "", programs: [], updatedAt: stamp, trashedAt: null,
  });
  await write(path.join(directory, "workspaces/local-development/current.json"), { revisionId: revision, savedAt: stamp, pendingItems: 1 });
  const env = { ...process.env };
  for (const key of ["GOOGLE_DESKTOP_CLIENT_JSON", "GOOGLE_DESKTOP_CLIENT_JSON_PATH", "RECORD_MAKER_DEV_URL", "ELECTRON_RUN_AS_NODE"]) delete env[key];
  const electron = createRequire(import.meta.url)("electron");
  const child = spawn(electron, [path.join(root, "legacy/electron/scripts/smoke-desktop-harness.cjs"), directory],
    { cwd: root, env, stdio: ["ignore", "ignore", "ignore"], shell: false });
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (child.pid) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: false });
      reject(new Error("Native Electron startup/save/reopen smoke check timed out. No student cache was used."));
    }, 60_000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", status => { clearTimeout(timer); resolve(status); });
  });
  if (code !== 0) {
    const result = await fs.readFile(path.join(directory, "smoke-result.json"), "utf8").catch(() => '{"ok":false,"error":"Electron did not complete the smoke check."}');
    throw new Error(`Native Electron smoke check failed: ${result}`);
  }
  const result = JSON.parse(await fs.readFile(path.join(directory, "smoke-result.json"), "utf8"));
  if (!result.ok) throw new Error("Native Electron smoke check returned no success result.");
  process.stdout.write(`Native Electron startup/save/reopen passed (disposable fixture, default Windows graphics policy, dashboard process age ${result.dashboardProcessAgeMs} ms). This is not a real-account Windows performance certification.\n`);
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}
