import React, { type ReactNode } from "react";

// WorkspaceProvider deliberately renders children while it hydrates. The
// production router guards that interval; this isolated entry needs it too.
export function WorkspaceGate({ loaded, failed, children }: {
  loaded: boolean; failed: boolean; children: ReactNode;
}) {
  if (failed) throw new Error("Synthetic dashboard workspace could not be loaded.");
  if (!loaded) return <p role="status">Loading synthetic test records…</p>;
  return children;
}
