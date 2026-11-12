import { test } from "node:test";
import assert from "node:assert/strict";
import { configureGraphics } from "./graphics";

test("Windows disables acceleration without requiring a launch flag", () => {
  let calls = 0;
  const result = configureGraphics({ disableHardwareAcceleration: () => { calls++; } }, "win32", []);
  assert.equal(calls, 1);
  assert.deepEqual(result, { disableGpu: true, graphicsPolicy: "windows-compatibility-default" });
});

test("existing graphics-disable shortcuts remain compatible", () => {
  let calls = 0;
  const result = configureGraphics({ disableHardwareAcceleration: () => { calls++; } }, "win32", ["--record-maker-disable-gpu"]);
  assert.equal(calls, 1);
  assert.deepEqual(result, { disableGpu: true, graphicsPolicy: "launch-flag" });
});

test("non-Windows previews retain their graphics default unless explicitly disabled", () => {
  let calls = 0;
  const app = { disableHardwareAcceleration: () => { calls++; } };
  assert.equal(configureGraphics(app, "linux", []).disableGpu, false);
  assert.equal(configureGraphics(app, "darwin", []).disableGpu, false);
  assert.equal(calls, 0);
  assert.equal(configureGraphics(app, "linux", ["--record-maker-disable-gpu"]).disableGpu, true);
  assert.equal(calls, 1);
});
