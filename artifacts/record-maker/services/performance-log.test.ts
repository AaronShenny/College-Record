import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { PerformanceLog } from "./performance-log";
import { diagnosticContext } from "./diagnostic-context";
import { diagnosticError, diagnosticOutcome } from "./diagnostic-policy";
import { diagnosticControl, diagnosticPage, parseRendererEvent } from "./renderer-diagnostics";

test("performance diagnostics export ordered timings without workspace or credential contents", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "record-perf-"));
  try {
    const log = new PerformanceLog(root, "test-version");
    log.record("window-loaded", { durationMs: 12 });
    log.record("window-unresponsive");
    const exported = path.join(root, "export.txt");
    await log.exportTo(exported);
    const rows = (await fs.readFile(exported, "utf8")).trim().split("\n").map(row => JSON.parse(row));
    assert.deepEqual(rows.map(row => row.event), ["window-loaded", "window-unresponsive", "diagnostics-export"]);
    assert.equal(rows[0].durationMs, 12);
    assert.ok(rows.every(row => row.mainRssMB > 0 && row.version === "test-version"));
    assert.ok(rows.every(row => row.diagnosticsVersion === 3 && row.systemTotalMB > 0 && row.systemFreeMB >= 0 && row.mainHeapMB > 0));
    assert.equal(new Set(rows.map(row => row.sessionId)).size, 1);
    assert.deepEqual(rows.map(row => row.sequence), [1, 2, 3]);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("traces correlate failures without leaking messages, payloads or credentials", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "record-trace-"));
  try {
    const log = new PerformanceLog(root, "test");
    let operationId: string | undefined;
    await assert.rejects(log.trace("generate", async () => {
      operationId = diagnosticContext.getStore();
      throw new Error("Microsoft Word failed at C:\\Users\\private-name\\secret.docx TOKEN=secret");
    }));
    const output = path.join(root, "export.txt");
    await log.exportTo(output);
    const raw = await fs.readFile(output, "utf8");
    const rows = raw.trim().split("\n").map(row => JSON.parse(row));
    assert.equal(rows[0].operationId, operationId);
    assert.equal(rows[1].operationId, operationId);
    assert.equal(rows[1].category, "word-or-pdf");
    assert.equal(rows[1].ok, false);
    assert.doesNotMatch(raw, /private-name|secret|TOKEN|Users/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("UI diagnostics remove values, private route IDs and arbitrary labels", () => {
  assert.equal(diagnosticPage("#/program/private-subject/private-program?token=secret"), "program");
  assert.equal(diagnosticControl("button-user-secret", "button"), "button");
  assert.equal(diagnosticControl("button-save-now", "button"), "button-save-now");
  assert.deepEqual(parseRendererEvent({ kind: "paste", page: "program", control: "secret", value: "secret", content: "secret" }),
    { kind: "paste", page: "program", control: "other" });
  assert.equal(parseRendererEvent({ kind: "secret", page: "program" }), null);
  assert.equal(parseRendererEvent({ kind: "click", page: "private-subject" }), null);
  assert.deepEqual(diagnosticError(Object.assign(new Error("private-path"), { code: "ENOSPC" })), { category: "system-io", code: "ENOSPC" });
  assert.deepEqual(diagnosticOutcome({ documents: [{ content: "secret" }], failures: [{ message: "Microsoft Word private-path" }] }),
    { documents: 1, failures: 1, failureCategories: ["word-or-pdf"] });
});

test("exports include rotated history and logging survives an unwritable directory", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "record-rotate-"));
  try {
    const log = new PerformanceLog(root, "test", 900);
    log.record("first"); await log.flush();
    log.record("second"); await log.flush();
    log.record("third"); await log.flush();
    const output = path.join(root, "export.txt");
    await log.exportTo(output);
    const rows = (await fs.readFile(output, "utf8")).trim().split("\n").map(row => JSON.parse(row));
    assert.ok(rows.some(row => row.event === "third"));
    assert.ok(rows.some(row => row.event === "diagnostics-export"));
    await fs.writeFile(path.join(root, "blocked"), "not a directory");
    const bad = new PerformanceLog(path.join(root, "blocked"), "test");
    bad.record("unwritable");
    await bad.flush(); // No rejection, hang or infinite retry on disk failure.
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
