import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { WorkspaceStore } from "./store";
import { DriveFiles, DriveSync, buildRemoteSnapshot } from "./drive-sync";
import { collegeIdentity, type GoogleAccount } from "./google-auth";
import type { Workspace } from "../src/lib/contracts";

function data(): Workspace {
  const field = randomUUID();
  return { schemaVersion: 1, subjects: [{ id: randomUUID(), name: "Lab", semester: 2, courseCode: "",
    updatedAt: new Date().toISOString(), trashedAt: null, fields: [{ id: field, label: "Date", type: "text", scope: "program", required: false }],
    template: { id: randomUUID(), name: "template.docx", dataBase64: Buffer.from("test template bytes").toString("base64"),
      placeholders: ["[NO]"], mappings: {}, reviewed: false, uploadedAt: new Date().toISOString() },
    programs: [{ id: randomUUID(), number: 1, title: "Question", question: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      trashedAt: null, sources: [{ id: randomUUID(), name: "main.py", role: "Main code", code: "print(1)", include: true }],
      outputs: [{ id: randomUUID(), kind: "text", name: "Result", text: "1", include: true }], outputMayBeStale: false, values: { [field]: "Friday" } }],
  }] };
}

test("status polling coalesces file scans and generation invalidates cached pending status", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "record-status-"));
  try {
    const store = new WorkspaceStore(root);
    const account = { identity: { email: "fixture@rajagiri.edu", name: "Fixture" }, configured: true } as GoogleAccount;
    const sync = new DriveSync(account, () => store);
    assert.equal((await sync.status()).pending, false);
    await fs.mkdir(path.join(root, "generated"), { recursive: true });
    await fs.writeFile(path.join(root, "generated", "fixture.docx"), "fixture");
    // UI-only polls may reuse the inventory, but actual generation explicitly
    // invalidates it and sync itself always reads the real filesystem.
    assert.equal((await sync.status()).pending, false);
    sync.invalidateStatus();
    const statuses = await Promise.all(Array.from({ length: 15 }, () => sync.status()));
    assert.ok(statuses.every(status => status.pending));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("loaded workspaces carry the exact pinned revision, including concurrent saves", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "record-load-"));
  try {
    const store = new WorkspaceStore(root);
    const first = data();
    const one = await store.save(first);
    const next = structuredClone(first); next.subjects[0].name = "Updated lab";
    const loading = store.loadWithRevision();
    const saving = store.save(next);
    const loaded = await loading;
    const two = await saving;
    assert.ok(loaded.revisionId === one.revisionId || loaded.revisionId === two.revisionId);
    assert.deepEqual(loaded.workspace, loaded.revisionId === one.revisionId ? first : next);
    assert.deepEqual((await store.loadWithRevision()).workspace, next);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("a save queued behind another revision cannot overwrite it with stale renderer data", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "record-save-boundary-"));
  try {
    const store = new WorkspaceStore(root);
    const before = data();
    const old = await store.save(before);
    const newer = structuredClone(before); newer.subjects[0].name = "Newer committed workspace";
    const incoming = store.save(newer, old.revisionId);
    const stale = store.save(before, old.revisionId);
    const rejected = assert.rejects(stale, /no newer workspace was overwritten/);
    await incoming; await rejected;
    assert.deepEqual(await store.load(), newer);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
const account = { configured: true, identity: { sub: "test-sub", name: "Test student", email: "test@rajagiri.edu" } } as GoogleAccount;
function fakeDrive() {
  const entries = new Map<string, any>();
  const uploads: string[] = [];
  let counter = 0, fail = false;
  const handler = mock.method(DriveFiles.prototype, "request", async (endpoint: string, init: RequestInit = {}) => {
    const url = new URL(endpoint, "https://example.test");
    if (url.pathname === "/drive/v3/files" && !init.method) {
      const q = url.searchParams.get("q") || "";
      return Response.json({ files: [...entries.values()].map(e => e.meta).filter(m => q.includes("recordMakerRoot") ? m.appProperties?.recordMakerRoot : m.appProperties?.recordMaker === "root-v1") });
    }
    if (url.searchParams.get("alt") === "media") {
      const file = entries.get(url.pathname.split("/").at(-1)!);
      if (!file) throw new Error("Mock Drive missing file");
      return new Response(new Uint8Array(file.bytes));
    }
    if (url.pathname.startsWith("/upload/")) {
      if (fail) throw new Error("Simulated network failure before manifest commit");
      const bytes = Buffer.from(init.body as Uint8Array);
      const boundary = bytes.subarray(0, bytes.indexOf("\r\n")).toString();
      const metaStart = bytes.indexOf("\r\n\r\n") + 4;
      const middle = bytes.indexOf("\r\n" + boundary, metaStart);
      const meta = JSON.parse(bytes.subarray(metaStart, middle).toString());
      const contentStart = bytes.indexOf("\r\n\r\n", middle) + 4;
      const contentEnd = bytes.lastIndexOf("\r\n" + boundary);
      const id = init.method === "PATCH" ? url.pathname.split("/").at(-1)! : `file-${++counter}`;
      meta.id = id; meta.mimeType = "application/octet-stream";
      entries.set(id, { meta, bytes: bytes.subarray(contentStart, contentEnd) });
      uploads.push(meta.name);
      return Response.json(meta);
    }
    const meta = JSON.parse(init.body as string);
    meta.id = `file-${++counter}`;
    entries.set(meta.id, { meta });
    return Response.json(meta);
  });
  return { entries, uploads, failNext: () => { fail = true; }, restore: () => handler.mock.restore() };
}
test("OAuth identity requires verified email AND the college hosted-domain claim", () => {
  assert.throws(() => collegeIdentity({ sub: "x", email: "x@rajagiri.edu", email_verified: false, hd: "rajagiri.edu" } as any), /verified/);
  assert.throws(() => collegeIdentity({ sub: "x", email: "x@rajagiri.edu", email_verified: true } as any), /verified/);
  assert.throws(() => collegeIdentity({ sub: "x", email: "x@other.edu", email_verified: true, hd: "other.edu" } as any), /verified/);
  assert.equal(collegeIdentity({ sub: "x", email: "x@rajagiri.edu", email_verified: true, hd: "rajagiri.edu" } as any).sub, "x");
});
test("template/custom fields round trip; remote references are immutable and credentials stay outside sync", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "record-sync-"));
  try {
    const store = new WorkspaceStore(root), workspace = data();
    await store.save(workspace);
    assert.deepEqual(await store.load(), workspace);
    const bundle = await buildRemoteSnapshot(await store.snapshotPath());
    assert.ok([...bundle.files.keys()].some(p => p.includes("/templates/") && p.endsWith(".docx")));
    assert.ok([...bundle.files.keys()].every(p => !p.includes("_local") && !p.includes("credential")));
    assert.ok(bundle.app.subjects[0].path.match(/\.[a-f0-9]{24}\.json$/));
    const subject = JSON.parse(bundle.files.get(bundle.app.subjects[0].path)!.toString());
    const program = JSON.parse(bundle.files.get(subject.programs[0].path)!.toString());
    assert.equal(bundle.files.get(program.sources[0].fileRef)!.toString(), "print(1)");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test("Drive commits the complete manifest last, downloads on another cache, and preserves data on upload failure", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "record-cloud-"));
  const fake = fakeDrive();
  try {
    const first = new WorkspaceStore(path.join(root, "first"));
    const original = data(); await first.save(original);
    const sync = new DriveSync(account, () => first);
    const saved = await sync.sync();
    assert.equal(saved.pending, false);
    assert.equal(fake.uploads.at(-1), "app.json");
    const app = [...fake.entries.values()].find(e => e.meta.name === "app.json")!;
    const published = Buffer.from(app.bytes);
    await fs.unlink(path.join(first.root, "sync-state.json")); // Simulate quit between commit and local ack.
    assert.equal((await new DriveSync(account, () => first).sync()).pending, false);
    const second = new WorkspaceStore(path.join(root, "second"));
    await new DriveSync(account, () => second).sync();
    assert.deepEqual(await second.load(), original);
    const modified = structuredClone(original);
    modified.subjects[0].programs[0].sources[0].code = "print(2)";
    await first.save(modified); fake.failNext();
    await assert.rejects(sync.sync(), /network failure/);
    assert.ok(fake.entries.get(app.meta.id).bytes.equals(published));
    assert.deepEqual(await first.load(), modified);
    assert.equal((await sync.status()).pending, true);
  } finally { fake.restore(); await fs.rm(root, { recursive: true, force: true }); }
});
test("generated-file-only sync creates a new remote commit without inventing source edits", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "record-extra-"));
  const fake = fakeDrive();
  try {
    const first = new WorkspaceStore(path.join(root, "first"));
    const second = new WorkspaceStore(path.join(root, "second"));
    await first.save(data());
    const firstSync = new DriveSync(account, () => first), secondSync = new DriveSync(account, () => second);
    await firstSync.sync(); await secondSync.sync();
    const before = await second.pointer();
    const originalCommit = JSON.parse([...fake.entries.values()].find(e => e.meta.name === "app.json")!.bytes.toString()).revision;
    await fs.mkdir(path.join(first.root, "generated", "example"), { recursive: true });
    await fs.writeFile(path.join(first.root, "generated", "example", "record.docx"), "generated content");
    await firstSync.sync();
    const nextCommit = JSON.parse([...fake.entries.values()].find(e => e.meta.name === "app.json")!.bytes.toString()).revision;
    assert.notEqual(originalCommit, nextCommit);
    await secondSync.sync();
    assert.equal(await fs.readFile(path.join(second.root, "generated", "example", "record.docx"), "utf8"), "generated content");
    assert.equal((await second.pointer())?.revisionId, before?.revisionId);
  } finally { fake.restore(); await fs.rm(root, { recursive: true, force: true }); }
});
