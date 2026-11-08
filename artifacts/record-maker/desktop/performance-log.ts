import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { diagnosticContext } from "./diagnostic-context";
import { diagnosticError, diagnosticOutcome } from "./diagnostic-policy";

/** Bounded, asynchronous local diagnostics. Never pass record content to record(). */
export class PerformanceLog {
  readonly filename: string;
  readonly sessionId = randomUUID();
  private queue: Promise<void> = Promise.resolve();
  private buffer: string[] = [];
  private scheduled?: NodeJS.Timeout;
  private writing = false;
  private sequence = 0;
  private dropped = 0;
  constructor(directory: string, private version: string, private maxBytes = 2_000_000) {
    this.filename = path.join(directory, "logs", "performance.jsonl");
  }
  record(event: string, details: Record<string, unknown> = {}) {
    if (this.buffer.length >= 2000) { this.dropped++; return; }
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    const line = JSON.stringify({
      ...details,
      at: new Date().toISOString(), version: this.version, diagnosticsVersion: 3, event,
      sessionId: this.sessionId, sequence: ++this.sequence, processAgeMs: Math.round(process.uptime() * 1000),
      ...(this.dropped ? { droppedEvents: this.dropped } : {}),
      mainRssMB: Math.round(memory.rss / 1048576), mainHeapMB: Math.round(memory.heapUsed / 1048576),
      mainCpuUserMs: Math.round(cpu.user / 1000), mainCpuSystemMs: Math.round(cpu.system / 1000),
      systemFreeMB: Math.round(os.freemem() / 1048576), systemTotalMB: Math.round(os.totalmem() / 1048576),
    }) + "\n";
    this.dropped = 0;
    this.buffer.push(line);
    if (!this.scheduled && !this.writing) {
      this.scheduled = setTimeout(() => { this.scheduled = undefined; void this.flush(); }, 250);
      this.scheduled.unref();
    }
  }
  async trace<T>(operation: string, run: () => Promise<T> | T): Promise<T> {
    const operationId = randomUUID(), started = performance.now();
    this.record("operation-start", { operation, operationId });
    return diagnosticContext.run(operationId, async () => {
      try {
        const result = await run();
        this.record("operation-end", { operation, operationId, ok: true, durationMs: Math.round(performance.now() - started), ...diagnosticOutcome(result) });
        return result;
      } catch (error) {
        this.record("operation-end", { operation, operationId, ok: false, durationMs: Math.round(performance.now() - started), ...diagnosticError(error) });
        throw error;
      }
    });
  }
  flush(): Promise<void> {
    if (this.scheduled) { clearTimeout(this.scheduled); this.scheduled = undefined; }
    if (this.writing) return this.queue.then(() => this.flush());
    if (!this.buffer.length) return this.queue;
    this.writing = true;
    const batch = this.buffer.splice(0, 128);
    const lines = batch.join("");
    this.queue = this.queue.then(async () => {
      await fs.mkdir(path.dirname(this.filename), { recursive: true });
      const stat = await fs.stat(this.filename).catch(() => null);
      if (stat && stat.size + Buffer.byteLength(lines) > this.maxBytes) {
        await fs.rm(`${this.filename}.previous`, { force: true });
        await fs.rename(this.filename, `${this.filename}.previous`);
      }
      await fs.appendFile(this.filename, lines, { mode: 0o600 });
    }).catch(() => { this.dropped += batch.length; }).finally(() => { this.writing = false; });
    return this.queue.then(() => {
      // Dropped events are reported on the next real event, never retried endlessly.
      return this.buffer.length ? this.flush() : undefined;
    });
  }
  async exportTo(filename: string) {
    this.record("diagnostics-export");
    await this.flush();
    // Serialize with rotation, including events that arrive while the dialog/export runs.
    const exporting = this.queue.then(async () => {
      const previous = await fs.readFile(`${this.filename}.previous`).catch(() => Buffer.alloc(0));
      const current = await fs.readFile(this.filename);
      await fs.writeFile(filename, Buffer.concat([previous, current]), { mode: 0o600 });
    });
    this.queue = exporting.catch(() => undefined);
    await exporting;
  }
}
