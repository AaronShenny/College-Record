import { test } from "node:test";
import assert from "node:assert/strict";
import { withTimeout } from "../src/lib/with-timeout";

test("pending clipboard permission ends in an actionable error", async () => {
  await assert.rejects(withTimeout(new Promise<never>(() => {}), 10, "Retry or use Add image."), /Retry or use Add image/);
});
test("resolved operations return their result and failed operations retain their error", async () => {
  assert.equal(await withTimeout(Promise.resolve("image"), 100, "timeout"), "image");
  await assert.rejects(withTimeout(Promise.reject(new Error("permission denied")), 100, "timeout"), /permission denied/);
});
