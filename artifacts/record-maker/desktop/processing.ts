import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PythonWorker } from "./worker-client";
import { resolveInside } from "./store";
import { workspaceSchema } from "../src/lib/contracts";
import type { DocumentFile } from "../src/lib/workflow-api";

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
  private writes: Promise<unknown> = Promise.resolve();
  constructor(readonly root: string, private worker: PythonWorker) {}
  async list(): Promise<DocumentFile[]> {
    await this.writes;
    return readJson(path.join(this.root, "generated", "index.json"), []);
  }
  async file(id: string) {
    z.string().uuid().parse(id);
    const item = (await this.list()).find(d => d.id === id);
    if (!item) throw new Error("Generated document was not found in this account.");
    return { item, filename: resolveInside(this.root, `generated/${item.id}/${path.basename(item.name)}`) };
  }
  async run(action: string, payload: Record<string, any>) {
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
        const archive = path.join(this.root, "imports", randomUUID());
        await fs.mkdir(archive, { recursive: true });
        const name = path.basename(String(payload.name)).replace(/[<>:"|?*\x00-\x1f]/g, "_");
        await fs.writeFile(path.join(archive, name), Buffer.from(payload.dataBase64, "base64"), { flag: "wx", mode: 0o600 });
        await atomicJson(path.join(archive, "import.json"), { name, subjectId: payload.subjectId || null, importedAt: new Date().toISOString() });
      }
      return result;
    } finally {
      this.busy--;
      await fs.rm(folder, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  private async keep(documents: DocumentFile[]) {
    for (const doc of documents) {
      z.string().uuid().parse(doc.id);
      if (!doc.dataBase64 || !["docx", "pdf"].includes(doc.format) || !doc.name.endsWith(`.${doc.format}`) || path.basename(doc.name) !== doc.name) throw new Error("Document worker returned invalid file metadata");
      const filename = resolveInside(this.root, `generated/${doc.id}/${doc.name}`);
      await fs.mkdir(path.dirname(filename), { recursive: true });
      await fs.writeFile(filename, Buffer.from(doc.dataBase64, "base64"), { flag: "wx", mode: 0o600 });
      delete doc.dataBase64;
    }
    const update = this.writes.then(async () => {
      const docs = await readJson<DocumentFile[]>(path.join(this.root, "generated/index.json"), []);
      await atomicJson(path.join(this.root, "generated/index.json"), [...docs, ...documents]);
    });
    this.writes = update.catch(() => undefined);
    await update;
  }
}
