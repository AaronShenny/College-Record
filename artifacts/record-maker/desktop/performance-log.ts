import { promises as fs } from "node:fs";
import path from "node:path";

/** Timings and memory only: never log records, account details or credentials. */
export class PerformanceLog {
  readonly filename: string;
  private queue: Promise<void> = Promise.resolve();
  constructor(directory: string, private version: string) {
    this.filename = path.join(directory, "logs", "performance.jsonl");
  }
  record(event: string, details: Record<string, unknown> = {}) {
    const line = JSON.stringify({ at: new Date().toISOString(), version: this.version, event, ...details, mainRssMB: Math.round(process.memoryUsage().rss / 1048576) }) + "\n";
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
