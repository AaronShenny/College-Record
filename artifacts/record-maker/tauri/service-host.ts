import path from "node:path";
import { fork } from "node:child_process";
import { z } from "zod";
import { HostWorkflows } from "../services/host-workflows";
import type { NativePlatform } from "../services/native-platform";
import { NativeSession } from "../services/native-session";
import { JsonLineFrames, ServiceProtocol, MAX_FRAME_BYTES } from "../services/service-protocol";
import { diagnosticContext } from "../services/diagnostic-context";
import { randomUUID } from "node:crypto";
import { diagnosticError, diagnosticOperation, diagnosticOutcome } from "../services/diagnostic-policy";

// Fixed arguments supplied by the native host, never renderer-selected roots or executables.
const [directory, resources, version, packaged] = process.argv.slice(2);
if (!directory || !resources || !path.isAbsolute(directory) || !path.isAbsolute(resources) ||
    !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(version || "") || !["true", "false"].includes(packaged)) {
  throw new Error("Invalid native host configuration.");
}
const hostNonce = process.env.RECORD_MAKER_HOST_NONCE;
if (!hostNonce || !/^[a-f0-9]{64}$/.test(hostNonce)) throw new Error("The service must be started by its native owner.");
delete process.env.RECORD_MAKER_HOST_NONCE;
let workflows: HostWorkflows;
let stopped = false;
let updateState = { state: "idle" };
const finish = () => {
  if (stopped) return;
  stopped = true; peer.close();
  void workflows?.close().finally(() => process.exit(1));
  setTimeout(() => process.exit(1), 5000).unref();
};
const peer = new ServiceProtocol(frame => {
  const text = JSON.stringify(frame);
  if (Buffer.byteLength(text) > MAX_FRAME_BYTES) throw new Error("Desktop response is too large.");
  process.stdout.write(text + "\n");
}, (method, payload) => diagnosticContext.run(randomUUID(), async () => {
  await initialized;
  const operation = diagnosticOperation(method === "workflow" && payload && typeof payload === "object" ? (payload as { action?: unknown }).action : method);
  const started = performance.now();
  if (method !== "diagnostic") workflows.diagnostics.record("ipc-start", { operation });
  try {
    const result = await session.dispatch(method, payload);
    if (method !== "diagnostic") workflows.diagnostics.record("ipc-complete", {
      operation, durationMs: Math.round(performance.now() - started), ...diagnosticOutcome(result),
    });
    if (method === "shutdown") await workflows.diagnostics.flush();
    return result;
  } catch (error) {
    workflows.diagnostics.record("ipc-failed", { operation, durationMs: Math.round(performance.now() - started), ...diagnosticError(error) });
    throw error;
  }
}), finish);
const platform: NativePlatform = {
  version, packaged: packaged === "true", resources,
  appRoot: path.resolve(__dirname, "../.."),
  vault: {
    available: () => peer.native("vault-available", {}),
    encrypt: async value => Buffer.from(await peer.native("vault-encrypt", { value }), "base64"),
    decrypt: value => peer.native("vault-decrypt", { value: value.toString("base64") }),
  },
  createBackground: (root, command, args) => {
    const child = fork(path.join(__dirname, "background.cjs"), [root, command, ...args], {
      stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true, execArgv: [],
      // Use the signed/bundled Node executable, not PATH or a renderer-supplied command.
      execPath: process.execPath,
    });
    return {
      postMessage: message => { if (!child.connected) throw new Error("Record storage service stopped."); child.send(message as object); },
      on: (event, listener) => child.on(event, listener), kill: () => child.kill(),
    };
  },
  openExternal: async url => {
    const target = new URL(url);
    if (target.origin !== "https://accounts.google.com" || target.pathname !== "/o/oauth2/v2/auth") throw new Error("Unsupported browser destination.");
    await peer.native("open-oauth", { url });
  },
  openPath: filename => peer.native("open-document", { filename }),
  openDialog: options => peer.native("open-dialog", options),
  saveDialog: options => peer.native("save-dialog", options),
  messageDialog: options => peer.native("message-dialog", options),
  updates: {
    initialize: async () => { updateState = await peer.native("updates-initialize", {}); },
    check: async () => { updateState = await peer.native("updates-check", {}); return updateState; },
    status: () => updateState,
    restart: () => peer.native("updates-restart", {}),
  },
};
workflows = new HostWorkflows(directory, platform);
const session = new NativeSession(workflows, platform, async () => {
  const image = await peer.native("paste-image", {});
  if (image === null) return null;
  const parsed = z.object({ dataUrl: z.string().max(12 * 1024 * 1024) }).strict().parse(image);
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(parsed.dataUrl) ||
      Buffer.from(parsed.dataUrl.split(",")[1], "base64").byteLength > 8 * 1024 * 1024) throw new Error("Clipboard images must be PNG and smaller than 8 MB.");
  return { id: randomUUID(), kind: "image", name: "Pasted screenshot", dataUrl: parsed.dataUrl, include: true };
});
// Initialize only after construction: encrypted credential reads can send native requests.
let nativeOwnerReady: () => void;
const ownerReady = new Promise<void>(resolve => { nativeOwnerReady = resolve; });
const initialized = ownerReady.then(() => workflows.initialize());
initialized.catch(() => {}); // Each caller receives the same explicit initialization error.
let handshake = false;
const frames = new JsonLineFrames(frame => {
  if (!handshake) {
    const first = z.object({ protocol: z.literal(1), kind: z.literal("host-ready"), nonce: z.literal(hostNonce) }).strict().safeParse(frame);
    if (!first.success) { finish(); return; }
    handshake = true;
    nativeOwnerReady();
    return;
  }
  void peer.receive(frame).catch(finish);
});
process.stdin.on("data", chunk => { try { frames.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); } catch { finish(); } });
process.stdin.on("end", finish);
process.stdout.on("error", finish);
process.on("SIGTERM", finish);
process.on("SIGINT", finish);
