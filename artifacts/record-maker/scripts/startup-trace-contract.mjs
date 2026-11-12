import assert from "node:assert/strict";

export const counterUnits = Object.freeze({
  diskReadLatencyMs: "ms", diskWriteLatencyMs: "ms", diskQueueLength: "requests",
  diskReadsPerSec: "per-second", diskReadMBPerSec: "MiB-per-second",
  pagesInputPerSec: "pages-per-second", pageReadOperationsPerSec: "per-second",
  pagesOutputPerSec: "pages-per-second", committedMB: "MiB", commitLimitMB: "MiB",
  pageFileUsagePercent: "percent", systemCpuPercent: "percent",
});
const nonnegative = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
const statuses = new Set(["ok", "unavailable", "query-error", "warming-up", "invalid-data"]);
const keys = (value, allowed) => {
  assert(value && typeof value === "object" && !Array.isArray(value));
  assert(Object.keys(value).every(key => allowed.includes(key)), "Unexpected diagnostic field");
};

/** Validate actual Windows output, including unavailable counters and privacy boundaries. */
export function inspectCounterTrace(rows) {
  assert(rows.length >= 3, "Expected start, sample and finish");
  assert.equal(rows[0].event, "collector-start");
  assert.equal(rows.at(-1).event, "collector-finished");
  let samples = 0, validCounterSamples = 0, previousAge = -1;
  for (const row of rows) {
    keys(row, ["schema", "event", "at", "elapsedMs", "sampleIntervalMs", "maxSeconds", "diskScope", "memory", "counters", "collector", "reason"]);
    assert.equal(row.schema, 1);
    assert(Number.isFinite(Date.parse(row.at)), "Expected timestamp");
    assert(nonnegative(row.elapsedMs) && row.elapsedMs >= previousAge);
    previousAge = row.elapsedMs;
    if (row.event === "collector-start") {
      assert.equal(row.sampleIntervalMs, 2000);
      assert.equal(row.diskScope, "all-physical-disks");
      assert(row.maxSeconds >= 3 && row.maxSeconds <= 150);
    } else if (row.event === "collector-finished") {
      assert(["stop-requested", "duration-limit"].includes(row.reason));
    } else assert.equal(row.event, "sample");
    if (row.memory) {
      keys(row.memory, ["status", "code", "availableMB", "totalMB", "loadPercent"]);
      assert(["ok", "unavailable"].includes(row.memory.status));
      if (row.memory.status === "ok") {
        assert(nonnegative(row.memory.availableMB) && row.memory.totalMB > 0);
        assert(row.memory.availableMB <= row.memory.totalMB);
        assert(nonnegative(row.memory.loadPercent) && row.memory.loadPercent <= 100);
      } else assert.match(row.memory.code, /^0x[0-9A-F]{8}$/);
    }
    if (row.event !== "sample") continue;
    samples++;
    assert(row.memory, "Memory status must not be silently omitted");
    assert.deepEqual(Object.keys(row.counters).sort(), Object.keys(counterUnits).sort());
    for (const [name, metric] of Object.entries(row.counters)) {
      keys(metric, ["status", "unit", "value", "code"]);
      assert(statuses.has(metric.status));
      assert.equal(metric.unit, counterUnits[name]);
      if (metric.status === "ok") { assert(nonnegative(metric.value)); validCounterSamples++; }
      else assert.equal(metric.value, null, "Unavailable must not look like a measured zero");
      if (metric.code !== undefined) assert.match(metric.code, /^0x[0-9A-F]{8}$/);
    }
    keys(row.collector, ["workingSetMB", "cpuMs"]);
    assert(nonnegative(row.collector.workingSetMB) && nonnegative(row.collector.cpuMs));
  }
  assert(samples > 0);
  return { samples, validCounterSamples };
}
