import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { JsonLineFrames, ServiceProtocol } from "./service-protocol";

test("stdio frames preserve split UTF-8 and reject oversized or invalid frames", () => {
  const parsed: unknown[] = [];
  const frames = new JsonLineFrames(value => parsed.push(value), 64);
  const data = Buffer.from('{"title":"é"}\n{"next":true}\n');
  const split = data.indexOf(0xc3) + 1;
  frames.push(data.subarray(0, split));
  frames.push(data.subarray(split));
  assert.deepEqual(parsed, [{ title: "é" }, { next: true }]);
  assert.throws(() => frames.push(Buffer.alloc(65)), /size limit/);
});

test("unknown methods fail closed without dispatching a workspace mutation", async () => {
  let called = false, stopped = false;
  const peer = new ServiceProtocol(() => {}, async () => { called = true; }, () => { stopped = true; });
  await peer.receive({ protocol: 1, kind: "request", id: randomUUID(), method: "arbitrary-shell", payload: {} });
  assert.equal(called, false);
  assert.equal(stopped, true);
});

test("native callbacks and service calls are multiplexed, not blocked by a long operation", async () => {
  const sent: any[] = [];
  const peer: ServiceProtocol = new ServiceProtocol(frame => sent.push(frame), async method =>
    method === "workflow" ? await peer.native("open-dialog", {}) : { responsive: true }, () => assert.fail("invalid protocol"));
  const job = peer.receive({ protocol: 1, kind: "request", id: randomUUID(), method: "workflow", payload: {} });
  const fastId = randomUUID();
  await peer.receive({ protocol: 1, kind: "request", id: fastId, method: "runtime", payload: {} });
  assert.equal(sent.find(row => row.id === fastId).result.responsive, true);
  const dialog = sent.find(row => row.kind === "native");
  await peer.receive({ protocol: 1, kind: "native-result", id: dialog.id, ok: true, result: { canceled: true } });
  await job;
  assert.ok(sent.some(row => row.kind === "result" && row.result?.canceled));
  peer.close();
});

test("closing rejects pending requests and never retries an unknown write outcome", async () => {
  const sent: object[] = [];
  const peer = new ServiceProtocol(frame => sent.push(frame), async () => {}, () => {});
  const request = peer.native("vault-encrypt", {});
  peer.close();
  await assert.rejects(request, /not retried/);
  assert.equal(sent.length, 1);
});
