import { test } from "node:test";
import assert from "node:assert/strict";
import { programChecks } from "../src/lib/program-checks";
import { mergeGenerationChoice } from "../src/lib/generation-choice";
import type { Program, Subject } from "../src/lib/contracts";

const program: Program = {
  id: "program", number: 1, title: "Traversal", question: "", createdAt: "", updatedAt: "",
  trashedAt: null, outputMayBeStale: false, sources: [],
  outputs: [{ id: "output", kind: "text", text: "   ", name: "Empty", include: true }],
};
const subject: Subject = {
  id: "subject", name: "Lab", semester: 1, courseCode: "", updatedAt: "", trashedAt: null, programs: [program],
  template: { id: "template", name: "template.docx", dataBase64: "", uploadedAt: "", reviewed: true,
    placeholders: ["[OUTPUT]", "[COURSE]", "[FACULTY]", "[AIM]"], mappings: {
      "[OUTPUT]": { field: "output", required: true },
      "[COURSE]": { field: "courseCode", required: true },
      "[FACULTY]": { field: "custom:faculty", required: false },
      "[AIM]": { field: "custom:aim", required: false },
    } },
  fields: [
    { id: "faculty", label: "Faculty", type: "text", scope: "subject", required: true },
    { id: "aim", label: "Aim", type: "text", scope: "program", required: true },
  ],
};

test("empty included output and required custom and subject values are discoverable", () => {
  const missing = programChecks(program, subject).filter(check => !check.ok).map(check => check.field);
  assert.deepEqual(missing, ["output", "courseCode", "custom:faculty", "custom:aim"]);
});
test("filled inherited and program values satisfy checks without requiring unmapped questions or code", () => {
  const checks = programChecks({
    ...program, values: { aim: "Traverse a tree" },
    outputs: [{ id: "output", kind: "text", text: "10 20 30", name: "Result", include: true }],
  }, { ...subject, courseCode: "CS201", values: { faculty: "Faculty value" } });
  assert.ok(checks.every(check => check.ok));
  assert.ok(!checks.some(check => check.field === "question"));
});
test("optional duplicate source roles still point back to source editing", () => {
  const s = { ...subject, fields: [], template: { ...subject.template!, placeholders: ["[CODE]"], mappings: { "[CODE]": { field: "source:Main code", required: false } } } };
  const p = { ...program, sources: ["a", "b"].map(id => ({ id, name: `${id}.c`, role: "Main code", code: "code", include: true })) };
  assert.deepEqual(programChecks(p, s), [{ field: "source:Main code", label: "Use one included source for Main code", ok: false }]);
});
test("excluded output never counts as ready", () => {
  assert.equal(programChecks({ ...program, outputs: [{ ...program.outputs[0]!, kind: "text", text: "Result", include: false }] }, subject).find(c => c.field === "output")?.ok, false);
});
test("changing options retains explicit program selection including an empty selection", () => {
  const picked = mergeGenerationChoice(undefined, { programIds: ["p2", "p4"] });
  const options = mergeGenerationChoice(picked, { mode: "combined", pdf: true });
  assert.deepEqual(options, { programIds: ["p2", "p4"], mode: "combined", pdf: true });
  const empty = mergeGenerationChoice(options, { programIds: [] });
  assert.deepEqual(mergeGenerationChoice(empty, { pdf: false }).programIds, []);
  assert.deepEqual(picked.programIds, ["p2", "p4"]);
});
