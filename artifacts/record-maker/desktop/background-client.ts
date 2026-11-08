import { randomUUID } from "node:crypto";
import type { Workspace, SaveReceipt, WorkerResult } from "../src/lib/contracts";
import type { CloudStatus, DocumentFile } from "../src/lib/workflow-api";

export interface BackgroundTransport {
  postMessage(message: unknown): void;
  on(event: "message" | "exit" | "error", listener: (...args: any[]) => void): unknown;
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
  private pending = new Map<string, { resolve(value: any): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
  private stopped = false;
  constructor(
    private child: BackgroundTransport,
    private account: Account,
    private record: (event: string, details?: Record<string, unknown>) => void,
  ) {
    child.on("message", message => void this.receive(message).catch(() => this.fail()));
    child.on("exit", () => this.fail());
    child.on("error", () => this.fail());
  }
  private async receive(message: any) {
    if (!message || this.stopped) return;
    if (message.type === "token" && typeof message.id === "string") {
      try {
        const token = await this.account.token();
        if (!this.stopped) this.child.postMessage({ type: "token-result", id: message.id, token });
      } catch {
        if (!this.stopped) this.child.postMessage({ type: "token-result", id: message.id, error: "Google access could not be refreshed. Check your connection or sign in again with the same college account. Local work was preserved." });
      }
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
    if (message.ok) waiting.resolve(message.value);
    else waiting.reject(new Error(message.error || "The background operation failed. Saved files were preserved."));
  }
  request<T = any>(action: string, payload: Record<string, unknown> = {}, timeoutMs = 660_000): Promise<T> {
    if (this.stopped) return Promise.reject(new Error("The background service is unavailable. Restart the app; saved files were preserved."));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Do not silently retry a write with an unknown commit outcome.
        this.fail("The background service stopped responding. Restart the app to reopen the committed records; do not clear local files.");
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.child.postMessage({ type: "request", id, action, payload, account: { identity: this.account.identity, configured: this.account.configured } }); }
      catch { this.fail(); }
    });
  }
  private fail(message = "The background service stopped. Restart the app; saved files were preserved.") {
    if (this.stopped) return;
    this.stopped = true;
    for (const waiting of this.pending.values()) { clearTimeout(waiting.timer); waiting.reject(new Error(message)); }
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
