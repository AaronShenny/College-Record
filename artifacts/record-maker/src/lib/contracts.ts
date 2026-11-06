import { z } from "zod";

const id = z.string().uuid();
const shortText = z.string().max(500);
export const sourceSchema = z.object({
  id, name: z.string().min(1).max(200).refine(v => !/[\\/\x00]/.test(v), "Use a filename, not a path"),
  role: z.string().max(80), code: z.string().max(1_000_000), include: z.boolean(),
}).strict();
export const outputSchema = z.discriminatedUnion("kind", [
  z.object({ id, kind: z.literal("text"), name: shortText, text: z.string().max(500_000), include: z.boolean() }).strict(),
  z.object({ id, kind: z.literal("image"), name: shortText, dataUrl: z.string().max(12_000_000).regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/), include: z.boolean() }).strict(),
]);
export const programSchema = z.object({
  id, number: z.number().int().min(1).max(9999), title: shortText, question: z.string().max(100_000),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(), trashedAt: z.string().datetime().nullable(),
  sources: z.array(sourceSchema).max(50), outputs: z.array(outputSchema).max(100),
  outputMayBeStale: z.boolean(),
}).strict();
export const subjectSchema = z.object({
  id, name: z.string().trim().min(1).max(150), semester: z.number().int().min(1).max(20),
  courseCode: z.string().max(50), updatedAt: z.string().datetime(), trashedAt: z.string().datetime().nullable(),
  programs: z.array(programSchema).max(500),
}).strict().superRefine((subject, ctx) => {
  const numbers = subject.programs.filter(p => !p.trashedAt).map(p => p.number);
  if (new Set(numbers).size !== numbers.length) ctx.addIssue({ code: "custom", message: "Active program numbers must be unique within a subject" });
});
export const workspaceSchema = z.object({
  schemaVersion: z.literal(1), subjects: z.array(subjectSchema).max(100),
}).strict().superRefine((workspace, ctx) => {
  const ids: string[] = [];
  for (const subject of workspace.subjects) {
    ids.push(subject.id);
    for (const program of subject.programs) {
      ids.push(program.id, ...program.sources.map(s => s.id), ...program.outputs.map(o => o.id));
    }
  }
  if (ids.length !== new Set(ids).size) ctx.addIssue({ code: "custom", message: "Workspace IDs must be unique" });
});

export type Workspace = z.infer<typeof workspaceSchema>;
export type Subject = Workspace["subjects"][number];
export type Program = Subject["programs"][number];
export type SourceFile = Program["sources"][number];
export type OutputItem = Program["outputs"][number];
export type SaveReceipt = { savedAt: string; revisionId: string; pendingItems: number; storage: "filesystem" | "browser" };
export type RuntimeInfo = {
  mode: "desktop" | "browser-preview"; version: string; platform: string;
  storageLabel: string; driveConnected: false; pythonAvailable: boolean | null;
};
export type WorkerResult = { jobId: string; result: Record<string, unknown> };
export interface DesktopBridge {
  getRuntime(): Promise<RuntimeInfo>;
  loadWorkspace(): Promise<Workspace>;
  saveWorkspace(workspace: Workspace): Promise<SaveReceipt>;
  importSource(): Promise<SourceFile | null>;
  pasteImage(): Promise<Extract<OutputItem, { kind: "image" }> | null>;
  checkPython(): Promise<WorkerResult>;
  inspectSnapshot(subjectId: string, programIds: string[]): Promise<WorkerResult>;
}
export const emptyWorkspace = (): Workspace => ({ schemaVersion: 1, subjects: [] });
export function pendingItemCount(workspace: Workspace): number {
  return workspace.subjects.reduce((total, subject) => total + 1 + subject.programs.length, 0);
}

declare global {
  interface Window { recordMaker?: DesktopBridge }
}
