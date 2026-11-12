import type { Workspace } from "../src/lib/contracts";
import { dashboardIndex, type DashboardIndex } from "./summary-index";

export function verifyIndexContent(index: DashboardIndex, workspace: Workspace) {
  if (JSON.stringify(dashboardIndex(workspace, index.revisionId)) !== JSON.stringify(index) ||
      workspace.subjects.some(s => s.programs.some(p =>
        !p.sources.some(source => source.code.length > 0) ||
        !p.outputs.some(o => o.kind === "image" && o.dataUrl.startsWith("data:image/png;base64,"))))) {
    throw new Error("Deferred content does not match the dashboard index.");
  }
}
