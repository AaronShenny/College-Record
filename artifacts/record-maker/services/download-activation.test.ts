import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { WorkspaceStore } from "./store";
import { activateIncoming, localTransaction, writeAtomicJson } from "./local-transaction";
import { DocumentService } from "./processing";
import { validateIncomingInventory } from "./download-inventory";
import type { PythonWorker } from "./worker-client";
import type { Workspace } from "../src/lib/contracts";

const workspace = (): Workspace => ({ schemaVersion: 1, subjects: [{ id: randomUUID(), name: "Saved subject",
  semester: 1, courseCode: "", updatedAt: new Date().toISOString(), trashedAt: null, fields: [], programs: [] }] });

test("interrupted incoming activation restores records, extras and acknowledgment together at every rename boundary", async () => {
  for (const phase of [1, 2, 3, 4, 5, 6, 7]) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "activation-restart-"));
    try {
      const store = new WorkspaceStore(root), before = workspace();
      const pointer = await store.save(before);
      const sync = { localRevision: pointer.revisionId, remoteRevision: "original", extraSignature: "old", lastSyncAt: new Date().toISOString() };
      await writeAtomicJson(path.join(root, "sync-state.json"), sync);
      for (const dir of ["generated", "imports"]) {
        await fs.mkdir(path.join(root, dir)); await fs.writeFile(path.join(root, dir, "old.txt"), dir);
      }
      const after = structuredClone(before); after.subjects[0].name = "Incoming subject";
      const incomingPointer = await localTransaction(root, () => store.prepareIncoming(after));
      const journal = path.join(root, "_incoming-activation");
      await fs.mkdir(journal);
      await writeAtomicJson(path.join(journal, "transaction.json"), { version: 1, phase: phase === 7 ? "committed" : "prepared",
        oldDirectories: { generated: true, imports: true }, metadata: { "current.json": pointer, "sync-state.json": sync } });
      await fs.rename(path.join(root, "generated"), path.join(journal, "old-generated"));
      if (phase >= 2) { await fs.mkdir(path.join(root, "generated")); await fs.writeFile(path.join(root, "generated/new.txt"), "new"); }
      if (phase >= 3) await fs.rename(path.join(root, "imports"), path.join(journal, "old-imports"));
      if (phase >= 4) { await fs.mkdir(path.join(root, "imports")); await fs.writeFile(path.join(root, "imports/new.txt"), "new"); }
      if (phase >= 5) await writeAtomicJson(path.join(root, "current.json"), incomingPointer);
      if (phase >= 6) await writeAtomicJson(path.join(root, "sync-state.json"), { ...sync, remoteRevision: "incoming" });
      const restarted = new WorkspaceStore(root);
      assert.deepEqual(await restarted.load(), phase === 7 ? after : before);
      for (const dir of ["generated", "imports"]) {
        assert.equal(await fs.readFile(path.join(root, dir, phase === 7 ? "new.txt" : "old.txt"), "utf8"), phase === 7 ? "new" : dir);
      }
      assert.equal(JSON.parse(await fs.readFile(path.join(root, "sync-state.json"), "utf8")).remoteRevision, phase === 7 ? "incoming" : "original");
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  }
});

test("disk-full activation failure rolls back before another reader or writer can observe the inventory", async () => {
  for (const failure of ["imports", "acknowledgment", "commit-marker"]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "activation-fault-"));
  try {
    const store = new WorkspaceStore(root), before = workspace(), pointer = await store.save(before);
    for (const dir of ["generated", "imports"]) {
      await fs.mkdir(path.join(root, dir)); await fs.writeFile(path.join(root, dir, "old.txt"), "retained");
      await fs.mkdir(path.join(root, "incoming", dir), { recursive: true });
    }
    const originalRename = fs.rename.bind(fs); let injected = false, markerWrites = 0;
    const fault = mock.method(fs, "rename", async (from: Parameters<typeof fs.rename>[0], to: Parameters<typeof fs.rename>[1]) => {
      if (String(to) === path.join(root, "_incoming-activation/transaction.json")) markerWrites++;
      if (!injected && ((failure === "imports" && String(from) === path.join(root, "incoming/imports")) ||
          (failure === "acknowledgment" && String(to) === path.join(root, "sync-state.json")) ||
          (failure === "commit-marker" && markerWrites === 2))) {
        injected = true; throw Object.assign(new Error("Disk full"), { code: "ENOSPC" });
      }
      return originalRename(from, to);
    });
    try { await assert.rejects(localTransaction(root, () => activateIncoming(root, path.join(root, "incoming"), pointer, {})), /Disk full/); }
    finally { fault.mock.restore(); }
    assert.ok(injected);
    assert.deepEqual(await store.load(), before);
    for (const dir of ["generated", "imports"]) assert.equal(await fs.readFile(path.join(root, dir, "old.txt"), "utf8"), "retained");
    await assert.rejects(fs.stat(path.join(root, "_incoming-activation")), { code: "ENOENT" });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
  }
});

