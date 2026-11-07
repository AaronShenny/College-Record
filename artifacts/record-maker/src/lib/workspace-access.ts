import type { RuntimeInfo } from "./contracts";
import type { CloudStatus } from "./workflow-api";

/** A signed-in identity is not proof that its workspace has been loaded. */
export function workspaceAccess(runtime: RuntimeInfo | null, cloud: CloudStatus | null): "ready" | "sign-in" | "opening" {
  if (runtime?.mode !== "desktop") return "ready";
  if ((runtime as RuntimeInfo & { requiresSignIn?: boolean }).requiresSignIn && !cloud?.connected) return "sign-in";
  if (cloud?.connected && (cloud.switching || runtime.workspaceAccount !== cloud.account?.email)) return "opening";
  return "ready";
}
