import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { WorkerResult } from "../src/lib/contracts";
import { diagnosticContext } from "./diagnostic-context";

export class PythonWorker {
  private child?: ChildProcessWithoutNullStreams;
  private buffer = "";
  private pending = new Map<string, { resolve: (result: WorkerResult) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  constructor(private command: string, private args: string[],
    private diagnostic: (details: Record<string, unknown>) => void = () => undefined) {}
  private start() {
    if (this.child) return;
    this.child = spawn(this.command, this.args, { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const child = this.child;
    child.stdout.setEncoding("utf8");
    child.stderr.resume(); // never mix diagnostics with the JSON protocol
    child.stdout.on("data", (chunk: string) => {
      if (this.child !== child) return;
      this.buffer += chunk;
      if (this.buffer.length > 1_000_000) { this.stop("Python worker response exceeded its limit"); return; }
      let newline: number;
      while ((newline = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, newline);
        this.buffer = this.buffer.slice(newline + 1);
        try {
          const response = JSON.parse(line);
          if (response?.protocol !== 1 || typeof response?.id !== "string") {
            this.stop(response?.error || "Python helper returned an incompatible response");
            return;
          }
          const waiting = this.pending.get(response.id);
          if (!waiting) continue;
          clearTimeout(waiting.timer);
          this.pending.delete(response.id);
          if (response.ok === true && response.protocol === 1 && typeof response.result === "object" && response.result !== null) {
            waiting.resolve({ jobId: response.id, result: response.result });
          } else waiting.reject(new Error(response.error || "Python helper returned an incompatible response"));
        } catch { this.stop("Python helper sent an invalid JSON response"); return; }
      }
    });
    child.on("error", () => { if (this.child === child) this.stop("Python helper could not start. Check the packaged worker or the development Python installation."); });
    child.stdin.on("error", () => { if (this.child === child) this.stop("Could not send a job to the Python helper"); });
    child.on("exit", () => { if (this.child === child) this.stop("Python helper exited before completing its jobs."); });
  }
  async request(action: "health" | "snapshot-summary" | "workflow", params: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<WorkerResult> {
    const started = performance.now(), parentOperationId = diagnosticContext.getStore();
    try {
      const result = await this.execute(action, params, timeoutMs);
      this.diagnostic({ operation: action, ok: true, durationMs: Math.round(performance.now() - started), parentOperationId });
      return result;
    } catch (error) {
      // Only parent process classifies the error. This message is not written raw.
      this.diagnostic({ operation: action, ok: false, durationMs: Math.round(performance.now() - started), parentOperationId,
        error: error instanceof Error ? error.message : "" });
      throw error;
    }
  }
  private execute(action: "health" | "snapshot-summary" | "workflow", params: Record<string, unknown>, timeoutMs: number): Promise<WorkerResult> {
    const id = randomUUID();
    const line = JSON.stringify({ protocol: 1, id, action, params }) + "\n";
    if (Buffer.byteLength(line, "utf8") > 131_072) return Promise.reject(new Error("This Python job request is too large; no job was started"));
    this.start();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.stop("Python helper did not respond within 30 seconds. The job was stopped; your saved workspace is unchanged.");
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child!.stdin.write(line, (error) => {
        if (error) this.stop("Could not send a job to the Python helper");
      });
    });
  }
  stop(reason = "Application is closing") {
    const child = this.child;
    this.child = undefined;
    this.buffer = "";
    child?.kill();
    for (const waiting of this.pending.values()) { clearTimeout(waiting.timer); waiting.reject(new Error(reason)); }
    this.pending.clear();
  }
}
