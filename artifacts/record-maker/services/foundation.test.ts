import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { WorkspaceStore, resolveInside } from "./store";
import { PythonWorker } from "./worker-client";
import { workspaceSchema, type Workspace } from "../src/lib/contracts";

function fixture(): Workspace {
  return { schemaVersion: 1, subjects: [{
    id: randomUUID(), semester: 2, name: "Data Structures", courseCode: "CS201",
    updatedAt: new Date().toISOString(), trashedAt: null,
    programs: [{
      id: randomUUID(), number: 4, title: "", question: "", createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), trashedAt: null, outputMayBeStale: true,
      sources: [{ id: randomUUID(), name: "main.c", role: "Main code", code: "UNTRUSTED_STUDENT_CODE_NEVER_EXECUTE", include: true }],
      outputs: [
        { id: randomUUID(), kind: "text", name: "Result", text: "1 2 3", include: true },
        { id: randomUUID(), kind: "image", name: "Screenshot", include: true,
          dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE0kAAAAASUVORK5CYII=" },
      ],
    }],
  }] };
}
async function tempStore() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "record-maker-test-"));
  return { root, store: new WorkspaceStore(root), cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}
test("empty workspace loads without seeding fictional student records", async () => {
  const { store, cleanup } = await tempStore();
  try { assert.deepEqual(await store.load(), { schemaVersion: 1, subjects: [] }); } finally { await cleanup(); }
});
test("round trip persists incomplete drafts, code as actual files, and a durable pending queue", async () => {
  const { store, root, cleanup } = await tempStore();
  try {
    const workspace = fixture();
    const receipt = await store.save(workspace);
    assert.equal(receipt.pendingItems, 2);
    assert.deepEqual(await new WorkspaceStore(root).load(), workspace);
    const snapshot = await store.snapshotPath();
    const files = await fs.readdir(snapshot, { recursive: true });
    const programFile = files.find(f => f.endsWith("program.json"))!;
    const programJSON = await fs.readFile(path.join(snapshot, programFile), "utf8");
    assert.ok(!programJSON.includes("UNTRUSTED_STUDENT_CODE"));
    assert.ok(files.some(f => f.endsWith(".c")));
    assert.ok(files.some(f => f.endsWith(".png")));
    assert.ok(!programJSON.includes("data:image"));
    assert.equal(JSON.parse(await fs.readFile(path.join(snapshot, "_local/pending.json"), "utf8")).driveConnected, false);
  } finally { await cleanup(); }
});
test("malformed workspace and path traversal are rejected without replacing saved work", async () => {
  const { store, cleanup } = await tempStore();
  try {
    const original = fixture();
    await store.save(original);
    assert.throws(() => store.save({ ...original, schemaVersion: 7 } as unknown as Workspace));
    assert.deepEqual(await store.load(), original);
    assert.throws(() => resolveInside("/workspace", "../outside"));
    assert.throws(() => workspaceSchema.parse({
      ...original, subjects: [{ ...original.subjects[0], programs: [original.subjects[0].programs[0], { ...original.subjects[0].programs[0], id: randomUUID() }] }],
    }));
  } finally { await cleanup(); }
});
test("serial saves keep the newest edit and reclaim obsolete snapshots", async () => {
  const { store, root, cleanup } = await tempStore();
  try {
    const original = fixture();
    const later = structuredClone(original);
    later.subjects[0].programs[0].title = "Latest edit";
    await Promise.all([store.save(original), store.save(later)]);
    assert.equal((await store.load()).subjects[0].programs[0].title, "Latest edit");
    assert.equal((await fs.readdir(path.join(root, "snapshots"))).length, 1);
  } finally { await cleanup(); }
});
test("background jobs pin an immutable snapshot while editing and saving continues", async () => {
  const { store, cleanup } = await tempStore();
  try {
    const workspace = fixture();
    await store.save(workspace);
    let release!: () => void;
    let captured!: () => void;
    const started = new Promise<void>(resolve => { captured = resolve; });
    const done = new Promise<void>(resolve => { release = resolve; });
    const job = store.withSnapshot(async snapshot => {
      captured();
      await done;
      assert.ok((await fs.readdir(snapshot)).includes("app.json"));
      return snapshot;
    });
    await started;
    const edited = structuredClone(workspace);
    edited.subjects[0].programs[0].title = "Edited during job";
    await store.save(edited);
    release();
    const oldSnapshot = await job;
    await assert.rejects(fs.access(oldSnapshot));
    assert.equal((await store.load()).subjects[0].programs[0].title, "Edited during job");
  } finally { await cleanup(); }
});
test("corrupt saved data fails explicitly instead of returning an empty workspace", async () => {
  const { store, cleanup } = await tempStore();
  try {
    await store.save(fixture());
    await fs.writeFile(path.join(await store.snapshotPath(), "app.json"), "{corrupt");
    await assert.rejects(store.load(), /preserved/);
  } finally { await cleanup(); }
});
test("Python bridge performs real health and snapshot jobs; rejects arbitrary execution", async () => {
  const { store, root, cleanup } = await tempStore();
  const worker = new PythonWorker(process.env.RECORD_MAKER_PYTHON || (process.platform === "win32" ? "python" : "python3"),
    [path.resolve("python/worker.py"), "--workspace-root", root]);
  try {
    const workspace = fixture();
    await store.save(workspace);
    const health = await worker.request("health");
    assert.equal(health.result.studentCodeExecution, false);
    const summary = await store.withSnapshot(snapshotPath => worker.request("snapshot-summary", {
      // Exercise the maximum IPC selection length (500 UUIDs), not just one
      // short request. Repeated selections still produce one included program.
      snapshotPath, subjectId: workspace.subjects[0].id, programIds: Array(500).fill(workspace.subjects[0].programs[0].id),
    }));
    assert.equal((summary.result.programs as unknown[]).length, 1);
    await assert.rejects(worker.request("execute-code" as "health"), /does not support/);
    await assert.rejects(worker.request("snapshot-summary", { snapshotPath: os.tmpdir(), subjectId: workspace.subjects[0].id }), /outside/);
  } finally { worker.stop(); await cleanup(); }
});
test("missing Python helper returns an actionable error instead of hanging", async () => {
  const worker = new PythonWorker("record-maker-nonexistent-executable", []);
  try {
    await assert.rejects(worker.request("health", { oversized: "x".repeat(131_072) }), /too large/);
    await assert.rejects(worker.request("health"), /could not start/);
  } finally { worker.stop(); }
});
