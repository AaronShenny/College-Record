// End-to-end Windows launcher/counter integration, without an account or records.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { inspectCounterTrace } from "../../../scripts/startup-trace-contract.mjs";

if (process.platform !== "win32") throw new Error("Run this integration check on Windows.");
const installed = path.resolve(process.argv[2]);
const run = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass",
  "-File", path.join(installed, "Start-Startup-Check.ps1"), "-TraceWindows", "-NoExplorer",
  "-AppPath", path.join(installed, "College Record Maker.exe")],
{ encoding: "utf8", timeout: 100_000, windowsHide: true });
if (run.error) throw run.error;
assert.equal(run.status, 0, `Windows trace launcher failed: ${run.stdout} ${run.stderr}`);
const result = /^Results:\s*(.+)$/m.exec(run.stdout);
assert(result, "Launcher did not identify the results directory");
const directory = result[1].trim();
const readRows = relative => readFileSync(path.join(directory, relative), "utf8").trim()
  .split(/\r?\n/).map(line => JSON.parse(line));
const launcher = readRows("launcher.jsonl");
assert(launcher.some(row => ["windows-trace-ready", "windows-trace-not-ready-before-launch"].includes(row.event)));
assert(launcher.some(row => row.event === "windows-trace-exited" && row.exitCode === 0));
assert(!launcher.some(row => row.event === "launcher-error"));
const summary = JSON.parse(readFileSync(path.join(directory, "startup-summary.json"), "utf8"));
assert.equal(summary.result, "ready");
assert.equal(summary.profile, "fresh-isolated");
assert.equal(summary.network, "blocked");
const counters = inspectCounterTrace(readRows("windows-counters.jsonl"));
console.log(`Packaged Windows trace launcher passed: ${JSON.stringify(counters)}`);
// Keep only this run's small CI evidence in the disposable runner. No account
// directories, normal app profiles, or cached student records are opened.
