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
      return new Response(new Uint8Array(file.bytes), { headers: { etag: file.etag || '"fixture"' } });
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
      const expected = (init.headers as Record<string, string>)["If-Match"];
      if (init.method === "PATCH" && expected && expected !== entries.get(id)?.etag) throw new Error("Drive changed during upload. No newer index was overwritten.");
      meta.id = id; meta.mimeType = "application/octet-stream";
      entries.set(id, { meta, bytes: bytes.subarray(contentStart, contentEnd), etag: `"${randomUUID()}"` });
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
test("explicit conflict choice keeps Local or Drive with one-use reviewed revisions and correct inventories", async () => {
  for (const choice of ["local", "drive"] as const) {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "recordly-conflict-")), remote = fakeDrive();
    try {
      const a = new WorkspaceStore(path.join(base, "a")), b = new WorkspaceStore(path.join(base, "b"));
      const sa = new DriveSync(account, () => a), sb = new DriveSync(account, () => b);
      const original = data(); await a.save(original); await sa.sync(); await sb.sync();
      const drive = structuredClone(original); drive.subjects[0].name = "Drive changed";
      await a.save(drive); await sa.sync();
      const local = structuredClone(original); local.subjects[0].name = "Local changed";
      await b.save(local);
      await fs.mkdir(path.join(b.root, "generated"), { recursive: true });
      await fs.writeFile(path.join(b.root, "generated", "local-only.docx"), "retained unless explicitly replaced");
      await assert.rejects(() => sb.sync(), /Drive changed/);
      assert.equal((await sb.status()).state, "conflict");
      const review = await sb.reviewConflict();
      assert.equal(review.scope, "workspace"); assert.equal(review.account, account.identity!.email);
      assert.deepEqual(await b.load(), local); // reviewing/cancelling changes nothing
      const result = await sb.resolveConflict(review.token, choice);
      assert.equal(result.pending, false); assert.equal(result.state, "synced");
      await assert.rejects(() => sb.resolveConflict(review.token, choice), /review expired/i);
      assert.deepEqual(await b.load(), choice === "drive" ? drive : local);
      if (choice === "drive") await assert.rejects(() => fs.stat(path.join(b.root, "generated", "local-only.docx")), /ENOENT/);
      else { await sa.sync(); assert.deepEqual(await a.load(), local); }
    } finally { remote.restore(); await fs.rm(base, { recursive: true, force: true }); }
  }
});

test("conflict review cannot overwrite local or remote changes made after review", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "recordly-review-")), remote = fakeDrive();
  try {
    const a = new WorkspaceStore(path.join(base, "a")), b = new WorkspaceStore(path.join(base, "b"));
    const sa = new DriveSync(account, () => a), sb = new DriveSync(account, () => b);
    const initial = data(); await a.save(initial); await sa.sync(); await sb.sync();
    const drive = structuredClone(initial); drive.subjects[0].name = "Drive new"; await a.save(drive); await sa.sync();
    const local = structuredClone(initial); local.subjects[0].name = "Local new"; await b.save(local);
    const one = await sb.reviewConflict();
    local.subjects[0].name = "New local after review"; await b.save(local);
    await assert.rejects(() => sb.resolveConflict(one.token, "drive"), /changed since.*review/);
    assert.deepEqual(await b.load(), local);
    const two = await sb.reviewConflict();
    drive.subjects[0].name = "New Drive after review"; await a.save(drive); await sa.sync();
    await assert.rejects(() => sb.resolveConflict(two.token, "local"), /changed since.*review/);
    assert.deepEqual(await a.load(), drive);
  } finally { remote.restore(); await fs.rm(base, { recursive: true, force: true }); }
});

