import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { applyConfiguration, exportConfiguration, parseConfiguration } from "../src/lib/subject-configuration";
import { workspaceSchema, type Subject } from "../src/lib/contracts";
import { programChecks } from "../src/lib/program-checks";
import { BackgroundSync } from "./background-client";
import { HostWorkflows } from "./host-workflows";

function subject(): Subject {
  const fid = randomUUID(), time = new Date().toISOString();
  return { id: randomUUID(), name: "Lab", semester: 2, courseCode: "LAB", updatedAt: time, trashedAt: null,
    fields: [{ id: fid, label: "Date", scope: "program", type: "text", required: true }],
    template: { id: randomUUID(), name: "lab.docx", dataBase64: "UEs=", uploadedAt: time, reviewed: true,
      placeholders: ["[DATE]"], mappings: { "[DATE]": { field: `custom:${fid}`, required: true, fontSizePt: 11 } } },
    index: { enabled: true, title: "My index", columns: [{ id: randomUUID(), label: "Date", field: `custom:${fid}` }] },
    values: {},
    programs: [{ id: randomUUID(), number: 1, title: "Private question", question: "Private question", createdAt: time, updatedAt: time, trashedAt: null,
      sources: [{ id: randomUUID(), name: "main.c", role: "Main", include: true, code: "private source" }],
      outputs: [{ id: randomUUID(), kind: "text", name: "Test", text: "private output", include: true }], outputMayBeStale: false,
      values: { [fid]: "PRIVATE DATE" } }] };
}

test("configuration exports reusable setup, never student work; template is an explicit choice", () => {
  const s = subject();
  const noTemplate = exportConfiguration(s, false);
  assert.equal(noTemplate.template, null);
  assert.ok(!JSON.stringify(noTemplate).includes("PRIVATE DATE"));
  assert.ok(!JSON.stringify(noTemplate).includes("private source"));
  assert.ok(!JSON.stringify(noTemplate).includes("Private question"));
  assert.ok(!JSON.stringify(noTemplate).includes("private output"));
  assert.equal(exportConfiguration(s, true).template?.dataBase64, "UEs=");
  s.setupMappings = { "[LATER]": { field: "source:Special role", required: false } };
  const pending = exportConfiguration(s, false);
  assert.equal(pending.mappings["[LATER]"]?.field, "source:Special role");
  assert.ok(pending.sourceRoles.includes("Special role"));
});

test("configuration supports every subject/template setup order without orphaning existing values", () => {
  for (const existing of [true, false]) for (const included of [true, false]) {
    const original = subject(), config = exportConfiguration(subject(), included);
    if (!existing) original.template = null;
    const previousPrograms = structuredClone(original.programs);
    const result = applyConfiguration(original, config, existing ? "keep" : included ? "included" : "later");
    assert.deepEqual(result.programs, previousPrograms);
    assert.equal(result.id, original.id);
    assert.equal(result.fields?.[0]?.id, original.fields?.[0]?.id);
    assert.notEqual(result.fields?.[1]?.id, config.fields[0]!.id);
    assert.equal(result.index?.columns[0]?.field, `custom:${result.fields?.[1]?.id}`);
    workspaceSchema.parse({ schemaVersion: 1, subjects: [result] });
    if (result.template) { assert.equal(result.template.reviewed, false); assert.equal(result.template.placeholders[0], "[DATE]"); }
    else assert.ok(result.setupMappings?.["[DATE]"]);
  }
});

test("configuration parsing fails closed on unknown versions, private fields, missing references and oversize", () => {
  const c = exportConfiguration(subject(), false);
  assert.throws(() => parseConfiguration(JSON.stringify({ ...c, version: 2 })));
  assert.throws(() => parseConfiguration(JSON.stringify({ ...c, credentials: "not allowed" })));
  assert.throws(() => parseConfiguration(JSON.stringify({ ...c, fields: [] })), /missing field/);
  assert.throws(() => parseConfiguration(" ".repeat(24 * 1024 * 1024 + 1)), /24 MB/);
  assert.throws(() => applyConfiguration(subject(), c, "included"), /no included template/);
  assert.throws(() => applyConfiguration(subject(), c, "later"), /silently removed/);
});

test("unused mappings and unmapped required fields never create invisible missing-content errors", () => {
  const s = subject(), p = s.programs[0]!;
  p.values = {};
  s.template!.placeholders = ["[NO]"];
  s.template!.mappings["[NO]"] = { field: "number", required: true };
  s.template!.mappings["[STALE]"] = { field: "question", required: true };
  p.question = "";
  assert.deepEqual(programChecks(p, s).filter(c => !c.ok), []);
  s.template!.placeholders.push("[DATE]");
  assert.equal(programChecks(p, s).filter(c => !c.ok).length, 1);
});

test("background sync coalesces manual/timer/close calls into one pending operation", async () => {
  let complete!: (value: any) => void, calls = 0;
  const sync = new BackgroundSync({ request: () => { calls++; return new Promise(resolve => { complete = resolve; }); } } as any);
  const one = sync.sync(), two = sync.sync();
  assert.equal(one, two); assert.equal(calls, 1); assert.equal(sync.busy, true);
  complete({ state: "synced", pending: false });
  await one; assert.equal(sync.busy, false);
});

test("close preparation requires final clean Drive acknowledgment and never shuts down on failure", async () => {
  const fake: any = { changing: false, documents: { busy: 0 }, account: { identity: { sub: "fixture" } },
    host: { packaged: true }, sync: { sync: async () => {}, invalidateStatus: async () => {}, status: async () => ({ state: "synced", pending: false }) } };
  assert.deepEqual(await HostWorkflows.prototype.prepareClose.call(fake), { safe: true });
  fake.sync.status = async () => ({ state: "conflict", pending: true });
  await assert.rejects(() => HostWorkflows.prototype.prepareClose.call(fake), /acknowledged/);
  fake.sync.sync = async () => { throw new Error("Offline upload failed"); };
  await assert.rejects(() => HostWorkflows.prototype.prepareClose.call(fake), /Offline/);
  fake.documents.busy = 1;
  await assert.rejects(() => HostWorkflows.prototype.prepareClose.call(fake), /still running/);
  fake.documents.busy = 0; fake.account.identity = undefined;
  assert.deepEqual(await HostWorkflows.prototype.prepareClose.call(fake), { safe: true });
});

test("native sync timer runs every three minutes and stays independent of renderer visibility", () => {
  let interval = 0;
  const timer = mock.method(globalThis, "setInterval", ((_fn: unknown, ms: number) => { interval = ms; return { unref() { return this; } }; }) as any);
  const timeout = mock.method(globalThis, "setTimeout", (() => ({ unref() { return this; } })) as any);
  try {
    const fake: any = { backgroundStarted: false, account: {}, updates: {}, sync: {}, documents: {} };
    HostWorkflows.prototype.startBackground.call(fake);
    assert.equal(interval, 180_000);
  } finally { timer.mock.restore(); timeout.mock.restore(); }
});
