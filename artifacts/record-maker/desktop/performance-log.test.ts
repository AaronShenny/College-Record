import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { PerformanceLog } from "./performance-log";

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
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
