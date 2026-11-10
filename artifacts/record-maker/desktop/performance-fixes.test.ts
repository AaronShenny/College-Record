import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mapConcurrent } from "./concurrency";
import { uuid, workflowInput } from "./startup-validation";
import { DocumentService } from "./processing";
import type { PythonWorker } from "./worker-client";
import type { Workspace } from "../src/lib/contracts";

test("bounded I/O preserves ordering and waits for in-flight work on failure", async () => {
  let active = 0, peak = 0, finished = 0;
  const results = await mapConcurrent([1, 2, 3, 4, 5], async value => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, value % 2 ? 10 : 1));
    active--; return value * 2;
  });
  assert.deepEqual(results, [2, 4, 6, 8, 10]);
  assert.equal(peak, 3);
  await assert.rejects(mapConcurrent([1, 2, 3, 4], async value => {
    if (value === 1) throw new Error("failed");
    await new Promise(resolve => setTimeout(resolve, 5));
    finished++;
  }), /failed/);
  assert.equal(finished, 2); // Already-started work settles before rejection.
});

test("small main-entry validators reject malformed requests without parsing record data", () => {
  assert.equal(uuid("12345678-1234-1234-1234-123456789012"), "12345678-1234-1234-1234-123456789012");
  assert.throws(() => uuid("../escape"));
  assert.throws(() => workflowInput("generate", []));
  assert.throws(() => workflowInput(4, {}));
  assert.deepEqual(workflowInput("generate", { private: "not inspected" }), ["generate", { private: "not inspected" }]);
});

test("native generation commits DOCX before PDF and retains it when Office fails", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "record-docx-first-"));
  let pdfStarted!: () => void, releasePdf!: () => void;
  const started = new Promise<void>(resolve => { pdfStarted = resolve; });
  const release = new Promise<void>(resolve => { releasePdf = resolve; });
  let requests = 0;
  const id = randomUUID(), sid = randomUUID(), pid = randomUUID();
  const worker = { request: async (_action: string, params: { requestPath: string }) => {
    requests++;
    const job = JSON.parse(await fs.readFile(params.requestPath, "utf8"));
    if (job.action === "generate") {
      assert.equal(job.payload.pdf, false);
      await fs.writeFile(path.join(path.dirname(params.requestPath), "result.json"), JSON.stringify({
        snapshotAt: new Date().toISOString(), failures: [],
        documents: [{ id, subjectId: sid, programIds: [pid], format: "docx", name: "retained.docx",
          createdAt: new Date().toISOString(), byteLength: 9, dataBase64: Buffer.from("DOCX data").toString("base64") }],
      }));
    } else {
      assert.equal(job.action, "export-pdf");
      assert.equal(await fs.readFile(job.payload.filename, "utf8"), "DOCX data");
      pdfStarted(); await release;
      throw new Error("Microsoft Word PDF export timed out after 30 seconds.");
    }
    return { jobId: "fixture", result: {} };
  }} as unknown as PythonWorker;
  const service = new DocumentService(root, worker);
  const stamp = new Date().toISOString();
  const workspace: Workspace = { schemaVersion: 1, subjects: [{
    id: sid, name: "Lab", semester: 1, courseCode: "", updatedAt: stamp, trashedAt: null, programs: [{
      id: pid, number: 1, title: "Program", question: "", createdAt: stamp, updatedAt: stamp,
      trashedAt: null, sources: [], outputs: [], outputMayBeStale: false,
    }],
  }] };
  try {
    const generated = service.run("generate", { workspace, subjectId: sid, programIds: [pid], mode: "combined", pdf: true });
    await started;
    const available = await service.list();
    assert.equal(available.length, 1);
    assert.equal(available[0].format, "docx");
    assert.equal(available[0].dataBase64, undefined);
    assert.ok(service.busy);
    releasePdf();
    const result = await generated;
    assert.equal(requests, 2);
    assert.equal(result.documents.length, 1);
    assert.match(result.failures[0].message, /Microsoft Word/);
    assert.equal((await service.list()).length, 1);
    assert.equal(await fs.readFile((await service.file(id)).filename, "utf8"), "DOCX data");
    assert.equal(service.busy, 0);
  } finally { releasePdf(); await fs.rm(root, { recursive: true, force: true }); }
});
