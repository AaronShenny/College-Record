import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile, access } from "node:fs/promises";
import path from "node:path";

test("shared workflow and storage bundles do not import Electron or archived code", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const result = await build({
    entryPoints: [path.join(root, "services/host-workflows.ts"), path.join(root, "services/background.ts")],
    outdir: path.join(root, "dist/boundary-check"), write: false, bundle: true,
    platform: "node", format: "cjs", target: "node22", metafile: true,
    external: ["electron", "electron-updater"],
  });
  for (const input of Object.keys(result.metafile!.inputs)) assert.ok(!input.replaceAll("\\", "/").includes("/legacy/electron/"));
  for (const output of Object.values(result.metafile!.outputs)) {
    for (const dependency of output.imports) assert.ok(!dependency.path.startsWith("electron"));
  }
});

test("Electron archive retains its classified sources and excludes credentials and generated binaries", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const manifest = JSON.parse(await readFile(path.join(root, "legacy/electron/archive-manifest.json"), "utf8"));
  assert.match(manifest.baselineCommit, /^[a-f0-9]{40}$/);
  assert.ok(manifest.files.length >= 20);
  for (const entry of manifest.files) {
    assert.match(entry.archived, /^legacy\/electron\//);
    assert.match(entry.sha256BeforeRelocation, /^[a-f0-9]{64}$/);
    assert.ok(!/(credentials|node_modules|\.exe$|\.bin$)/.test(entry.archived));
    await access(path.join(root, entry.archived));
  }
  const workflow = await readFile(path.join(root, "../../.github/workflows/desktop-windows.yml"), "utf8");
  assert.ok(!/^\s+push:/m.test(workflow));
  assert.ok(workflow.includes("run legacy:package"));
});
