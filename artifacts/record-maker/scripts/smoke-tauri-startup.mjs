import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, mkdirSync, copyFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { inspectCounterTrace } from "./startup-trace-contract.mjs";
if (process.platform !== "win32") throw new Error("Windows-only native smoke check.");
const directory = path.resolve(process.argv[2]);
const local = mkdtempSync(path.join(os.tmpdir(), "tauri-startup-smoke-"));
const env = { ...process.env, LOCALAPPDATA: local, NODE_OPTIONS: "", NODE_PATH: "" };
const run = (exe, args) => {
  const r = spawnSync(exe, args, { env, encoding: "utf8", timeout: 160_000, windowsHide: true });
  if (r.error || r.status !== 0) throw new Error(`Native Tauri smoke failed (${r.status}). ${r.stdout || ""} ${r.stderr || ""}`);
};
const base = path.join(local, "CollegeRecordMaker-TauriChecks");
// Preparation happens outside the measured application launch.
run(path.join(directory, "node.exe"), [path.join(directory, "fixture-service.cjs"), "--prepare", path.join(base, "fixture-v1")]);
const output = path.join(directory, "ci-smoke-results");
mkdirSync(output, { recursive: true });
for (const mode of ["minimal", "dashboard"]) {
  try {
    run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
      path.join(directory, "Start-Tauri-Test.ps1"), "-Mode", mode, "-Condition", "ci", "-NoExplorer"]);
  } finally {
    // Keep privacy-safe evidence even when the CI check fails; no profiles/data.
    for (const name of readdirSync(base).filter(n => /^run-[a-f0-9]{32}$/.test(n))) {
      const dest = path.join(output, name); mkdirSync(dest, { recursive: true });
      for (const file of readdirSync(path.join(base, name)).filter(n => /\.(jsonl|json)$/.test(n))) {
        copyFileSync(path.join(base, name, file), path.join(dest, file));
      }
    }
  }
  const latest = readdirSync(base).filter(n => /^run-[a-f0-9]{32}$/.test(n))
    .map(n => path.join(base, n)).find(d => {
      try { return JSON.parse(readFileSync(path.join(d, "startup-summary.json"))).mode === mode; } catch { return false; }
    });
  assert.ok(latest, `${mode}: no native summary`);
  const summary = JSON.parse(readFileSync(path.join(latest, "startup-summary.json"), "utf8"));
  const launcher = JSON.parse(readFileSync(path.join(latest, "launcher-summary.json"), "utf8"));
  assert.equal(summary.result, "ready");
  assert.equal(launcher.exitCode, 0);
  assert.ok(launcher.launchToReadyObservedMs > 0);
  assert.ok(summary.milestones.interactionComplete > 0);
  if (mode === "dashboard") assert.ok(summary.milestones.dashboardPainted > 0);
  const counters = readFileSync(path.join(latest, "windows-counters.jsonl"), "utf8").trim().split(/\r?\n/).map(JSON.parse);
  assert.ok(inspectCounterTrace(counters).samples > 0);
  const memory = readFileSync(path.join(latest, "process-memory.jsonl"), "utf8").trim().split(/\r?\n/).map(JSON.parse);
  assert.ok(memory.some(row => row.workingSetBytes > 0));
}
console.log("Both native Tauri modes completed. CI timing is not an affected-PC benchmark.");
