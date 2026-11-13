import { randomUUID } from "node:crypto";
import type { Workspace, SaveReceipt, WorkerResult } from "../src/lib/contracts";
import type { CloudStatus, DocumentFile } from "../src/lib/workflow-api";
import { diagnosticContext } from "./diagnostic-context";
import { diagnosticError, diagnosticOperation, diagnosticOutcome } from "./diagnostic-policy";

export interface BackgroundTransport {
  postMessage(message: unknown): void;
  on(event: "message" | "exit" | "error" | "spawn", listener: (...args: any[]) => void): unknown;
  kill(): unknown;
}
type Account = {
  configured: boolean;
  identity?: { sub: string; email: string; name: string };
  token(): Promise<string>;
};

export function cloudStatusWithActivity(status: CloudStatus, startupPending: boolean, switching: boolean, syncing: boolean): CloudStatus {
  return {
    ...status,
    state: startupPending || syncing ? "syncing" : status.state,
    busy: startupPending || switching || syncing,
    switching,
  };
}

/** Only window/account operations stay in Electron's main process. */
export class BackgroundClient {
  private pending = new Map<string, { resolve(value: any): void; reject(error: Error): void; timer: NodeJS.Timeout; operation: string; started: number; parentOperationId?: string }>();
  private stopped = false;
  constructor(
    private child: BackgroundTransport,
    private account: Account,
    private record: (event: string, details?: Record<string, unknown>) => void,
    private assertExclusive?: () => Promise<void>,
  ) {
    child.on("message", message => void this.receive(message).catch(() => this.fail()));
    child.on("exit", (code: number) => { this.record("background-exit", { exitCode: code }); this.fail(); });
    child.on("error", () => { this.record("background-error"); this.fail(); });
  }
  private async receive(message: any) {
    if (!message || this.stopped) return;
    if (message.type === "token" && typeof message.id === "string") {
      const started = performance.now();
      try {
        await this.assertExclusive?.();
        const token = await this.account.token();
        this.record("google-token", { ok: true, durationMs: Math.round(performance.now() - started) });
        if (!this.stopped) this.child.postMessage({ type: "token-result", id: message.id, token });
      } catch (error) {
        this.record("google-token", { ok: false, durationMs: Math.round(performance.now() - started), ...diagnosticError(error) });
        if (!this.stopped) this.child.postMessage({ type: "token-result", id: message.id, error: "Google access could not be refreshed. Check your connection or sign in again with the same college account. Local work was preserved." });
      }
      return;
    }
    if (message.type === "diagnostic" && message.event === "python-job") {
      this.record(message.stage ? "python-stage" : "python-job", {
        operation: diagnosticOperation(message.operation), ok: message.ok === true,
        ...(["engine-loading", "engine-ready"].includes(message.stage) ? { stage: message.stage } : {}),
        durationMs: typeof message.durationMs === "number" ? message.durationMs : 0,
        ...(typeof message.parentOperationId === "string" && /^[a-f0-9-]{36}$/.test(message.parentOperationId) ? { parentOperationId: message.parentOperationId } : {}),
        ...(message.ok ? {} : { category: diagnosticError(new Error(message.error || "" )).category }),
      });
      return;
    }
    if (message.type === "diagnostic" && message.event === "drive-request") {
      this.record("drive-request", {
        method: ["GET", "POST", "PATCH", "DELETE"].includes(message.method) ? message.method : "other",
        httpStatus: Number.isInteger(message.httpStatus) ? message.httpStatus : 0,
        attempt: typeof message.attempt === "number" ? message.attempt : 0,
        ok: message.ok === true,
        durationMs: typeof message.durationMs === "number" ? message.durationMs : 0,
        ...(typeof message.parentOperationId === "string" && /^[a-f0-9-]{36}$/.test(message.parentOperationId) ? { parentOperationId: message.parentOperationId } : {}),
        ...(message.ok ? {} : diagnosticError(new Error(message.error || ""))),
      });
      return;
    }
    if (message.type === "timing" && typeof message.phase === "string") {
      this.record("background-operation", { phase: message.phase, durationMs: message.durationMs, ok: message.ok });
      return;
    }
    if (message.type !== "result") return;
    const waiting = this.pending.get(message.id);
    if (!waiting) return;
    clearTimeout(waiting.timer);
    this.pending.delete(message.id);
    this.record("background-request-end", {
      operation: waiting.operation, operationId: message.id, parentOperationId: waiting.parentOperationId,
      durationMs: Math.round(performance.now() - waiting.started), ok: message.ok === true,
      ...(message.ok ? diagnosticOutcome(message.value) : diagnosticError(new Error(message.error || ""))),
    });
    if (message.ok) waiting.resolve(message.value);
    else waiting.reject(new Error(message.error || "The background operation failed. Saved files were preserved."));
  }
  request<T = any>(action: string, payload: Record<string, unknown> = {}, timeoutMs = 660_000): Promise<T> {
    if (this.stopped) return Promise.reject(new Error("The background service is unavailable. Restart the app; saved files were preserved."));
    const id = randomUUID();
    const operation = diagnosticOperation(action === "documents-run" ? payload.action : action);
    const parentOperationId = diagnosticContext.getStore();
    const started = performance.now();
    this.record("background-request-start", { operation, operationId: id, parentOperationId });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Do not silently retry a write with an unknown commit outcome.
        this.fail("The background service stopped responding. Restart the app to reopen the committed records; do not clear local files.");
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, operation, started, parentOperationId });
      try { this.child.postMessage({ type: "request", id, action, payload, account: { identity: this.account.identity, configured: this.account.configured } }); }
      catch { this.fail(); }
    });
  }
  private fail(message = "The background service stopped. Restart the app; saved files were preserved.") {
    if (this.stopped) return;
    this.stopped = true;
    for (const [operationId, waiting] of this.pending) {
      this.record("background-request-end", { operationId, operation: waiting.operation, parentOperationId: waiting.parentOperationId,
        ok: false, durationMs: Math.round(performance.now() - waiting.started), ...diagnosticError(new Error(message)) });
      clearTimeout(waiting.timer); waiting.reject(new Error(message));
    }
    this.pending.clear();
    this.child.kill();
  }
  stop() { this.fail("The account workspace was closed. Saved files were preserved."); }
  async close() {
    try { await this.request("shutdown", {}, 5000); } finally { this.stop(); }
  }
}

