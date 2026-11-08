import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

/** Timings and memory only: never log records, account details or credentials. */
export class PerformanceLog {
  readonly filename: string;
  private queue: Promise<void> = Promise.resolve();
  constructor(directory: string, private version: string) {
    this.filename = path.join(directory, "logs", "performance.jsonl");
  }
  record(event: string, details: Record<string, unknown> = {}) {
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    const line = JSON.stringify({
      at: new Date().toISOString(), version: this.version, diagnosticsVersion: 2, event, ...details,
      mainRssMB: Math.round(memory.rss / 1048576), mainHeapMB: Math.round(memory.heapUsed / 1048576),
      mainCpuUserMs: Math.round(cpu.user / 1000), mainCpuSystemMs: Math.round(cpu.system / 1000),
      systemFreeMB: Math.round(os.freemem() / 1048576), systemTotalMB: Math.round(os.totalmem() / 1048576),
    }) + "\n";
    this.queue = this.queue.then(async () => {
      await fs.mkdir(path.dirname(this.filename), { recursive: true });
      const stat = await fs.stat(this.filename).catch(() => null);
      if (stat && stat.size > 1_000_000) await fs.rename(this.filename, `${this.filename}.previous`).catch(() => undefined);
      await fs.appendFile(this.filename, line);
    }).catch(() => undefined); // Diagnostics must never prevent a record save.
  }
  async exportTo(filename: string) {
    this.record("diagnostics-export");
    await this.queue;
    await fs.copyFile(this.filename, filename);
  }
}
