import { randomUUID } from "node:crypto";

export const DIAGNOSTIC_FLAG = "--record-maker-startup-diagnostic";
export const PAGE_SIGNAL = "record-maker-startup-check:script-ready";
export const DIAGNOSTIC_DEADLINE_MS = 60_000;
export const EXTERNAL_DEADLINE_MS = 120_000;

export function diagnosticRunName(argv: readonly string[]) {
  const values = argv.filter(value => value.startsWith("--record-maker-startup-run="));
  if (values.length > 1) throw new Error("Specify one diagnostic run.");
  const name = values[0]?.slice("--record-maker-startup-run=".length) ?? `run-${randomUUID()}`;
  if (!/^run-[a-zA-Z0-9-]{1,80}$/.test(name)) throw new Error("Invalid diagnostic run.");
  return name;
}

export type Milestone = "electronReady" | "windowCreated" | "domReady" | "scriptReady" | "loadFinished" | "firstPaint";
export type DiagnosticResult = "running" | "ready" | "timeout" | "closed-before-ready" | "error";
export class DiagnosticState {
  readonly milestones: Partial<Record<Milestone, number>> = {};
  result: DiagnosticResult = "running";
  unresponsiveCount = 0;
  constructor(readonly entryProcessAgeMs: number) {}
  mark(stage: Milestone, processAgeMs: number) {
    this.milestones[stage] ??= processAgeMs;
    if (this.result === "running" && ["domReady", "scriptReady", "loadFinished", "firstPaint"].every(key =>
      this.milestones[key as Milestone] !== undefined)) this.result = "ready";
  }
  finish(result: Exclude<DiagnosticResult, "running" | "ready">) {
    if (this.result === "running") this.result = result;
  }
  report() {
    return {
      scenario: "minimal-electron", profile: "fresh-isolated", network: "blocked",
      result: this.result, entryProcessAgeMs: this.entryProcessAgeMs,
      milestonesMsFromProcessStart: { ...this.milestones }, unresponsiveCount: this.unresponsiveCount,
      diagnosticDeadlineMs: DIAGNOSTIC_DEADLINE_MS,
      note: "This tests a minimal Electron window, not dashboard readiness or Windows disk/paging causes.",
    };
  }
}
