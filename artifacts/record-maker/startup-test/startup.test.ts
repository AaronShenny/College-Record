import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, mkdir, writeFile, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { syntheticWorkspace } from "./fixture-service";
import { WorkspaceStore } from "../desktop/store";
// @ts-expect-error Native report is intentionally dependency-free JS for the ZIP.
import { compareResult, comparisonReport } from "../scripts/compare-tauri-startup.mjs";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceGate } from "./workspace-gate";
// @ts-expect-error Diagnostic formatter is intentionally dependency-free JS.
import { smokeEvidence } from "../scripts/tauri-smoke-evidence.mjs";

test("dashboard waits for hydration and never renders record consumers early", () => {
  let renders = 0;
  function DashboardConsumer() { renders++; return createElement("div", null, "Dashboard ready"); }
  const render = (loaded: boolean, failed = false) => renderToStaticMarkup(
    createElement(WorkspaceGate, { loaded, failed, children: createElement(DashboardConsumer) }));
  assert.match(render(false), /Loading synthetic/);
  assert.equal(renders, 0);
  assert.match(render(true), /Dashboard ready/);
  assert.equal(renders, 1);
  assert.throws(() => render(false, true), /could not be loaded/);
  assert.equal(renders, 1);
});
test("CI prints useful stages without copying private diagnostic fields", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tauri-evidence-"));
  try {
    await writeFile(path.join(directory, "startup-summary.json"), JSON.stringify({ mode: "dashboard", result: "page-error", error: "PRIVATE" }));
    await writeFile(path.join(directory, "performance.jsonl"), JSON.stringify({
      event: "page-milestone", elapsedMs: 123, details: { stage: "dashboardLoading", error: "PRIVATE" } }) + "\n");
    assert.match(smokeEvidence(directory), /dashboardLoading/);
    assert.match(smokeEvidence(directory), /page-error/);
    assert.ok(!smokeEvidence(directory).includes("PRIVATE"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("synthetic data round-trips through the unchanged real snapshot engine", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tauri-fixture-"));
  try {
    const fixture = syntheticWorkspace();
    assert.equal(fixture.subjects.length, 4);
    assert.equal(fixture.subjects.flatMap(s => s.programs).length, 80);
    const images = fixture.subjects.flatMap(s => s.programs.flatMap(p => p.outputs.filter(o => o.kind === "image").map(o => o.dataUrl)));
    assert.equal(new Set(images).size, 80);
    assert.ok(images.join("").length > 4_000_000);
    await new WorkspaceStore(directory).save(fixture);
    assert.deepEqual(await new WorkspaceStore(directory).load(), fixture);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("bundled service prepares and serves only the isolated test root", async () => {
  const local = await mkdtemp(path.join(os.tmpdir(), "tauri-service-"));
  const root = path.join(local, "CollegeRecordMaker-TauriChecks", "fixture-v1");
  const script = path.resolve(import.meta.dirname, "../dist/tauri-startup-service.cjs");
  const run = (args: string[], input?: string) => spawnSync(process.execPath, [script, ...args],
    { encoding: "utf8", env: { ...process.env, LOCALAPPDATA: local }, input, timeout: 20_000, maxBuffer: 16 * 1024 * 1024 });
  try {
    assert.equal(run(["--prepare", root]).status, 0);
    const first = await readFile(path.join(root, "current.json"), "utf8");
    assert.equal(run(["--prepare", root]).status, 0);
    assert.equal(await readFile(path.join(root, "current.json"), "utf8"), first);
    const loaded = run(["--serve", root], "load\n");
    assert.equal(loaded.status, 0);
    assert.deepEqual(JSON.parse(loaded.stdout).workspace, syntheticWorkspace());
    assert.notEqual(run(["--prepare", path.join(local, "production")]).status, 0);
    assert.notEqual(run(["--serve", root], "arbitrary-command\n").status, 0);
  } finally { await rm(local, { recursive: true, force: true }); }
});
test("service refuses redirected fixtures and does not log private failures", async () => {
  const local = await mkdtemp(path.join(os.tmpdir(), "tauri-boundary-"));
  try {
    const base = path.join(local, "CollegeRecordMaker-TauriChecks");
    const outside = path.join(local, "private-student-records");
    await mkdir(base); await mkdir(outside);
    await writeFile(path.join(outside, "do-not-touch"), "original");
    await symlink(outside, path.join(base, "fixture-v1"), process.platform === "win32" ? "junction" : "dir");
    const r = spawnSync(process.execPath, [path.resolve(import.meta.dirname, "../dist/tauri-startup-service.cjs"),
      "--prepare", path.join(base, "fixture-v1")], { env: { ...process.env, LOCALAPPDATA: local }, encoding: "utf8" });
    assert.notEqual(r.status, 0);
    assert.ok(!r.stdout.includes(outside));
    assert.equal(await readFile(path.join(outside, "do-not-touch"), "utf8"), "original");
  } finally { await rm(local, { recursive: true, force: true }); }
});
test("comparison never treats minimal/CI/warm results as proof of cold dashboard success", () => {
  const native = { host: "tauri", mode: "minimal", condition: "ci", profile: "fresh", result: "ready", readyAtMs: 1500,
    milestones: Object.fromEntries(["scriptReady", "domReady", "loadFinished", "paintFrames", "interactionComplete", "responsive"].map(key => [key, 1000])) };
  const launch = { ...native, exitCode: 0, launchToReadyObservedMs: 2000, traceEnabled: true };
  const ci = compareResult(native, launch);
  assert.match(comparisonReport([ci]).decision, /Await cold/);
  const cold = compareResult({ ...native, condition: "cold" }, { ...launch, condition: "cold" });
  assert.match(comparisonReport([cold]).decision, /collect.*dashboard/);
  const slow = compareResult({ ...native, condition: "cold" }, { ...launch, condition: "cold", launchToReadyObservedMs: 35000 });
  assert.equal(slow.within15Seconds, false);
  assert.equal(compareResult(native, { ...launch, launchToReadyObservedMs: null }).within15Seconds, false);
  assert.equal(compareResult({ ...native, milestones: {} }, launch).within15Seconds, false);
  assert.throws(() => compareResult(native, { ...launch, profile: "reused" }));
});
test("diagnostic build keeps production interfaces unchanged and network access unavailable", async () => {
  const source = (name: string) => readFile(path.join(import.meta.dirname, name), "utf8");
  const config = JSON.parse(await source("src-tauri/tauri.conf.json"));
  assert.match(config.app.security.csp, /connect-src ipc: http:\/\/ipc.localhost/);
  assert.deepEqual(config.app.security.capabilities, []);
  assert.equal(config.bundle.active, false);
  const native = await source("src-tauri/src/windows.rs");
  assert.ok(!native.includes("shell(true)"));
  assert.ok(native.includes("Command::new(base.join(\"node.exe\"))"));
  assert.ok(native.includes(".additional_browser_args(\"--disable-gpu"));
  const service = await source("fixture-service.ts");
  assert.ok(!/from ["'].*(?:google-auth|drive-sync|worker-client|electron)/.test(service));
  const dashboard = await source("dashboard.tsx");
  assert.ok(dashboard.indexOf('Object.defineProperty(window, "recordMaker"') < dashboard.indexOf('import("../src/hooks/use-workspace")'));
});
