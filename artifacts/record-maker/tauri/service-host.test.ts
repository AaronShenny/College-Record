import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { build } from "esbuild";
import { JsonLineFrames } from "../services/service-protocol";
import { workspaceSchema, outputSchema } from "../src/lib/contracts";

let scratch: string;
before(async () => {
  scratch = await fs.mkdtemp(path.join(os.tmpdir(), "record-native-host-"));
  await build({
    entryPoints: {
      "service-host": path.join(import.meta.dirname, "service-host.ts"),
      background: path.join(import.meta.dirname, "../services/background.ts"),
    },
    bundle: true, platform: "node", format: "cjs", target: "node22",
    outdir: path.join(scratch, "bundle"), outExtension: { ".js": ".cjs" },
  });
});
after(async () => { await fs.rm(scratch, { recursive: true, force: true }); });

async function start(handshake = true, existingRoot?: string) {
  const root = existingRoot || path.join(scratch, randomUUID());
  await fs.mkdir(root, { recursive: true });
  const nonce = randomBytes(32).toString("hex");
  const environment: NodeJS.ProcessEnv = { RECORD_MAKER_HOST_NONCE: nonce };
  for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH", "HOME"]) if (process.env[key]) environment[key] = process.env[key];
  const child = spawn(process.execPath, [path.join(scratch, "bundle/service-host.cjs"), root, scratch, "0.2.0", "false"], {
    stdio: "pipe", env: environment, windowsHide: true,
  }) as ChildProcessWithoutNullStreams;
  const waiting = new Map<string, { resolve(value: any): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
  const callbacks: string[] = [];
  const write = (value: unknown) => child.stdin.write(JSON.stringify(value) + "\n");
  const exited = new Promise<number | null>(resolve => child.once("exit", code => {
    for (const item of waiting.values()) { clearTimeout(item.timer); item.reject(new Error("Host exited.")); }
    waiting.clear(); resolve(code);
  }));
  child.stdout.on("data", chunk => lines.push(chunk));
  child.stderr.resume(); // Never print provider payloads or filesystem paths from a failed process.
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
  const lines = new JsonLineFrames((value: any) => {
    if (value.kind === "native") {
      callbacks.push(value.action);
      if (value.action === "paste-image") write({ protocol: 1, kind: "native-result", id: value.id, ok: true, result: { dataUrl: `data:image/png;base64,${png}` } });
      else write({ protocol: 1, kind: "native-result", id: value.id, ok: false, error: "Unexpected fixture-native operation." });
      return;
    }
    const item = waiting.get(value.id);
    if (!item) return;
    waiting.delete(value.id); clearTimeout(item.timer);
    value.ok ? item.resolve(value.result) : item.reject(new Error(value.error));
  });
  if (handshake) write({ protocol: 1, kind: "host-ready", nonce });
  return {
    root, callbacks, child, exited, write,
    call(method: string, payload: unknown = null): Promise<any> {
      const id = randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiting.delete(id); reject(new Error("Fixture service timeout.")); }, 10_000).unref();
        waiting.set(id, { resolve, reject, timer });
        write({ protocol: 1, kind: "request", id, method, payload });
      });
    },
    async stop() {
      if (child.exitCode !== null) return;
      try { await this.call("shutdown"); } catch {}
      child.stdin.end();
      await exited;
    },
  };
}

test("native owner handshake must precede any service request", async () => {
  const host = await start(false);
  host.write({ protocol: 1, kind: "request", id: randomUUID(), method: "runtime", payload: null });
  assert.equal(await host.exited, 1);
  assert.deepEqual(host.callbacks, []);
  await assert.rejects(fs.access(path.join(host.root, "workspaces/local-development/current.json")));
});

test("real service preserves saved drafts across restart and rejects incomplete summary writes", async () => {
  const host = await start();
  try {
    const empty = await host.call("load");
    assert.deepEqual(empty, { schemaVersion: 1, subjects: [] });
    const stamp = new Date().toISOString();
    const workspace = workspaceSchema.parse({ schemaVersion: 1, subjects: [{
      id: randomUUID(), name: "Native fixture", semester: 1, courseCode: "FIX",
      updatedAt: stamp, trashedAt: null, programs: [], fields: [], values: {},
    }] });
    const receipt = await host.call("save", workspace);
    assert.match(receipt.revisionId, /^[a-f0-9-]{36}$/);
    assert.equal((await host.call("runtime")).workspaceRevision, receipt.revisionId);
    await assert.rejects(host.call("save", { kind: "dashboard-summary", schemaVersion: 1, subjects: [] }));
    assert.deepEqual(await host.call("load"), workspace);
    await host.stop();
    const reopened = await start(true, host.root);
    try { assert.deepEqual(await reopened.call("load"), workspace); }
    finally { await reopened.stop(); }
  } finally { await host.stop(); }
});

test("concurrent native saves cannot both replace one expected revision", async () => {
  const host = await start();
  try {
    const workspace = await host.call("load");
    const results = await Promise.allSettled([host.call("save", workspace), host.call("save", workspace)]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(results.filter(result => result.status === "rejected").length, 1);
  } finally { await host.stop(); }
});

test("an unopened workspace cannot be erased by a summary-era empty save", async () => {
  const host = await start();
  try {
    await assert.rejects(host.call("save", { schemaVersion: 1, subjects: [] }), /account changed/i);
    await assert.rejects(fs.access(path.join(host.root, "workspaces/local-development/current.json")));
  } finally { await host.stop(); }
});

test("clipboard output follows the existing full document contract", async () => {
  const host = await start();
  try {
    const output = outputSchema.parse(await host.call("paste-image"));
    assert.equal(output.kind, "image");
    assert.equal(output.name, "Pasted screenshot");
    assert.deepEqual(host.callbacks, ["paste-image"]);
  } finally { await host.stop(); }
});
