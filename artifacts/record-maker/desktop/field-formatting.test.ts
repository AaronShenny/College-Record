import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mappingSchema, type Workspace } from "../src/lib/contracts";
import { WorkspaceStore } from "./store";

test("field typography is optional and independently validated", () => {
  const base = { field: "title", required: false };
  assert.deepEqual(mappingSchema.parse(base), base);
  assert.deepEqual(mappingSchema.parse({ ...base, fontFamily: "Times New Roman" }), { ...base, fontFamily: "Times New Roman" });
  assert.equal(mappingSchema.parse({ ...base, fontSizePt: 11.5 }).fontSizePt, 11.5);
  for (const override of [
    { fontSizePt: 0 }, { fontSizePt: 400.5 }, { fontSizePt: 12.1 },
    { fontFamily: "" }, { fontFamily: " " }, { fontFamily: "Bad\nfont" }, { fontFamily: "Bad\x00font" },
  ]) assert.equal(mappingSchema.safeParse({ ...base, ...override }).success, false);
});

test("field fonts survive a native workspace save and reload", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "record-field-fonts-"));
  try {
    const stamp = new Date().toISOString();
    const mappings = {
      "[TITLE]": { field: "title", required: false, fontFamily: "Cambria", fontSizePt: 13.5 },
      "[NO]": { field: "number", required: true },
    };
    const workspace: Workspace = { schemaVersion: 1, subjects: [{
      id: randomUUID(), name: "Formatting lab", semester: 1, courseCode: "", updatedAt: stamp,
      trashedAt: null, programs: [], fields: [],
      template: { id: randomUUID(), name: "format.docx", dataBase64: "dGVtcGxhdGU=", uploadedAt: stamp,
        reviewed: true, placeholders: ["[TITLE]", "[NO]"], mappings },
    }] };
    const store = new WorkspaceStore(root);
    await store.save(workspace);
    const loaded = await new WorkspaceStore(root).load();
    assert.deepEqual(loaded.subjects[0].template?.mappings, mappings);
    const template = loaded.subjects[0].template!;
    delete template.mappings["[TITLE]"].fontFamily;
    delete template.mappings["[TITLE]"].fontSizePt;
    await store.save(loaded);
    const reset = await new WorkspaceStore(root).load();
    assert.deepEqual(reset.subjects[0].template?.mappings["[TITLE]"], { field: "title", required: false });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
