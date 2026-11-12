import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { counterUnits, inspectCounterTrace } from "../scripts/startup-trace-contract.mjs";

function rows() {
  const memory = { status: "ok", availableMB: 110, totalMB: 3895, loadPercent: 97 };
  const counters: Record<string, { status: string; value: number | null; unit: string; code?: string }> =
    Object.fromEntries(Object.entries(counterUnits).map(([key, unit]) => [
    key, { status: "ok", value: 0, unit },
  ]));
  const common = { schema: 1, at: "2026-11-12T12:00:00Z" };
  return [
    { ...common, event: "collector-start", elapsedMs: 0, sampleIntervalMs: 2000, maxSeconds: 150, diskScope: "all-physical-disks", memory },
    { ...common, event: "sample", elapsedMs: 2000, memory, counters, collector: { workingSetMB: 18, cpuMs: 20 } },
    { ...common, event: "collector-finished", elapsedMs: 4000, reason: "stop-requested" },
  ] as const;
}
test("Windows trace distinguishes real zero measurements from unavailable counter data", () => {
  assert.equal(inspectCounterTrace(rows()).validCounterSamples, 12);
  const unavailable = rows();
  for (const value of Object.values(unavailable[1].counters!)) {
    Object.assign(value, { status: "unavailable", value: null, code: "0xC0000BB8" });
  }
  assert.equal(inspectCounterTrace(unavailable).validCounterSamples, 0);
  Object.values(unavailable[1].counters!)[0].value = 0;
  assert.throws(() => inspectCounterTrace(unavailable), /Unavailable must not look/);
});
test("Windows trace rejects unbounded fields, missing counters and invalid values", () => {
  const privateRow = rows();
  Object.assign(privateRow[1], { account: "must-not-be-recorded" });
  assert.throws(() => inspectCounterTrace(privateRow), /Unexpected diagnostic field/);
  const missing = rows();
  delete missing[1].counters!.diskReadLatencyMs;
  assert.throws(() => inspectCounterTrace(missing));
  const invalid = rows();
  invalid[1].counters!.diskReadLatencyMs.value = Number.NaN;
  assert.throws(() => inspectCounterTrace(invalid));
});
test("opt-in trace retains the isolated app flag, version gate and independent bounded collector", () => {
  const scripts = path.join(import.meta.dirname, "../scripts");
  const launcher = readFileSync(path.join(scripts, "Start-Startup-Check.ps1"), "utf8");
  const collector = readFileSync(path.join(scripts, "windows-startup-trace.cs"), "utf8");
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
