import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

test("archived opt-in trace retains its version gate and independent bounded collector", () => {
  const launcher = readFileSync(path.join(import.meta.dirname, "../scripts/Start-Startup-Check.ps1"), "utf8");
  const collector = readFileSync(path.join(import.meta.dirname, "../../../scripts/windows-startup-trace.cs"), "utf8");
  assert(launcher.includes("[switch] $TraceWindows"));
  assert(launcher.includes("[version]'0.1.6'"));
  assert(launcher.includes("--record-maker-startup-diagnostic"));
  assert(launcher.indexOf("windows-trace-requested") < launcher.indexOf("'process-launch-requested'"));
  assert(collector.includes("PdhAddEnglishCounterW"));
  assert(collector.includes("FileMode.CreateNew"));
  assert(collector.includes("seconds > 150"));
  assert(collector.includes("Environment.Exit(3)"));
  assert.doesNotMatch(collector, /GetProcesses|ProcessName|CommandLine|ReadAllText|ReadAllBytes/);
  assert.doesNotMatch(launcher, /Stop-Process\s+-Name|taskkill\.exe\s+\/IM|Set-ExecutionPolicy|Remove-Item/);
});
