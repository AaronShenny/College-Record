import type { Workspace } from "../src/lib/contracts";
import { dashboardIndex, type DashboardIndex } from "./summary-index";

// JSON object key order is not semantic and may change across Rust/JS IPC.
// Array order and every value remain significant.
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
      a.every((value, index) => sameJson(value, b[index]));
  }
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length &&
    keys.every(key => Object.prototype.hasOwnProperty.call(right, key) && sameJson(left[key], right[key]));
}

export function verifyIndexContent(index: DashboardIndex, workspace: Workspace) {
  if (!sameJson(dashboardIndex(workspace, index.revisionId), index) ||
      workspace.subjects.some(s => s.programs.some(p =>
        !p.sources.some(source => source.code.length > 0) ||
        !p.outputs.some(o => o.kind === "image" && o.dataUrl.startsWith("data:image/png;base64,"))))) {
    throw new Error("Deferred content does not match the dashboard index.");
  }
}
