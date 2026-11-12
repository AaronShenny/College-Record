// Built-in Node APIs and Windows' own .NET Framework compiler; no npm packages.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { inspectCounterTrace } from "./startup-trace-contract.mjs";

if (process.platform !== "win32") throw new Error("Build the resource collector on Windows.");
const root = path.resolve(import.meta.dirname, "..");
const destination = path.join(root, "dist/diagnostics");
mkdirSync(destination, { recursive: true });
const executable = path.join(destination, "record-maker-startup-trace.exe");
const framework = path.join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET/Framework64/v4.0.30319/csc.exe");
if (!existsSync(framework)) throw new Error("Windows .NET Framework compiler is unavailable; no runtime downloads will be attempted.");
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true, timeout: 60_000, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Windows trace check failed (${result.status}): ${result.stdout || ""} ${result.stderr || ""}`);
  return result;
};
const launcher = path.join(root, "scripts/Start-Startup-Check.ps1").replaceAll("'", "''");
run("powershell.exe", ["-NoProfile", "-Command",
  `$t=$null; $e=$null; [System.Management.Automation.Language.Parser]::ParseFile('${launcher}',[ref]$t,[ref]$e)|Out-Null; if($e){throw 'Invalid startup launcher syntax'}`]);
run(framework, ["/nologo", "/optimize+", "/target:exe", "/platform:anycpu",
  `/out:${executable}`, path.join(root, "scripts/windows-startup-trace.cs")]);

// Real Windows execution, not a mocked counter provider.
const scratch = mkdtempSync(path.join(os.tmpdir(), "record-maker-counter-smoke-"));
try {
  const output = path.join(scratch, "windows-counters.jsonl");
  run(executable, ["--output", output, "--seconds", "6"], { timeout: 30_000 });
  const rows = readFileSync(output, "utf8").trim().split(/\r?\n/).map(line => JSON.parse(line));
  const result = inspectCounterTrace(rows);
  assert.equal(rows.at(-1).reason, "duration-limit");
  // CreateNew must refuse an existing file without truncating useful evidence.
  const original = readFileSync(output, "utf8");
  const duplicate = spawnSync(executable, ["--output", output, "--seconds", "3"], { timeout: 15_000, windowsHide: true });
  assert.equal(duplicate.status, 2);
  assert.equal(readFileSync(output, "utf8"), original);
  rmSync(output);
  writeFileSync(path.join(scratch, "windows-counters.stop"), "stop");
  run(executable, ["--output", output, "--seconds", "6"], { timeout: 30_000 });
  const stopped = readFileSync(output, "utf8").trim().split(/\r?\n/).map(line => JSON.parse(line));
  assert.equal(stopped.at(-1).reason, "stop-requested");
  console.log(`Native Windows resource-counter smoke passed: ${JSON.stringify(result)}`);
  if (!result.validCounterSamples) console.warn("This runner had no valid PDH rate samples; individual unavailable states were reported explicitly.");
} finally { rmSync(scratch, { recursive: true, force: true }); }

if (process.argv.includes("--standalone")) {
  const tools = path.resolve(root, "../../generated-artifacts/startup-trace-tools");
  mkdirSync(tools, { recursive: true });
  copyFileSync(executable, path.join(tools, path.basename(executable)));
  for (const filename of ["Start-Windows-Trace.cmd", "Start-Startup-Check.ps1", "STARTUP-TRACE-README.txt"]) {
    copyFileSync(path.join(root, "scripts", filename), path.join(tools, filename));
  }
  console.log("Standalone startup trace tools staged; the existing 0.1.6+ app does not need reinstalling.");
}
