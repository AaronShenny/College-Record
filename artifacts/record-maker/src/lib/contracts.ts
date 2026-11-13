import { z } from "zod";

const id = z.string().uuid();
const shortText = z.string().max(500);
export const fieldSchema = z.object({
  id, label: z.string().min(1).max(120), type: z.enum(["text", "image"]),
  scope: z.enum(["subject", "program"]), required: z.boolean(),
}).strict();
export const mappingSchema = z.object({
  field: z.string().min(1).max(120), required: z.boolean(),
  fontFamily: z.string().min(1).max(120).regex(/^[^\x00-\x1f\x7f]+$/, "Enter a font name")
    .refine(value => value.trim().length > 0, "Enter a font name").optional(),
  fontSizePt: z.number().min(1).max(400).multipleOf(0.5).optional(),
  imageFit: z.enum(["width", "box"]).optional(),
  widthCm: z.number().positive().max(50).optional(), heightCm: z.number().positive().max(50).optional(),
}).strict();
export const templateSchema = z.object({
  id, name: z.string().max(200), dataBase64: z.string().max(30_000_000),
  placeholders: z.array(z.string().max(120)).max(300),
  mappings: z.record(mappingSchema), reviewed: z.boolean(), uploadedAt: z.string().datetime(),
}).strict();
const values = z.record(z.string().max(12_000_000)).optional();
export const indexColumnSchema = z.object({
  id, label: z.string().trim().min(1).max(120),
  field: z.string().min(1).max(120),
}).strict();
export const indexSchema = z.object({
  enabled: z.boolean(), title: z.string().max(200),
  columns: z.array(indexColumnSchema).max(12),
}).strict().superRefine((index, ctx) => {
  if (index.enabled && !index.columns.length) ctx.addIssue({ code: "custom", message: "Add an index column or turn the index off." });
  if (new Set(index.columns.map(c => c.id)).size !== index.columns.length) ctx.addIssue({ code: "custom", message: "Index columns must be unique." });
});
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
  values,
  indexValues: z.record(z.string().max(2000)).optional(),
}).strict();
export const subjectSchema = z.object({
  id, name: z.string().trim().min(1).max(150), semester: z.number().int().min(1).max(20),
  courseCode: z.string().max(50), updatedAt: z.string().datetime(), trashedAt: z.string().datetime().nullable(),
  programs: z.array(programSchema).max(500),
  template: templateSchema.nullable().optional(), fields: z.array(fieldSchema).max(100).optional(), values,
  index: indexSchema.optional(),
  setupMappings: z.record(mappingSchema).optional(),
  sourceRoles: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
}).strict().superRefine((subject, ctx) => {
  const numbers = subject.programs.filter(p => !p.trashedAt).map(p => p.number);
  if (new Set(numbers).size !== numbers.length) ctx.addIssue({ code: "custom", message: "Active program numbers must be unique within a subject" });
});
export const workspaceSchema = z.object({
  schemaVersion: z.literal(1), subjects: z.array(subjectSchema).max(100),
}).strict().superRefine((workspace, ctx) => {
  const ids: string[] = [];
  for (const subject of workspace.subjects) {
    ids.push(subject.id, ...(subject.fields || []).map(f => f.id));
    if (subject.template) ids.push(subject.template.id);
    const definitions = new Map((subject.fields || []).map(f => [f.id, f]));
    const checkValues = (values: Record<string, string> | undefined, scope: "subject" | "program") => {
      for (const [key, value] of Object.entries(values || {})) {
        const definition = definitions.get(key);
        if (!definition || definition.scope !== scope) ctx.addIssue({ code: "custom", message: "Custom values must belong to a defined field with the correct scope" });
        if (definition?.type === "image" && value && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) ctx.addIssue({ code: "custom", message: "Custom image field must contain a PNG, JPEG, or WebP image" });
      }
    };
    checkValues(subject.values, "subject");
    for (const program of subject.programs) {
      checkValues(program.values, "program");
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
  workspaceAccount?: string | null;
  workspaceRevision?: string | null;
  mode: "desktop" | "browser-preview"; version: string; platform: string;
  storageLabel: string; driveConnected: boolean; pythonAvailable: boolean | null;
  requiresSignIn?: boolean;
  savedGenerationReservations?: boolean;
  closeSync?: boolean;
};
export type WorkerResult = { jobId: string; result: Record<string, unknown> };
export interface DesktopBridge {
  reportReady?(screen: "dashboard" | "sign-in"): Promise<void>;
  getRuntime(): Promise<RuntimeInfo>;
  loadWorkspace(): Promise<Workspace>;
  saveWorkspace(workspace: Workspace): Promise<SaveReceipt>;
  importSource(): Promise<SourceFile | null>;
  pasteImage(): Promise<Extract<OutputItem, { kind: "image" }> | null>;
  checkPython(): Promise<WorkerResult>;
  inspectSnapshot(subjectId: string, programIds: string[]): Promise<WorkerResult>;
  workflow?(action: string, payload: Record<string, unknown>): Promise<any>;
}
export type TemplateConfig = z.infer<typeof templateSchema>;
export type FieldDefinition = z.infer<typeof fieldSchema>;
export type FieldMapping = z.infer<typeof mappingSchema>;
export const emptyWorkspace = (): Workspace => ({ schemaVersion: 1, subjects: [] });
export function pendingItemCount(workspace: Workspace): number {
  return workspace.subjects.reduce((total, subject) => total + 1 + subject.programs.length, 0);
}

declare global {
  interface Window { recordMaker?: DesktopBridge }
}
