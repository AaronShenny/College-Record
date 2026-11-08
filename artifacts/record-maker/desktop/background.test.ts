import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { fork } from "node:child_process";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { build } from "esbuild";
import { BackgroundClient, BackgroundStore, BackgroundSync, BackgroundPython, cloudStatusWithActivity, type BackgroundTransport } from "./background-client";
import { WorkspaceStore } from "./store";
import type { Workspace } from "../src/lib/contracts";
import { diagnosticContext } from "./diagnostic-context";

let directory: string;
let bundle: string;
before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "record-background-tests-"));
  bundle = path.join(directory, "background.cjs");
  await build({ entryPoints: [path.resolve("desktop/background.ts")], outfile: bundle, bundle: true, platform: "node", format: "cjs", target: "node22", external: ["electron"] });
});
after(async () => { await fs.rm(directory, { recursive: true, force: true }); });
function workspace(): Workspace {
  const stamp = new Date().toISOString();
  return { schemaVersion: 1, subjects: [{
    id: randomUUID(), name: "Existing lab", semester: 2, courseCode: "", updatedAt: stamp, trashedAt: null,
    programs: [{ id: randomUUID(), number: 1, title: "Existing record", question: "", createdAt: stamp,
      updatedAt: stamp, trashedAt: null, outputMayBeStale: false,
      sources: [{ id: randomUUID(), name: "main.py", role: "Main code", code: "print('preserved')", include: true }],
      outputs: [{ id: randomUUID(), kind: "image", name: "Output", dataUrl: "data:image/png;base64,aW1hZ2U=", include: true }],
    }],
  }] };
}
async function service(account: {
  configured: boolean;
  identity?: { sub: string; name: string; email: string };
  token(): Promise<string>;
} = { configured: false, token: async () => { throw new Error("No account"); } }) {
  const root = await fs.mkdtemp(path.join(directory, "account-"));
  const child = fork(bundle, [root, process.env.RECORD_MAKER_PYTHON || (process.platform === "win32" ? "python" : "python3"),
    path.resolve("python/worker.py"), "--workspace-root", root], { stdio: ["ignore", "ignore", "pipe", "ipc"], serialization: "advanced" });
  child.stderr?.resume();
  const transport: BackgroundTransport = {
    postMessage: message => { if (!child.connected) throw new Error("IPC closed"); child.send(message as any); },
    on: (event, listener) => child.on(event, listener),
    kill: () => child.kill(),
  };
  const timings: any[] = [];
  const client = new BackgroundClient(transport, account, (event, details) => timings.push({ event, ...details }));
  return { root, child, client, store: new BackgroundStore(root, client), sync: new BackgroundSync(client), timings };
}

test("isolated service opens existing snapshots and preserves code/images across version-checked saves", async () => {
  const s = await service();
  try {
    const original = workspace();
    const receipt = await new WorkspaceStore(s.root).save(original);
    const loaded = await s.store.loadWithRevision();
    assert.equal(loaded.revisionId, receipt.revisionId);
    assert.deepEqual(loaded.workspace, original);
    const changed = structuredClone(original); changed.subjects[0].name = "Edited lab";
    const next = await s.store.save(changed, receipt.revisionId);
    assert.deepEqual(await s.store.load(), changed);
    assert.equal((await new WorkspaceStore(s.root).pointer())?.revisionId, next.revisionId);
    await assert.rejects(s.store.save(original, receipt.revisionId), /no newer workspace was overwritten/);
    await assert.rejects(s.client.request("store-save", { workspace: { schemaVersion: 9, subjects: [] } }), /Invalid literal/);
    assert.deepEqual(await new WorkspaceStore(s.root).load(), changed);
    assert.ok(s.timings.some(row => row.phase === "store-load"));
    const failed = s.timings.find(row => row.event === "background-request-end" && row.ok === false);
    assert.ok(failed?.operationId);
    assert.ok(failed?.category);
    assert.doesNotMatch(JSON.stringify(s.timings), /print\('preserved'\)|aW1hZ2U=|Existing lab|Existing record/);
  } finally { await s.client.close(); }
});

