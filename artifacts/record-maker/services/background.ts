import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { WorkspaceStore } from "./store";
import { DriveSync, DriveFiles } from "./drive-sync";
import { PythonWorker } from "./worker-client";
import { DocumentService } from "./processing";
import { diagnosticContext } from "./diagnostic-context";

// Electron UtilityProcess in production; Node IPC permits testing the exact
// bundled service without simulating the storage or Drive implementation.
const port = process.parentPort;
const send = (message: unknown) => port ? port.postMessage(message) : process.send!(message);
const [root, command, ...args] = process.argv.slice(2);
if (!root || !path.isAbsolute(root) || !command) throw new Error("Invalid background service startup");
const store = new WorkspaceStore(root);
const worker = new PythonWorker(command, args, details => send({ type: "diagnostic", event: "python-job", ...details }));
const documents = new DocumentService(root, worker, store);
let closing = false;
const tokens = new Map<string, { resolve(token: string): void; reject(error: Error): void }>();
const account = {
  identity: undefined as { sub: string; email: string; name: string } | undefined,
  configured: false,
  token: () => new Promise<string>((resolve, reject) => {
    if (closing) { reject(new Error("The app is closing.")); return; }
    const id = randomUUID(); tokens.set(id, { resolve, reject }); send({ type: "token", id });
  }),
};
const driveDiagnostic = (details: Record<string, unknown>) => send({
  type: "diagnostic", event: "drive-request", parentOperationId: diagnosticContext.getStore(), ...details,
});
const sync = new DriveSync(account, () => store, driveDiagnostic);
async function dispatch(action: string, payload: Record<string, any>) {
  if (closing && action !== "shutdown") throw new Error("The background workspace is closing.");
  switch (action) {
    case "store-pointer": return store.pointer();
    case "store-load": return store.loadWithRevision();
    case "store-save": return store.save(payload.workspace, payload.expectedRevision);
    case "store-save-generation": return documents.prepareGeneration(payload.workspace, payload.expectedRevision);
    case "sync-status": return sync.status();
    case "sync-run": return sync.sync();
    case "sync-pause": return sync.pause();
    case "sync-invalidate": sync.invalidateStatus(); return null;
    case "documents-list": return documents.list();
    case "documents-file": return documents.file(payload.id);
    case "documents-run": return documents.run(z.string().parse(payload.action), payload.payload);
    case "source-folder": {
      const directory = z.string().parse(payload.directory);
      if (!path.isAbsolute(directory)) throw new Error("Select an absolute source folder.");
      const names = await fs.readdir(directory, { withFileTypes: true });
      const result = [];
      for (const entry of names.filter(n => n.isFile() && /\.(py|java|c|h|cpp|hpp|txt|sql|js|ts)$/i.test(n.name)).slice(0, 300)) {
        const filename = path.join(directory, entry.name);
        if ((await fs.stat(filename)).size > 1_000_000) throw new Error(`Source ${entry.name} exceeds the 1 MB limit.`);
        const code = new TextDecoder("utf-8", { fatal: true }).decode(await fs.readFile(filename));
        if (code.includes("\x00")) throw new Error("A selected source is binary, not source text.");
        result.push({ id: randomUUID(), name: entry.name, role: "Main code", code, include: true });
      }
      return result;
    }
    case "drive-sources": {
      const id = z.string().regex(/^[A-Za-z0-9_-]{5,150}$/).parse(payload.id);
      const api = new DriveFiles(account, undefined, driveDiagnostic);
      const files = await api.list(`'${id}' in parents`);
      const result = [];
      for (const file of files.filter(f => /\.(py|java|c|h|cpp|hpp|txt|sql|js|ts)$/i.test(f.name)).slice(0, 300)) {
        const bytes = await api.bytes(file.id);
        if (bytes.length > 1_000_000) throw new Error(`Source ${file.name} exceeds the 1 MB limit.`);
        const code = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        if (code.includes("\x00")) throw new Error("A selected Drive file is binary.");
        result.push({ id: randomUUID(), name: file.name, role: "Main code", code, include: true });
      }
      return result;
    }
    case "python-health": return worker.request("health");
    case "inspect": {
      const subjectId = z.string().uuid().parse(payload.subjectId);
      const programIds = z.array(z.string().uuid()).max(500).parse(payload.programIds);
      return store.withSnapshot(snapshotPath => worker.request("snapshot-summary", { snapshotPath, subjectId, programIds }));
    }
    case "cleanup": {
      if (sync.busy || documents.busy) throw new Error("Finish processing before cleanup.");
      const names = await fs.readdir(root, { recursive: true });
      if (names.some(name => path.basename(name).startsWith("~$"))) throw new Error("Close the app's generated documents in Microsoft Word before deleting local cached files. Nothing was deleted.");
      worker.stop();
      await fs.rm(root, { recursive: true, force: true });
      return null;
    }
    case "shutdown":
      closing = true;
      worker.stop();
      // Abort queued token exchanges as well as any in-flight HTTP request.
      for (const waiting of tokens.values()) waiting.reject(new Error("The app is closing; local work was preserved."));
      tokens.clear();
      await sync.pause();
      return null;
    default: throw new Error("Unsupported background operation");
  }
}
async function receive(message: any) {
  if (message?.type === "token-result") {
    const waiting = tokens.get(message.id); tokens.delete(message.id);
    if (message.error) waiting?.reject(new Error(message.error)); else waiting?.resolve(message.token);
    return;
  }
  if (message?.type !== "request") return;
  const started = performance.now();
  account.identity = message.account?.identity;
  account.configured = message.account?.configured === true;
  let ok = false;
  try {
    const value = await diagnosticContext.run(message.id, () => dispatch(message.action, message.payload || {}));
    ok = true; send({ type: "result", id: message.id, ok: true, value });
  } catch (error) {
    send({ type: "result", id: message.id, ok: false, error: error instanceof Error ? error.message : "Background operation failed." });
  } finally {
    const durationMs = Math.round(performance.now() - started);
    if (durationMs >= 250 || ["store-load", "sync-run", "documents-run"].includes(message.action)) {
      send({ type: "timing", phase: message.action, durationMs, ok });
    }
  }
}
if (port) port.on("message", event => void receive(event.data));
else {
  process.on("message", message => void receive(message));
  process.on("disconnect", () => { worker.stop(); process.exit(0); });
}
