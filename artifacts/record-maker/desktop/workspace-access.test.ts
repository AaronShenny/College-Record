import { test } from "node:test";
import assert from "node:assert/strict";
import { workspaceAccess } from "../src/lib/workspace-access";
import type { RuntimeInfo } from "../src/lib/contracts";
import type { CloudStatus } from "../src/lib/workflow-api";

const runtime: RuntimeInfo = { mode: "desktop", version: "test", platform: "win32", storageLabel: "fixture",
  driveConnected: true, pythonAvailable: null, requiresSignIn: true, workspaceAccount: null };
const cloud: CloudStatus = { connected: true, configured: true, account: { name: "Fixture", email: "fixture@rajagiri.edu" }, state: "syncing", busy: true };

test("sign-in does not expose the previous workspace while Drive downloads", () => {
  assert.equal(workspaceAccess(runtime, cloud), "opening");
  assert.equal(workspaceAccess({ ...runtime, workspaceAccount: cloud.account!.email }, cloud), "ready",
    "normal background sync must not block editing a loaded account");
  assert.equal(workspaceAccess({ ...runtime, workspaceAccount: cloud.account!.email }, { ...cloud, switching: true }), "opening");
  assert.equal(workspaceAccess(runtime, { ...cloud, connected: false }), "sign-in");
});

test("a different account's workspace can never be treated as ready", () => {
  assert.equal(workspaceAccess({ ...runtime, workspaceAccount: "previous@rajagiri.edu" }, { ...cloud, state: "synced", busy: false }), "opening");
  assert.equal(workspaceAccess({ ...runtime, mode: "browser-preview" }, cloud), "ready");
});
