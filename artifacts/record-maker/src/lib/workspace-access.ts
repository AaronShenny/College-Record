import type { RuntimeInfo, Workspace } from "./contracts";
import type { CloudStatus } from "./workflow-api";

/** A signed-in identity is not proof that its workspace has been loaded. */
export function workspaceAccess(runtime: RuntimeInfo | null, cloud: CloudStatus | null, workspace?: Workspace | null, workspaceRevision = runtime?.workspaceRevision): "ready" | "sign-in" | "opening" | "sync-error" {
  if (runtime?.mode !== "desktop") return "ready";
  if ((runtime as RuntimeInfo & { requiresSignIn?: boolean }).requiresSignIn && !cloud?.connected) return "sign-in";
  if (cloud?.connected && (cloud.switching || runtime.workspaceAccount !== cloud.account?.email)) return "opening";
  if (cloud?.connected && workspace?.subjects.length === 0) {
    // An empty local cache is not evidence that the student's Drive is empty.
    // Also cover the handoff between a completed download and renderer reload.
    if (cloud.busy || cloud.state === "syncing") return "opening";
    if (cloud.state === "error") return "sync-error";
    if (cloud.state !== "synced" || !cloud.revision || cloud.revision !== workspaceRevision) return "opening";
  }
  return "ready";
}
