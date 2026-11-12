import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import vm from "node:vm";
import path from "node:path";
import { DIAGNOSTIC_DEADLINE_MS, EXTERNAL_DEADLINE_MS, DiagnosticState, diagnosticRunName, PAGE_SIGNAL } from "./startup-diagnostic-core";
import { diagnosticPage } from "./startup-diagnostic-page";

test("diagnostic run accepts only a fresh fixed-name folder below the diagnostic root", () => {
  assert.match(diagnosticRunName([]), /^run-[0-9a-f-]+$/);
  assert.equal(diagnosticRunName(["--record-maker-startup-run=run-a01-23"]), "run-a01-23");
  for (const bad of ["../workspaces", "run-../student", "run-%TEMP%", "run-a/b", "run-a\\b", "run-\nother", "old-run"]) {
    assert.throws(() => diagnosticRunName([`--record-maker-startup-run=${bad}`]));
  }
  assert.throws(() => diagnosticRunName(["--record-maker-startup-run=run-a", "--record-maker-startup-run=run-b"]));
});

test("only a complete page and paint count as diagnostic readiness", () => {
  const state = new DiagnosticState(43210);
  for (const [name, time] of Object.entries({
    electronReady: 80000, windowCreated: 82000, domReady: 92000, scriptReady: 92500, loadFinished: 93000,
  }) as [Parameters<DiagnosticState["mark"]>[0], number][]) state.mark(name, time);
  assert.equal(state.result, "running");
  state.mark("firstPaint", 94123);
  assert.equal(state.result, "ready");
  const report = state.report();
  assert.equal(report.entryProcessAgeMs, 43210);
  assert.equal(report.milestonesMsFromProcessStart.firstPaint, 94123);
  assert.equal(report.scenario, "minimal-electron");
  assert.equal(report.profile, "fresh-isolated");
  assert.equal(report.network, "blocked");
  assert.equal(report.diagnosticDeadlineMs, 60000);
  assert.ok(EXTERNAL_DEADLINE_MS > DIAGNOSTIC_DEADLINE_MS);
  state.finish("timeout");
  assert.equal(state.result, "ready");
  const neverLoaded = new DiagnosticState(123);
  neverLoaded.mark("electronReady", 1000);
  neverLoaded.finish("timeout");
  neverLoaded.mark("domReady", 1200);
  assert.equal(neverLoaded.result, "timeout");
});

test("minimal renderer is local, has no remote resources or native bridge, and signals script readiness", () => {
  const html = diagnosticPage("fixed-nonce-for-test");
  assert.match(html, /default-src 'none'/);
  assert.match(html, /script-src 'nonce-fixed-nonce-for-test'/);
  assert.match(html, new RegExp(PAGE_SIGNAL));
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|https?:[/][/]/i);
  assert.equal(html.includes("window.recordMaker"), false);
});

test("compiled entry dispatches normal and isolated launches without cross-imports", async () => {
  const bundle = await build({
    entryPoints: [path.join(import.meta.dirname, "entry.ts")], bundle: true,
    platform: "node", format: "cjs", target: "node22", write: false,
  });
  const source = bundle.outputFiles[0].text;
  for (const [argv, expected] of [
    [["College Record Maker.exe"], ["./application.cjs"]],
    [["College Record Maker.exe", "--record-maker-startup-diagnostic"], ["./startup-diagnostic.cjs", "electron"]],
  ] as [string[], string[]][]) {
    const imported: string[] = [];
    let diagnosticStarted = false;
    const load = (name: string) => {
      imported.push(name);
      if (name === "./startup-diagnostic.cjs") return {
        startDiagnostic: (host: unknown, entryAge: number) => {
          diagnosticStarted = true; assert.equal(host, "isolated-host"); assert.equal(entryAge, 2500);
        },
      };
      if (name === "electron") return "isolated-host";
      if (name === "./application.cjs") return {};
      throw new Error(`Unexpected import: ${name}`);
    };
    vm.runInNewContext(source, {
      __filename: "/dist/desktop/main.cjs", module: { exports: {} }, exports: {},
      require: (name: string) => name === "node:module" ? { createRequire: () => load } : load(name),
      process: { argv, uptime: () => 2.5 }, console: { error: () => assert.fail("entry error") },
    });
    assert.deepEqual(imported, expected);
    assert.equal(diagnosticStarted, argv.includes("--record-maker-startup-diagnostic"));
  }
});
