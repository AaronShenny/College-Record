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

const empty = { schemaVersion: 1 as const, subjects: [] };
const loaded = { ...runtime, workspaceAccount: cloud.account!.email, workspaceRevision: "cached-empty" };

test("an empty cached workspace stays in loading during sync, including the completed-download handoff", () => {
  assert.equal(workspaceAccess(loaded, cloud, empty), "opening");
  const downloaded = { ...cloud, busy: false, state: "synced", revision: "downloaded-records", syncedRevision: "downloaded-records" };
  assert.equal(workspaceAccess(loaded, downloaded, empty), "opening", "do not flash the empty dashboard before reloading the downloaded revision");
  assert.equal(workspaceAccess(loaded, { ...cloud, busy: false, state: "local" }, empty), "opening");
});

test("only a successfully synced and loaded empty revision can show the empty dashboard", () => {
  assert.equal(workspaceAccess(loaded, { ...cloud, busy: false, state: "synced", revision: "cached-empty" }, empty), "ready");
  assert.equal(workspaceAccess(loaded, { ...cloud, busy: false, state: "error" }, empty), "sync-error");
  assert.equal(workspaceAccess(loaded, { ...cloud, busy: false, state: "synced", revision: "new-local-save" }, empty, "new-local-save"), "ready",
    "the latest save receipt takes precedence over runtime information from the initial load");
});

test("a nonempty local cache remains usable during syncing or offline errors", () => {
  const cached = { schemaVersion: 1 as const, subjects: [{ id: "fixture" }] } as any;
  assert.equal(workspaceAccess(loaded, cloud, cached), "ready");
  assert.equal(workspaceAccess(loaded, { ...cloud, busy: false, state: "error" }, cached), "ready");
});
