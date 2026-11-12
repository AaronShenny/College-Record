import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, mkdir, writeFile, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { syntheticWorkspace } from "./fixture-service";
import { WorkspaceStore } from "../services/store";
// @ts-expect-error Native report is intentionally dependency-free JS for the ZIP.
import { compareResult, comparisonReport } from "../scripts/compare-tauri-startup.mjs";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceGate } from "./workspace-gate";
import { dashboardIndex } from "./summary-index";
import { verifyIndexContent } from "./verify-index";
// @ts-expect-error Diagnostic formatter is intentionally dependency-free JS.
import { smokeEvidence } from "../scripts/tauri-smoke-evidence.mjs";

function assertDeferredContentOrder(source: string) {
  // Single-line markers work with both LF and Windows CRLF checkouts.
  const ready = source.indexOf('await mark("responsive")');
  const content = source.indexOf('document.querySelector<HTMLButtonElement>(\'[data-testid="summary-load-content"]\')!.click();');
  assert.ok(ready >= 0, "Dashboard readiness marker must exist");
  assert.ok(content > ready, "Full content must be requested after dashboard readiness");
}

test("deferred-content order check handles LF and CRLF and rejects missing or early loads", async () => {
  const source = await readFile(path.join(import.meta.dirname, "summary.tsx"), "utf8");
  const lf = source.replace(/\r\n/g, "\n");
  for (const text of [lf, lf.replace(/\n/g, "\r\n")]) {
    assertDeferredContentOrder(text);
    assert.throws(() => assertDeferredContentOrder(text.replace('await mark("responsive")', "")));
    assert.throws(() => assertDeferredContentOrder(text.replace('[data-testid="summary-load-content"]', "missing")));
    const request = 'document.querySelector<HTMLButtonElement>(\'[data-testid="summary-load-content"]\')!.click();';
    assert.throws(() => assertDeferredContentOrder(request + "\n" + text.replace(request, "")));
  }
});

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
      event: "page-milestone", elapsedMs: 123, details: { stage: "dashboardLoading", error: "PRIVATE" } }) + "\n" +
      JSON.stringify({ event: "native-page-load", elapsedMs: 124, details: { event: "Finished", path: "PRIVATE" } }) + "\n");
    assert.match(smokeEvidence(directory), /dashboardLoading/);
    assert.match(smokeEvidence(directory), /page-error/);
    assert.match(smokeEvidence(directory), /native-page-load \(Finished\)/);
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
test("dashboard index contains actual metadata without source or screenshot payloads", () => {
  const workspace = syntheticWorkspace();
  const index = dashboardIndex(workspace, "10000000-0000-4000-8000-000000000001");
  const data = JSON.stringify(index);
  assert.equal(index.subjects.length, 4);
  assert.equal(index.subjects.flatMap(s => s.programs).length, 80);
  assert.equal(index.subjects[0].programs[0].title, workspace.subjects[0].programs[0].title);
  assert.ok(Buffer.byteLength(data) < 32_000);
  assert.ok(!data.includes("base64") && !data.includes("synthetic line") && !data.includes("dataUrl"));
  verifyIndexContent(index, workspace);
  // serde_json::Value sorts object keys on the native bridge. Key ordering
  // must not change equality; subject/program array ordering still matters.
  const nativeOrder = (value: any): any => Array.isArray(value) ? value.map(nativeOrder) :
    value && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, nativeOrder(value[key])])) : value;
  const bridged = nativeOrder(index);
  assert.notEqual(JSON.stringify(bridged), JSON.stringify(index));
  assert.doesNotThrow(() => verifyIndexContent(bridged, nativeOrder(workspace)));
  const changedNative = structuredClone(bridged);
  changedNative.subjects[0].programs[0].title = "incorrect native title";
  assert.throws(() => verifyIndexContent(changedNative, workspace), /does not match/);
  const reordered = structuredClone(bridged);
  reordered.subjects[0].programs.reverse();
  assert.throws(() => verifyIndexContent(reordered, workspace), /does not match/);
  const broken = structuredClone(workspace);
  broken.subjects[0].programs[0].sources = [];
  assert.throws(() => verifyIndexContent(index, broken), /does not match/);
  const renamed = structuredClone(workspace);
  renamed.subjects[0].programs[0].title = "wrong record";
  assert.throws(() => verifyIndexContent(index, renamed), /does not match/);
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
    const index = JSON.parse(await readFile(path.join(root, "dashboard-index-v2.json"), "utf8"));
    assert.deepEqual(index, dashboardIndex(syntheticWorkspace(), JSON.parse(first).revisionId));
    assert.equal(run(["--prepare", root]).status, 0);
    assert.equal(await readFile(path.join(root, "current.json"), "utf8"), first);
    const loaded = run(["--serve", root], "load\n");
    assert.equal(loaded.status, 0);
    assert.deepEqual(JSON.parse(loaded.stdout).workspace, syntheticWorkspace());
    const timing = JSON.parse(loaded.stdout).timings;
    assert.ok(timing.storeLoadMs >= 0 && timing.serializeMs >= 0 && timing.processAgeAtRequestMs >= 0);
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
  const summary = { ...native, mode: "dashboard-summary", condition: "cold",
    milestones: { ...native.milestones, dashboardPainted: 1200, detailRequested: 2000, detailVerified: 4000 } };
  const summaryLaunch = { ...launch, mode: "dashboard-summary", condition: "cold" };
  assert.equal(compareResult(summary, summaryLaunch).within15Seconds, false);
  const verified = compareResult({ ...summary, detailVerification: "passed" }, summaryLaunch);
  assert.equal(verified.within15Seconds, true);
  assert.equal(compareResult({ ...summary, detailVerification: "passed",
    milestones: { ...summary.milestones, detailRequested: 500 } }, summaryLaunch).within15Seconds, false);
  assert.equal(verified.deferredContentDurationMs, 2000);
  assert.match(comparisonReport([verified]).decision, /summary-only/);
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
  const summary = await source("summary.tsx");
  assert.ok(!summary.includes("WorkspaceProvider") && !summary.includes("saveWorkspace"));
  assertDeferredContentOrder(summary);
  assert.ok(summary.includes("verifyIndexContent(index, workspace)"));
});
