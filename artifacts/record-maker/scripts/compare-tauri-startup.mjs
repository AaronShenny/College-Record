import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Transcribed timing evidence only. No uploaded logs, paths or account information.
export const electronBaseline = [
  { scenario: "minimal", condition: "warm", profile: "fresh", result: "ready",
    clock: "process age, not shortcut-to-ready", electronReadyMs: 1846,
    windowCreatedMs: 3937, firstPaintMs: 9096, lastRequiredMilestoneMs: 9390 },
  { scenario: "minimal", condition: "cold", profile: "fresh", result: "timeout",
    clock: "early diagnostic timing", electronReadyMs: 21168,
    windowCreatedMs: 36259, windowConstructionMs: 15088, lastRequiredMilestoneMs: null },
  { scenario: "minimal", condition: "cold", profile: "fresh", result: "timeout",
    clock: "early diagnostic timing", electronReadyMs: 3183,
    windowCreatedMs: 35272, windowConstructionMs: 32083, lastRequiredMilestoneMs: null,
    availableMemoryMinimumMB: 20.055 },
];
export function compareResult(native, launcher, memory = []) {
  if (native.host !== "tauri" || launcher.host !== "tauri" ||
    !["minimal", "dashboard", "dashboard-summary"].includes(native.mode) ||
    native.mode !== launcher.mode || native.condition !== launcher.condition || native.profile !== launcher.profile) {
    throw new Error("Inconsistent benchmark summaries.");
  }
  const required = ["scriptReady", "domReady", "loadFinished", "paintFrames", "interactionComplete", "responsive",
    ...(native.mode !== "minimal" ? ["dashboardPainted"] : [])];
  const complete = required.every(key => Number.isFinite(native.milestones?.[key])) && !("pageError" in (native.milestones || {}));
  const detailsComplete = native.mode !== "dashboard-summary" ||
    (native.detailVerification === "passed" && Number.isFinite(native.milestones?.detailRequested) &&
     Number.isFinite(native.milestones?.detailVerified) &&
     native.milestones.detailRequested >= native.readyAtMs &&
     native.milestones.detailVerified >= native.milestones.detailRequested);
  const ready = complete && detailsComplete &&
    native.result === "ready" && launcher.exitCode === 0 &&
    Number.isFinite(native.readyAtMs) && native.readyAtMs > 0 &&
    Number.isFinite(launcher.launchToReadyObservedMs) && launcher.launchToReadyObservedMs > 0;
  const samples = memory.filter(s => s.event === "process-tree-sample" &&
    s.status === "ok" && Number.isFinite(s.workingSetBytes) && Number.isFinite(s.privateBytes));
  return {
    mode: native.mode, condition: native.condition, profile: native.profile, result: native.result,
    workload: native.mode === "dashboard-summary" ? "summary-first-rust" : native.mode === "minimal" ? "minimal" : "full-hydration-node",
    detailVerification: native.detailVerification ?? "not-applicable",
    detailVerifiedAtNativeMs: native.milestones?.detailVerified ?? null,
    deferredContentDurationMs: Number.isFinite(native.milestones?.detailVerified) && Number.isFinite(native.milestones?.detailRequested)
      ? native.milestones.detailVerified - native.milestones.detailRequested : null,
    launchToReadyObservedMs: ready ? launcher.launchToReadyObservedMs : null,
    clock: "external monotonic observation; upper bound with <=250ms polling delay",
    within15Seconds: ready ? launcher.launchToReadyObservedMs <= 15000 : false,
    completeMemorySamples: samples.length,
    maxProcessTreeWorkingSetMB: samples.length ? Math.max(...samples.map(s => s.workingSetBytes)) / 1048576 : null,
    maxProcessTreePrivateMB: samples.length ? Math.max(...samples.map(s => s.privateBytes)) / 1048576 : null,
    traceEnabled: launcher.traceEnabled,
    interpretation: native.condition === "ci"
      ? "Build smoke check only. Not evidence about the affected PC."
      : native.mode === "minimal"
        ? "Host-only result. Does not establish the dashboard target or migration parity."
        : native.mode === "dashboard-summary"
          ? "Read-only summary dashboard, not the full production React dashboard. Native index first; all full synthetic records verified separately after readiness. Excludes sign-in, Drive, Python and editing."
          : "Synthetic cached dashboard; excludes authentication, Drive, Python and production migration.",
  };
}
export function comparisonReport(results) {
  const cold = results.filter(r => r.condition === "cold");
  return {
    schemaVersion: 1, electronBaseline, tauriResults: results,
    decision: cold.length === 0
      ? "Await cold measurements on the affected 4 GB/HDD PC; do not decide from CI or warm launches."
      : cold.some(r => !r.within15Seconds)
        ? "At least one cold test missed the target or failed. Do not approve full migration from these results."
        : cold.some(r => r.mode === "dashboard-summary")
          ? "Promising summary-only cold dashboard result; compare its separate deferred-content time and verify production integration before migration."
        : cold.some(r => r.mode === "dashboard")
          ? "Promising cold synthetic-dashboard result; repeat cold runs and verify feature parity before migration."
          : "Minimal cold host succeeded; collect the representative cold dashboard result before deciding.",
    caveats: [
      "Historical Electron minimal test has different paint/interaction milestones and clock origins. No exact speedup ratio is claimed.",
      "Compare fresh/reused profiles, cold/warm labels and traced/untraced runs separately.",
      "Process-tree working-set sums can double-count shared pages; private bytes are committed, not resident RAM.",
      "An empty or loading window is not a usable dashboard. This experiment is not full feature parity.",
      "dashboard-summary is a different, explicitly lighter workload. Compare summary readiness and deferred-content time separately from the original full dashboard.",
    ],
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.argv.slice(2).length) throw new Error("Provide one or more test run folders.");
    const rows = process.argv.slice(2).map(directory => {
      const read = name => JSON.parse(readFileSync(path.join(directory, name), "utf8").replace(/^\uFEFF/, ""));
      let memory = [];
      try { memory = readFileSync(path.join(directory, "process-memory.jsonl"), "utf8").trim().split(/\r?\n/).map(JSON.parse); } catch {}
      return compareResult(read("startup-summary.json"), read("launcher-summary.json"), memory);
    });
    console.log(JSON.stringify(comparisonReport(rows), null, 2));
  } catch {
    console.error("Comparison unavailable: supply complete test run folders containing both summaries.");
    process.exitCode = 2;
  }
}
