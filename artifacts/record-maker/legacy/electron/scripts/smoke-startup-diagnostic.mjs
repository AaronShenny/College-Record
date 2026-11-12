import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

// Verify the compiled app's isolated branch in a Windows session, without
// normal application services, credentials, or a student's profile.
if (process.platform !== "win32") throw new Error("The diagnostic smoke check requires Windows.");
const root = path.resolve(import.meta.dirname, "../../..");
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "record-diagnostic-smoke-"));
const run = `run-${randomUUID()}`;
const env = { ...process.env, LOCALAPPDATA: scratch };
for (const key of ["RECORD_MAKER_DEV_URL", "GOOGLE_DESKTOP_CLIENT_JSON", "GOOGLE_DESKTOP_CLIENT_JSON_PATH", "ELECTRON_RUN_AS_NODE"]) delete env[key];
const electron = createRequire(import.meta.url)("electron");
try {
  const child = spawn(electron, [root, "--record-maker-startup-diagnostic", `--record-maker-startup-run=${run}`],
    { cwd: root, env, stdio: "ignore", shell: false });
  const exit = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (child.pid) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: false });
      reject(new Error("Isolated startup check timed out without touching the normal app cache."));
    }, 85_000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => { clearTimeout(timer); resolve(code); });
  });
  const directory = path.join(scratch, "CollegeRecordMaker-StartupChecks", run);
  const report = JSON.parse(await fs.readFile(path.join(directory, "startup-summary.json"), "utf8"));
  if (exit !== 0 || report.result !== "ready" || report.profile !== "fresh-isolated" ||
      report.network !== "blocked" || !report.milestonesMsFromProcessStart.scriptReady ||
      !report.milestonesMsFromProcessStart.firstPaint) {
    throw new Error("Minimal diagnostic window did not report ready on the Windows build machine.");
  }
  process.stdout.write("Isolated Electron startup check passed on Windows; this does not certify cold startup on the student's computer.\n");
} finally { await fs.rm(scratch, { recursive: true, force: true }); }
