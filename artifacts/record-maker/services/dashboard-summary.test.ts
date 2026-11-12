import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { WorkspaceStore } from "./store";
import { workspaceSchema, type Program, type Workspace } from "../src/lib/contracts";
import { DASHBOARD_SUMMARY_FILE, dashboardSummarySchema, deriveDashboardSummary } from "../src/lib/dashboard-summary";

function fixture(): Workspace {
  const stamp = new Date().toISOString();
  const program = (number: number): Program => ({
    id: randomUUID(), number, title: `Program ${number}`, question: "Private question fixture",
    createdAt: stamp, updatedAt: stamp, trashedAt: null, outputMayBeStale: false,
    sources: [{ id: randomUUID(), name: "sample.py", role: "Main code", code: "private-source-fixture", include: true }],
    outputs: [{ id: randomUUID(), kind: "text", name: "Output", text: "private-output-fixture", include: true }],
  });
  const ready = program(2), stale = { ...program(1), outputMayBeStale: true }, trashed = { ...program(3), trashedAt: stamp };
  return workspaceSchema.parse({ schemaVersion: 1, subjects: [{
    id: randomUUID(), name: "Fixture", semester: 1, courseCode: "", updatedAt: stamp, trashedAt: null,
    programs: [ready, stale, trashed],
  }] });
}
test("summary retains exact readiness and program order without code, outputs or questions", () => {
  const workspace = fixture(), revision = randomUUID();
  const summary = deriveDashboardSummary(workspace, revision, null);
  assert.deepEqual(summary.subjects[0].programs.map(program => [program.number, program.state]), [[1, "stale"], [2, "ready"]]);
  const serialized = JSON.stringify(summary);
  for (const privateValue of ["private-source-fixture", "private-output-fixture", "Private question fixture"]) {
    assert.ok(!serialized.includes(privateValue));
  }
  assert.equal(workspaceSchema.safeParse(summary).success, false);
  assert.equal(dashboardSummarySchema.safeParse({ ...summary, sources: [] }).success, false);
});
test("every saved immutable revision gets an account-bound local-only summary before its pointer commits", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "record-summary-"));
  const accountKey = "0123456789abcdef0123456789abcdef";
  const root = path.join(parent, `account-${accountKey}`), store = new WorkspaceStore(root);
  try {
    const workspace = fixture();
    const receipt = await store.save(workspace);
    const index = dashboardSummarySchema.parse(JSON.parse(await fs.readFile(path.join(root, "snapshots", receipt.revisionId, DASHBOARD_SUMMARY_FILE), "utf8")));
    assert.equal(index.revisionId, (await store.pointer())!.revisionId);
    assert.equal(index.accountKey, accountKey);
    assert.deepEqual(await store.load(), workspace, "Derived metadata must not replace full source or output data.");
    const manifest = JSON.parse(await fs.readFile(path.join(root, "snapshots", receipt.revisionId, "app.json"), "utf8"));
    assert.deepEqual(Object.keys(manifest).sort(), ["schemaVersion", "subjects"]);
    assert.ok(!JSON.stringify(manifest).includes("dashboard-summary"));
  } finally { await fs.rm(parent, { recursive: true, force: true }); }
});