test("concurrent saves in the isolated service cannot both commit the same expected revision", async () => {
  const s = await service();
  try {
    const first = workspace();
    const old = await s.store.save(first, null);
    const changed = structuredClone(first); changed.subjects[0].name = "Newest";
    const outcomes = await Promise.allSettled([s.store.save(changed, old.revisionId), s.store.save(first, old.revisionId)]);
    assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(outcomes[1].status, "rejected");
    assert.deepEqual(await s.store.load(), changed);
  } finally { await s.client.close(); }
});

test("corrupt saved data remains an error across process IPC, never an empty workspace", async () => {
  const s = await service();
  try {
    await s.store.save(workspace());
    const pointer = await s.store.pointer();
    const manifest = path.join(s.root, "snapshots", pointer!.revisionId, "app.json");
    await fs.writeFile(manifest, "{broken");
    await assert.rejects(s.store.load(), /preserved/);
    assert.equal(await fs.readFile(manifest, "utf8"), "{broken");
  } finally { await s.client.close(); }
});

test("cached records and status remain available while background Drive waits for authorization", async () => {
  let tokenRequested!: () => void;
  const requested = new Promise<void>(resolve => { tokenRequested = resolve; });
  const s = await service({
    configured: true, identity: { sub: "fixture", name: "Fixture", email: "fixture@rajagiri.edu" },
    token: () => { tokenRequested(); return new Promise<string>(() => undefined); },
  });
  const original = workspace();
  try {
    await s.store.save(original);
    const syncing = s.sync.sync();
    const rejected = assert.rejects(syncing, /closing/);
    await requested;
    assert.equal(s.sync.busy, true);
    assert.deepEqual(await s.store.load(), original);
    assert.equal((await s.sync.status()).busy, true);
    await s.client.close(); // Rejects the pending exchange; no real network request.
    await rejected;
    assert.equal(s.sync.busy, false);
    assert.deepEqual(await new WorkspaceStore(s.root).load(), original);
  } finally { s.client.stop(); }
});

test("Python health and immutable snapshot inspection work through the isolated service", async () => {
  const s = await service();
  try {
    const w = workspace();
    await s.store.save(w);
    const python = new BackgroundPython(s.client);
    const parentId = randomUUID();
    assert.equal((await diagnosticContext.run(parentId, () => python.health())).result.studentCodeExecution, false);
    assert.ok(s.timings.some(row => row.event === "background-request-start" && row.parentOperationId === parentId));
    const result = await python.inspect(w.subjects[0].id, [w.subjects[0].programs[0].id]);
    assert.equal((result.result.programs as unknown[]).length, 1);
    // IPC diagnostic messages can arrive after their result message.
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.ok(s.timings.some(row => row.event === "python-job" && row.ok));
  } finally { await s.client.close(); }
});

test("background exit rejects all pending callers and never retries a possibly committed write", async () => {
  class FakeTransport extends EventEmitter {
    messages: any[] = [];
    postMessage(message: unknown) { this.messages.push(message); }
    kill() {}
  }
  const child = new FakeTransport();
  const client = new BackgroundClient(child, { configured: false, token: async () => "" }, () => undefined);
  const request = client.request("store-save", { workspace: workspace() });
  const failed = assert.rejects(request, /saved files were preserved/i);
  child.emit("exit", 1);
  await failed;
  await assert.rejects(client.request("store-load"), /unavailable/);
  assert.equal(child.messages.length, 1);
});

test("deferred first sync cannot expose an old synced-empty status as confirmed empty", () => {
  const cached = { connected: true, configured: true, state: "synced", busy: false, revision: "old", syncedRevision: "old" };
  const waiting = cloudStatusWithActivity(cached, true, false, false);
  assert.equal(waiting.state, "syncing");
  assert.equal(waiting.busy, true);
  assert.equal(cloudStatusWithActivity(cached, false, false, true).busy, true);
  assert.deepEqual(cloudStatusWithActivity(cached, false, false, false), { ...cached, switching: false });
});
