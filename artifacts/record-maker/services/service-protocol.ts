import { randomUUID } from "node:crypto";
import { z } from "zod";

export const SERVICE_PROTOCOL = 1;
export const MAX_FRAME_BYTES = 280 * 1024 * 1024;
const id = z.string().uuid();
const request = z.object({
  protocol: z.literal(SERVICE_PROTOCOL), kind: z.literal("request"), id,
  method: z.enum(["runtime", "load", "save", "workflow", "import-source", "paste-image", "python-health", "inspect", "renderer-ready", "diagnostic", "shutdown", "close-check"]),
  payload: z.unknown(),
}).strict();
const nativeResult = z.object({
  protocol: z.literal(SERVICE_PROTOCOL), kind: z.literal("native-result"), id,
  ok: z.boolean(), result: z.unknown().optional(), error: z.string().max(500).optional(),
}).strict();

/** Private stdio protocol, not a socket or an additional renderer capability. */
export class ServiceProtocol {
  private pending = new Map<string, { resolve(value: any): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
  private active = new Set<string>();
  private closed = false;
  constructor(
    private send: (frame: object) => void,
    private dispatch: (method: string, payload: unknown) => Promise<unknown>,
    private failed: () => void,
  ) {}
  native(action: string, payload: unknown): Promise<any> {
    if (this.closed || this.pending.size >= 32) return Promise.reject(new Error("Native service is unavailable or busy."));
    const nativeId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(nativeId);
        reject(new Error("The native operation did not finish. Check the desktop window and try again."));
      }, action.includes("dialog") ? 300_000 : 45_000).unref();
      this.pending.set(nativeId, { resolve, reject, timer });
      try { this.send({ protocol: SERVICE_PROTOCOL, kind: "native", id: nativeId, action, payload }); }
      catch { this.close(); this.failed(); }
    });
  }
  async receive(raw: unknown) {
    if (this.closed) return;
    const reply = nativeResult.safeParse(raw);
    if (reply.success) {
      const item = this.pending.get(reply.data.id);
      if (!item) return; // A late native reply must not complete another request.
      this.pending.delete(reply.data.id);
      clearTimeout(item.timer);
      reply.data.ok ? item.resolve(reply.data.result) : item.reject(new Error(reply.data.error || "The native operation failed."));
      return;
    }
    const parsed = request.safeParse(raw);
    if (!parsed.success || this.active.has(parsed.data.id) || this.active.size >= 64) {
      // No raw payload, source text, paths, credentials or parser errors are logged.
      this.close(); this.failed(); return;
    }
    const frame = parsed.data;
    this.active.add(frame.id);
    try {
      const result = await this.dispatch(frame.method, frame.payload);
      if (!this.closed) this.send({ protocol: SERVICE_PROTOCOL, kind: "result", id: frame.id, ok: true, result: result ?? null });
    } catch (error) {
      if (!this.closed) this.send({ protocol: SERVICE_PROTOCOL, kind: "result", id: frame.id, ok: false,
        error: error instanceof Error ? error.message.slice(0, 1000) : "The desktop operation failed. Local files were preserved." });
    } finally { this.active.delete(frame.id); }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error("The native host stopped. The operation was not retried."));
    }
    this.pending.clear();
  }
}

/** Bound input before JSON parsing; handles UTF-8 split across stream chunks. */
export class JsonLineFrames {
  private chunks: Buffer[] = [];
  private length = 0;
  constructor(private accept: (value: unknown) => void, private maximum = MAX_FRAME_BYTES) {}
  push(chunk: Buffer) {
    let offset = 0;
    for (;;) {
      const newline = chunk.indexOf(10, offset);
      const part = chunk.subarray(offset, newline === -1 ? undefined : newline);
      this.length += part.length;
      if (this.length > this.maximum) throw new Error("The desktop message exceeds its size limit.");
      this.chunks.push(part);
      if (newline === -1) return;
      const bytes = Buffer.concat(this.chunks, this.length);
      this.chunks = []; this.length = 0;
      this.accept(JSON.parse(bytes.toString("utf8")));
      offset = newline + 1;
      if (offset === chunk.length) return;
    }
  }
}