test("incoming generated and archived import indexes cannot acknowledge missing or invalid files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "incoming-index-")), id = randomUUID();
  try {
    await fs.mkdir(path.join(root, "generated", id), { recursive: true });
    await fs.writeFile(path.join(root, "generated/index.json"), JSON.stringify([{ id, name: "record.docx", format: "docx",
      subjectId: randomUUID(), programIds: [], createdAt: new Date().toISOString(), byteLength: 3 }]));
    await assert.rejects(validateIncomingInventory(root), /Nothing was activated/);
    await fs.writeFile(path.join(root, "generated", id, "record.docx"), "doc");
    await validateIncomingInventory(root);
    await fs.writeFile(path.join(root, "generated", id, "record.docx"), "A later Word save may change the original creation size");
    await validateIncomingInventory(root);
    await fs.mkdir(path.join(root, "imports", id), { recursive: true });
    await fs.writeFile(path.join(root, "imports", id, "import.json"), JSON.stringify({ name: "questions.csv", importedAt: new Date().toISOString() }));
    await assert.rejects(validateIncomingInventory(root), /Nothing was activated/);
    await fs.writeFile(path.join(root, "imports", id, "questions.csv"), "1,Question");
    await validateIncomingInventory(root);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("generation requires a saved reservation and pins its exact content across later saves", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "generation-reservation-"));
  try {
    const store = new WorkspaceStore(root), original = workspace(), subject = original.subjects[0];
    const pid = randomUUID();
    subject.programs.push({ id: pid, number: 1, title: "Original program", question: "", sources: [], outputs: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), trashedAt: null, outputMayBeStale: false });
    const seen: any[] = [];
    const worker = { request: async (_: string, params: { requestPath: string }) => {
      const job = JSON.parse(await fs.readFile(params.requestPath, "utf8")); seen.push(job);
      await fs.writeFile(path.join(path.dirname(params.requestPath), "result.json"), JSON.stringify({ documents: [], failures: [] }));
    } } as unknown as PythonWorker;
    const docs = new DocumentService(root, worker, store);
    const request = { subjectId: subject.id, programIds: [pid], mode: "combined", pdf: false };
    await assert.rejects(docs.run("generate", { ...request, workspace: original }), /Save successfully/);
    assert.equal(seen.length, 0);
    const failedSave = mock.method(store, "save", async () => { throw new Error("Injected failed prerequisite save"); });
    try { await assert.rejects(docs.prepareGeneration(original, null), /failed prerequisite save/); }
    finally { failedSave.mock.restore(); }
    assert.equal(seen.length, 0);
    const prepared = await docs.prepareGeneration(original, null);
    await assert.rejects(new DocumentService(path.join(root, "other-account"), worker).run("generate",
      { ...request, generationToken: prepared.generationToken }), /expired or belongs/);
    const later = structuredClone(original); later.subjects[0].programs[0].title = "Later edits";
    await new WorkspaceStore(root).save(later);
    await fs.access(path.join(root, "snapshots", prepared.receipt.revisionId, "app.json"));
    await docs.run("generate", { ...request, generationToken: prepared.generationToken });
    assert.equal(seen[0].payload.workspace.subjects[0].programs[0].title, "Original program");
    assert.deepEqual(await store.load(), later);
    await assert.rejects(docs.run("generate", { ...request, generationToken: prepared.generationToken }), /expired or belongs/);
    await assert.rejects(docs.prepareGeneration(original, prepared.receipt.revisionId), /revision changed/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
