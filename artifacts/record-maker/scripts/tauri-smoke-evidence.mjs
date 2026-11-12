import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const events = new Set(["rust-entry", "host-setup", "profile-selected", "window-create-start",
  "window-created", "page-load", "native-page-load", "page-milestone", "interactive-ready", "test-finished",
  "deadline", "host-error", "service-isolation-failed", "node-start-requested",
  "node-spawned", "fixture-loaded", "fixture-failed", "webview-browser-version",
  "summary-read-started", "summary-read-complete", "summary-read-failed",
  "node-response-received", "node-response-decoded", "node-service-timing"]);
const stages = new Set(["scriptReady", "domReady", "loadFinished", "paintFrames", "dashboardPainted",
  "interactionComplete", "responsive", "pageError", "dashboardLoading", "dashboardDataReady",
  "dashboardOpening", "dashboardClosing", "detailRequested", "detailVerified"]);
function read(directory, name) {
  try {
    const file = path.join(directory, name);
    return statSync(file).size <= 1024 * 1024 ? readFileSync(file, "utf8").replace(/^\uFEFF/, "") : "";
  } catch { return ""; }
}
export function smokeEvidence(directory) {
  let summary = {};
  try { summary = JSON.parse(read(directory, "startup-summary.json")); } catch {}
  const mode = ["minimal", "dashboard", "dashboard-summary"].includes(summary.mode) ? summary.mode : "unknown";
  const result = ["ready", "timeout", "page-error", "closed-before-ready", "host-error"].includes(summary.result) ? summary.result : "unavailable";
  const lines = [`Native Tauri check: mode=${mode}; result=${result}`];
  for (const line of read(directory, "performance.jsonl").split(/\r?\n/).slice(-30)) {
    try {
      const row = JSON.parse(line);
      if (!events.has(row.event)) continue;
      const time = Number.isFinite(row.elapsedMs) ? row.elapsedMs : "?";
      const stage = stages.has(row.details?.stage) ? ` (${row.details.stage})` : "";
      const page = row.event === "native-page-load" && ["Started", "Finished"].includes(row.details?.event)
        ? ` (${row.details.event})` : "";
      const category = ["node-spawn", "job-isolation", "decode", "fixture-load", "service-io"].includes(row.details?.category)
        ? ` (${row.details.category})` : "";
      const timings = row.event === "node-service-timing"
        ? ["processAgeAtRequestMs", "storeLoadMs", "serializeMs"].filter(k =>
          Number.isFinite(row.details?.[k]) && row.details[k] >= 0 && row.details[k] <= 60_000)
          .map(k => ` ${k}=${row.details[k]}`).join("") : "";
      lines.push(`  ${time}ms ${row.event}${stage}${page}${category}${timings}`);
    } catch {}
  }
  // No raw exceptions, paths, fixture contents or unrelated JSON fields.
  return lines.join("\n");
}