test("conditional conflict publication rejects a competing root-index write after final review", async () => {
  const remote = fakeDrive();
  const originalUpload = DriveFiles.prototype.upload;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "recordly-conditional-"));
  const store = new WorkspaceStore(root);
  const sync = new DriveSync(account, () => store);
  try {
    const workspace = data();
    await store.save(workspace);
    await sync.sync();
    const local = structuredClone(workspace); local.subjects[0]!.name = "Pending local";
    await store.save(local);
    const app = [...remote.entries.values()].find(entry => entry.meta.name === "app.json")!;
    const changed = JSON.parse(app.bytes.toString("utf8"));
    changed.revision = randomUUID();
    app.bytes = Buffer.from(JSON.stringify(changed)); app.etag = `"${randomUUID()}"`;
    const review = await sync.reviewConflict();
    DriveFiles.prototype.upload = async function(...args: Parameters<DriveFiles["upload"]>) {
      if (args[2] === "app.json" && args[5]) app.etag = `"${randomUUID()}"`;
      return originalUpload.apply(this, args);
    };
    await assert.rejects(sync.resolveConflict(review.token, "local"), /Drive changed during upload/);
    assert.deepEqual(JSON.parse(app.bytes.toString("utf8")), changed);
    assert.equal((await store.load()).subjects[0]!.name, "Pending local");
    assert.equal((await sync.status()).pending, true);
  } finally {
    DriveFiles.prototype.upload = originalUpload;
    remote.restore();
    await fs.rm(root, { recursive: true, force: true });
  }
});
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

test("a local save during extra-file download is never adopted as permission to overwrite", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "record-download-race-"));
  const fake = fakeDrive(); let hook: ReturnType<typeof mock.method> | undefined;
  try {
    const first = new WorkspaceStore(path.join(root, "first")), second = new WorkspaceStore(path.join(root, "second"));
    const original = data(); await first.save(original);
    const a = new DriveSync(account, () => first), b = new DriveSync(account, () => second);
    await a.sync(); await b.sync();
    await fs.mkdir(path.join(first.root, "generated"), { recursive: true });
    await fs.writeFile(path.join(first.root, "generated/new.docx"), "remote");
    await a.sync();
    const bytes = DriveFiles.prototype.bytes; let injected = false;
    const edited = structuredClone(original); edited.subjects[0].name = "Locally saved during download";
    hook = mock.method(DriveFiles.prototype, "bytes", async function(this: DriveFiles, id: string) {
      if (!injected && fake.entries.get(id)?.meta.name.startsWith("new.")) {
        injected = true; await second.save(edited);
      }
      return bytes.call(this, id);
    });
    await assert.rejects(b.sync(), /Local changes arrived/);
    assert.ok(injected); assert.deepEqual(await second.load(), edited);
    await assert.rejects(fs.stat(path.join(second.root, "generated/new.docx")), { code: "ENOENT" });
  } finally { hook?.mock.restore(); fake.restore(); await fs.rm(root, { recursive: true, force: true }); }
});

test("failed extra-file downloads leave no live partial files and retry normally, including first download", async () => {
  for (const existing of [false, true]) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "record-download-failure-"));
    const fake = fakeDrive(); let hook: ReturnType<typeof mock.method> | undefined;
    try {
      const first = new WorkspaceStore(path.join(root, "first")), second = new WorkspaceStore(path.join(root, "second"));
      await first.save(data());
      const a = new DriveSync(account, () => first), b = new DriveSync(account, () => second);
      await a.sync(); if (existing) await b.sync();
      await fs.mkdir(path.join(first.root, "generated"), { recursive: true });
      await fs.writeFile(path.join(first.root, "generated/a.docx"), "first");
      await fs.writeFile(path.join(first.root, "generated/b.docx"), "second");
      await a.sync();
      const before = await second.pointer(), bytes = DriveFiles.prototype.bytes;
      hook = mock.method(DriveFiles.prototype, "bytes", async function(this: DriveFiles, id: string) {
        if (fake.entries.get(id)?.meta.name.startsWith("b.")) throw new Error("injected download failure");
        return bytes.call(this, id);
      });
      await assert.rejects(b.sync(), /injected download failure/);
      assert.deepEqual(await second.pointer(), before);
      await assert.rejects(fs.stat(path.join(second.root, "generated/a.docx")), { code: "ENOENT" });
      hook.mock.restore(); hook = undefined;
      assert.equal((await b.sync()).pending, false);
      assert.equal(await fs.readFile(path.join(second.root, "generated/b.docx"), "utf8"), "second");
    } finally { hook?.mock.restore(); fake.restore(); await fs.rm(root, { recursive: true, force: true }); }
  }
});

