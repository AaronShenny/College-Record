import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PythonWorker } from "./worker-client";
import { resolveInside, WorkspaceStore } from "./store";
import { workspaceSchema } from "../src/lib/contracts";
import type { DocumentFile } from "../src/lib/workflow-api";
import { localTransaction } from "./local-transaction";

export async function atomicJson(filename: string, value: unknown) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temp = `${filename}.${randomUUID()}.tmp`;
  const handle = await fs.open(temp, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
  await fs.rename(temp, filename);
}
export async function readJson<T>(filename: string, missing: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(filename, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return missing; throw new Error("Saved app metadata could not be read; existing files were preserved."); }
}
export class DocumentService {
  busy = 0;
  private reservations = new Map<string, { workspace: ReturnType<typeof workspaceSchema.parse>; release: () => Promise<void>; timer: NodeJS.Timeout }>();
  constructor(readonly root: string, private worker: PythonWorker, private store = new WorkspaceStore(root)) {}
  async prepareGeneration(input: unknown, expectedRevision: string | null) {
    const workspace = workspaceSchema.parse(input);
    return localTransaction(this.root, async () => {
      if (this.busy || this.reservations.size) throw new Error("Finish the existing generation request before preparing another.");
      const pointer = await this.store.pointer();
      if ((pointer?.revisionId ?? null) !== expectedRevision) throw new Error("The saved generation revision changed. Reload before generating.");
      const unchanged = pointer && JSON.stringify(await this.store.load()) === JSON.stringify(workspace);
      const receipt = unchanged ? { ...pointer, storage: "filesystem" as const } : await this.store.save(workspace, expectedRevision);
      let acquired!: () => void, rejected!: (error: unknown) => void, finish!: () => void;
      const ready = new Promise<void>((resolve, reject) => { acquired = resolve; rejected = reject; });
      const ended = new Promise<void>(resolve => { finish = resolve; });
      const lifetime = this.store.withSnapshot(async () => { acquired(); await ended; }, true, receipt.revisionId);
      void lifetime.catch(rejected);
      await ready;
      const generationToken = randomUUID();
      const release = async () => { finish(); await lifetime; };
      const timer = setTimeout(() => { this.reservations.delete(generationToken); void release().catch(() => undefined); }, 60_000).unref();
      this.reservations.set(generationToken, { workspace, release, timer });
      return { receipt, generationToken };
    });
  }
  async list(): Promise<DocumentFile[]> {
    return localTransaction(this.root, () => readJson(path.join(this.root, "generated", "index.json"), []));
  }
  async file(id: string) {
    z.string().uuid().parse(id);
    const item = (await this.list()).find(d => d.id === id);
    if (!item) throw new Error("Generated document was not found in this account.");
    return { item, filename: resolveInside(this.root, `generated/${item.id}/${path.basename(item.name)}`) };
  }
  async run(action: string, payload: Record<string, any>) {
    if (action !== "generate") return this.runJob(action, payload);
    if (!payload.generationToken) {
      // Compatibility for the preserved Electron adapter: generation is still
      // rejected unless its exact selected content is already saved.
      const prepared = await localTransaction(this.root, async () => {
        const loaded = await this.store.loadWithRevision();
        if (!loaded.revisionId) throw new Error("Save successfully before generating.");
        const selected = new Set<string>(payload.programIds);
        const projection = { ...loaded.workspace, subjects: loaded.workspace.subjects.filter(s => s.id === payload.subjectId)
          .map(s => ({ ...s, programs: s.programs.filter(p => selected.has(p.id)) })) };
        if (JSON.stringify(projection) !== JSON.stringify(workspaceSchema.parse(payload.workspace))) {
          throw new Error("Requested content has not been saved. Save successfully before generating.");
        }
        return this.prepareGeneration(loaded.workspace, loaded.revisionId);
      });
      payload = { ...payload, generationToken: prepared.generationToken };
    }
    const token = z.string().uuid().parse(payload.generationToken);
    const reserved = this.reservations.get(token);
    if (!reserved) throw new Error("The saved generation snapshot expired or belongs to another account. Save and generate again.");
    this.reservations.delete(token); clearTimeout(reserved.timer);
    try {
      const selected = new Set<string>(z.array(z.string().uuid()).min(1).max(500).parse(payload.programIds));
      const subject = reserved.workspace.subjects.find(s => s.id === payload.subjectId && !s.trashedAt);
      if (!subject || [...selected].some(id => !subject.programs.some(p => p.id === id && !p.trashedAt))) throw new Error("The saved generation selection is invalid.");
      const workspace = { ...reserved.workspace, subjects: [{ ...subject, programs: subject.programs.filter(p => selected.has(p.id)) }] };
      return await this.runJob(action, { ...payload, workspace });
    } finally { await reserved.release(); }
  }
  private async runJob(action: string, payload: Record<string, any>) {
    if (!["inspect-template", "import-questions", "generate", "export-pdf", "open-word"].includes(action)) throw new Error("Unsupported document job");
    const requestedPdf = action === "generate" && payload.pdf === true;
    if (action === "generate") {
      payload = { ...payload, workspace: workspaceSchema.parse(payload.workspace) };
      z.string().uuid().parse(payload.subjectId);
      z.array(z.string().uuid()).min(1).max(500).parse(payload.programIds);
      z.enum(["combined", "individual"]).parse(payload.mode);
      z.boolean().parse(payload.pdf);
      // Commit DOCX first. Office must never hold an already generated document
      // hostage while starting, showing activation prompts or exporting PDF.
      payload = { ...payload, pdf: false };
    }
    if (action === "open-word") {
      const { filename } = await this.file(payload.id);
      payload = { filename };
    }
    if (action === "export-pdf") {
      const { item, filename } = await this.file(payload.id);
      if (item.format !== "docx") throw new Error("Choose a saved DOCX document to export.");
      payload = { filename, record: item };
    }
    this.busy++;
    const folder = path.join(this.root, "jobs", randomUUID());
    try {
      const requestPath = path.join(folder, "request.json");
      await atomicJson(requestPath, { action, payload });
      await this.worker.request("workflow", { requestPath }, action === "export-pdf" ? 45_000 : 600_000);
      const result: any = JSON.parse(await fs.readFile(path.join(folder, "result.json"), "utf8"));
      if (action === "export-pdf") await this.keep(result.documents);
      if (action === "generate") {
        await this.keep(result.documents);
        let officeFailure: string | undefined;
        if (requestedPdf) for (const doc of [...result.documents] as DocumentFile[]) {
          if (officeFailure) {
            result.failures.push({ number: null, message: "PDF skipped after the first Microsoft Word failure. All DOCX files were retained. Fix Word and retry PDF export." });
            continue;
          }
          try {
            const { filename } = await this.file(doc.id);
            const pdfRequest = path.join(folder, "pdf-request.json");
            await atomicJson(pdfRequest, { action: "export-pdf", payload: { filename, record: doc } });
            await this.worker.request("workflow", { requestPath: pdfRequest }, 45_000);
            const pdf = JSON.parse(await fs.readFile(path.join(folder, "result.json"), "utf8"));
            await this.keep(pdf.documents);
            result.documents.push(...pdf.documents);
          } catch (error) {
            officeFailure = error instanceof Error ? error.message : "Microsoft Word PDF export failed.";
            result.failures.push({ number: null, message: officeFailure });
          }
        }
      }
      if (action === "import-questions") {
        await localTransaction(this.root, async () => {
        const archive = path.join(this.root, "imports", randomUUID());
        await fs.mkdir(archive, { recursive: true });
        const name = path.basename(String(payload.name)).replace(/[<>:"|?*\x00-\x1f]/g, "_");
        await fs.writeFile(path.join(archive, name), Buffer.from(payload.dataBase64, "base64"), { flag: "wx", mode: 0o600 });
        await atomicJson(path.join(archive, "import.json"), { name, subjectId: payload.subjectId || null, importedAt: new Date().toISOString() });
        });
      }
      return result;
    } finally {
      this.busy--;
      await fs.rm(folder, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  private async keep(documents: DocumentFile[]) {
    await localTransaction(this.root, async () => {
    for (const doc of documents) {
      z.string().uuid().parse(doc.id);
      if (!doc.dataBase64 || !["docx", "pdf"].includes(doc.format) || !doc.name.endsWith(`.${doc.format}`) || path.basename(doc.name) !== doc.name) throw new Error("Document worker returned invalid file metadata");
      const filename = resolveInside(this.root, `generated/${doc.id}/${doc.name}`);
      await fs.mkdir(path.dirname(filename), { recursive: true });
      await fs.writeFile(filename, Buffer.from(doc.dataBase64, "base64"), { flag: "wx", mode: 0o600 });
      delete doc.dataBase64;
    }
      const docs = await readJson<DocumentFile[]>(path.join(this.root, "generated/index.json"), []);
      await atomicJson(path.join(this.root, "generated/index.json"), [...docs, ...documents]);
    });
  }
}