export class BackgroundStore {
  constructor(readonly root: string, private client: BackgroundClient) {}
  pointer() { return this.client.request<{ revisionId: string; savedAt: string; pendingItems: number } | null>("store-pointer"); }
  load() { return this.loadWithRevision().then(result => result.workspace); }
  loadWithRevision() { return this.client.request<{ workspace: Workspace; revisionId: string | null }>("store-load"); }
  save(workspace: Workspace, expectedRevision?: string | null) {
    return this.client.request<SaveReceipt>("store-save", { workspace, expectedRevision });
  }
  prepareGeneration(workspace: Workspace, expectedRevision: string | null) {
    return this.client.request<{ receipt: SaveReceipt; generationToken: string }>("store-save-generation", { workspace, expectedRevision });
  }
}
export class BackgroundSync {
  busy = false;
  constructor(private client: BackgroundClient) {}
  status() { return this.client.request<CloudStatus>("sync-status"); }
  async sync() {
    if (this.busy) throw new Error("A Drive operation is already running.");
    this.busy = true;
    try { return await this.client.request<CloudStatus>("sync-run"); }
    finally { this.busy = false; }
  }
  pause() { return this.client.request("sync-pause"); }
  // Awaited to avoid unhandled rejection if the child has exited.
  invalidateStatus() { return this.client.request("sync-invalidate"); }
}
export class BackgroundDocuments {
  busy = 0;
  constructor(private client: BackgroundClient) {}
  list() { return this.client.request<DocumentFile[]>("documents-list"); }
  file(id: string) { return this.client.request<{ item: DocumentFile; filename: string }>("documents-file", { id }); }
  async run(action: string, payload: Record<string, unknown>) {
    this.busy++;
    try { return await this.client.request("documents-run", { action, payload }); }
    finally { this.busy--; }
  }
}
export class BackgroundPython {
  constructor(private client: BackgroundClient) {}
  health() { return this.client.request<WorkerResult>("python-health"); }
  inspect(subjectId: string, programIds: string[]) { return this.client.request<WorkerResult>("inspect", { subjectId, programIds }); }
}