test("old provable remote partials can retry, but unrelated local files remain protected", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "old-partial-recovery-"));
  const fake = fakeDrive();
  try {
    const first = new WorkspaceStore(path.join(root, "first")), second = new WorkspaceStore(path.join(root, "second"));
    await first.save(data());
    const a = new DriveSync(account, () => first), b = new DriveSync(account, () => second);
    await a.sync(); await b.sync();
    for (const store of [first, second]) await fs.mkdir(path.join(store.root, "generated"), { recursive: true });
    await fs.writeFile(path.join(first.root, "generated/a.docx"), "verified remote partial");
    await fs.writeFile(path.join(first.root, "generated/b.docx"), "remaining remote file");
    await a.sync();
    await fs.writeFile(path.join(second.root, "generated/a.docx"), "verified remote partial");
    await fs.writeFile(path.join(second.root, "generated/local.docx"), "genuine local work");
    await assert.rejects(b.sync(), /pending edits/);
    assert.equal(await fs.readFile(path.join(second.root, "generated/local.docx"), "utf8"), "genuine local work");
    // Remove only our disposable fixture to represent the provable-partials case.
    await fs.unlink(path.join(second.root, "generated/local.docx"));
    assert.equal((await b.sync()).pending, false);
    assert.equal(await fs.readFile(path.join(second.root, "generated/b.docx"), "utf8"), "remaining remote file");
  } finally { fake.restore(); await fs.rm(root, { recursive: true, force: true }); }
});

test("extra-file mutations, invalid bytes and cancellation during download cannot activate incoming state", async () => {
  for (const fault of ["local-inventory", "invalid-bytes", "cancel"]) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "download-boundaries-"));
    const fake = fakeDrive(); let hook: ReturnType<typeof mock.method> | undefined;
    try {
      const first = new WorkspaceStore(path.join(root, "first")), second = new WorkspaceStore(path.join(root, "second"));
      const original = data(); await first.save(original);
      const a = new DriveSync(account, () => first), b = new DriveSync(account, () => second);
      await a.sync(); await b.sync();
      await fs.mkdir(path.join(first.root, "generated"), { recursive: true });
      await fs.writeFile(path.join(first.root, "generated/new.docx"), "remote");
      await a.sync();
      const before = await second.pointer(), bytes = DriveFiles.prototype.bytes;
      let injected = false, paused: Promise<void> | undefined;
      hook = mock.method(DriveFiles.prototype, "bytes", async function(this: DriveFiles, id: string) {
        if (!injected && fake.entries.get(id)?.meta.name.startsWith("new.")) {
          injected = true;
          if (fault === "invalid-bytes") return Buffer.from("corrupt reference");
          if (fault === "cancel") paused = b.pause();
          if (fault === "local-inventory") {
            await fs.mkdir(path.join(second.root, "imports/local"), { recursive: true });
            await fs.writeFile(path.join(second.root, "imports/local/questions.csv"), "student work");
          }
        }
        return bytes.call(this, id);
      });
      await assert.rejects(b.sync());
      await paused;
      assert.ok(injected); assert.deepEqual(await second.pointer(), before);
      assert.deepEqual(await second.load(), original);
      await assert.rejects(fs.stat(path.join(second.root, "generated/new.docx")), { code: "ENOENT" });
      if (fault === "local-inventory") assert.equal(await fs.readFile(path.join(second.root, "imports/local/questions.csv"), "utf8"), "student work");
    } finally { hook?.mock.restore(); fake.restore(); await fs.rm(root, { recursive: true, force: true }); }
  }
});
