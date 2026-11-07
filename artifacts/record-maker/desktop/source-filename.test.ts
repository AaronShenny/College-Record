import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceNameError } from "../src/lib/source-filename";

test("Windows-invalid filenames remain unsaved drafts, not silently committed values", () => {
  for (const name of ["bad name?.c", "bad/name.c", "", " ", "main.c.", "main.c ", "CON.c", "lpt1.txt", "a:b.c", "nul"]) {
    assert.ok(sourceNameError(name), name);
  }
  for (const name of ["main.c", "helper code.py", "tree_node.h", "résumé.txt", "console.c"]) assert.equal(sourceNameError(name), "", name);
});
