import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { installTauriBridge } from "../src/lib/tauri-bridge";

test("real renderer bridge defers service calls until the cached dashboard paints and preserves native request shapes", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const interval = globalThis.setInterval, timeout = globalThis.setTimeout;
  const calls: Array<{ method: string; payload: unknown }> = [];
  const fake = {
    addEventListener() {},
    __TAURI__: { core: { async invoke(_command: string, args: { method: string; payload: unknown }) {
      calls.push(args);
      if (args.method === "boot") return {
        cache: { summary: { kind: "dashboard-summary", schemaVersion: 1, revisionId: randomUUID(),
          accountKey: "0123456789abcdef0123456789abcdef", subjects: [] }, savedAt: new Date().toISOString(), pendingItems: 0 },
      };
      return null;
    } } },
  } as unknown as Window;
  Object.defineProperty(globalThis, "window", { value: fake, configurable: true });
  Object.defineProperty(globalThis, "document", { value: { addEventListener() {} }, configurable: true });
  globalThis.setInterval = (() => 0) as unknown as typeof setInterval;
  globalThis.setTimeout = ((fn: () => void) => { queueMicrotask(fn); return 0; }) as unknown as typeof setTimeout;
  try {
    await installTauriBridge();
    assert.ok(Object.isFrozen(fake.recordMaker));
    const load = fake.recordMaker!.loadWorkspace();
    await Promise.resolve();
    assert.deepEqual(calls.map(c => c.method), ["boot"], "Node must not start merely to draw the dashboard.");
    fake.recordMakerSummaryPainted!();
    await load;
    assert.deepEqual(calls.map(c => c.method), ["boot", "summary-ready", "load"]);
    await fake.recordMaker!.workflow!("sync-drive", {});
    assert.deepEqual(calls.at(-1), { method: "workflow", payload: { action: "sync-drive", input: {} } });
    await fake.recordMaker!.inspectSnapshot("subject-fixture", ["program-fixture"]);
    assert.deepEqual(calls.at(-1), { method: "inspect", payload: { subjectId: "subject-fixture", programIds: ["program-fixture"] } });
    await fake.recordMakerEditState!(true);
    const first = calls.at(-1)!.payload as { sequence: number };
    await fake.recordMakerEditState!(false);
    const second = calls.at(-1)!.payload as { sequence: number };
    assert.ok(second.sequence > first.sequence, "Late editing-state completions must not unlock newer unsaved work.");
    await fake.recordMakerCancelClose!();
    assert.deepEqual(calls.at(-1), { method: "cancel-close", payload: null });
    await fake.recordMakerFinishClose!();
    assert.deepEqual(calls.at(-1), { method: "close-commit", payload: null });
    assert.equal("vaultDecrypt" in fake.recordMaker!, false);
  } finally {
    globalThis.setInterval = interval; globalThis.setTimeout = timeout;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else Reflect.deleteProperty(globalThis, "document");
  }
});

test("a missing native bridge fails visibly rather than creating browser persistence", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  try { await assert.rejects(installTauriBridge(), /No browser storage was opened/); }
  finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor); else Reflect.deleteProperty(globalThis, "window");
  }
});

test("failed boot retains native close access without mounting a workspace or opening browser storage", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const calls: string[] = [];
  const fake = { __TAURI__: { core: { async invoke(_command: string, args: { method: string }) {
    calls.push(args.method);
    if (args.method === "boot") throw new Error("Onboarding failed.");
    if (args.method === "close-commit") return null;
    throw new Error("No service should start after failed bootstrap.");
  } } } } as unknown as Window;
  Object.defineProperty(globalThis, "window", { value: fake, configurable: true });
  try {
    await assert.rejects(installTauriBridge(), /Onboarding failed/);
    assert.equal(fake.recordMaker, undefined);
    assert.equal(fake.recordMakerStartup, undefined);
    await fake.recordMakerFinishClose!();
    assert.deepEqual(calls, ["boot", "close-commit"]);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
