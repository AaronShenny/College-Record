import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { emptyWorkspace, workspaceSchema, type Workspace, type SaveReceipt } from "../src/lib/contracts";

const UUID = /^[a-f0-9-]{36}$/;
const MAX_WORKSPACE_BYTES = 256 * 1024 * 1024;
type Pointer = { revisionId: string; savedAt: string; pendingItems: number };
type Ref = { id: string; path: string };
export function resolveInside(root: string, relative: string): string {
  if (path.isAbsolute(relative)) throw new Error("Absolute workspace paths are not allowed");
  const target = path.resolve(root, relative);
  if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error("Workspace path escapes its root");
  return target;
}
async function writeDurable(filename: string, contents: string | Buffer) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const handle = await fs.open(filename, "wx", 0o600);
  try { await handle.writeFile(contents); await handle.sync(); } finally { await handle.close(); }
}
async function readManaged(root: string, relative: string) {
  const filename = resolveInside(root, relative);
  const realRoot = await fs.realpath(root);
  const realFile = await fs.realpath(filename);
  if (!realFile.startsWith(realRoot + path.sep)) throw new Error("Workspace contains an unsafe file reference");
  return fs.readFile(realFile);
}
const json = (value: unknown) => JSON.stringify(value, null, 2);
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "subject";
export class WorkspaceStore {
  private queue: Promise<unknown> = Promise.resolve();
  private pinned = new Map<string, number>();
  constructor(readonly root: string) {}
  async pointer(): Promise<Pointer | null> {
    try {
      const pointer = JSON.parse(await fs.readFile(path.join(this.root, "current.json"), "utf8")) as Pointer;
      if (!UUID.test(pointer.revisionId) || !Number.isFinite(Date.parse(pointer.savedAt)) || !Number.isInteger(pointer.pendingItems)) throw new Error("Invalid workspace pointer");
      return pointer;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error("The local workspace index could not be read. No files have been reset.", { cause: error });
    }
  }
  async load(): Promise<Workspace> {
    await this.queue;
    const pointer = await this.pointer();
    if (!pointer) return emptyWorkspace();
    const root = path.join(this.root, "snapshots", pointer.revisionId);
    try {
      const app = JSON.parse((await readManaged(root, "app.json")).toString("utf8")) as { schemaVersion: 1; subjects: Ref[] };
      const subjects = [];
      for (const ref of app.subjects) {
        const stored = JSON.parse((await readManaged(root, ref.path)).toString("utf8"));
        if (stored.template?.fileRef) {
          const { fileRef, ...metadata } = stored.template;
          stored.template = { ...metadata, dataBase64: (await readManaged(root, fileRef)).toString("base64") };
        }
        const hydrateValues = async (values: Record<string, any> | undefined) => {
          if (!values) return undefined;
          const result: Record<string, string> = {};
          for (const [key, value] of Object.entries(values)) result[key] = typeof value === "string" ? value :
            `data:${value.mime};base64,${(await readManaged(root, value.fileRef)).toString("base64")}`;
          return result;
        };
        if (stored.values) stored.values = await hydrateValues(stored.values);
        const programs = [];
        for (const programRef of stored.programs as Ref[]) {
          const program = JSON.parse((await readManaged(root, programRef.path)).toString("utf8"));
          if (program.values) program.values = await hydrateValues(program.values);
          const sources = [];
          for (const source of program.sources) {
            const { fileRef, ...metadata } = source;
            sources.push({ ...metadata, code: (await readManaged(root, fileRef)).toString("utf8") });
          }
          const outputs = [];
          for (const item of program.outputs) {
            if (item.kind === "image") {
              const { fileRef, mime, ...metadata } = item;
              const image = await readManaged(root, fileRef);
              outputs.push({ ...metadata, dataUrl: `data:${mime};base64,${image.toString("base64")}` });
            } else outputs.push(item);
          }
          programs.push({ ...program, sources, outputs });
        }
        subjects.push({ ...stored, programs });
      }
      return workspaceSchema.parse({ schemaVersion: app.schemaVersion, subjects });
    } catch (error) {
      throw new Error("The local workspace is incomplete or invalid. Existing files were preserved; do not overwrite them with an empty workspace.", { cause: error });
    }
  }
  save(input: Workspace): Promise<SaveReceipt> {
    const workspace = workspaceSchema.parse(input);
    if (Buffer.byteLength(JSON.stringify(workspace)) > MAX_WORKSPACE_BYTES) return Promise.reject(new Error("This workspace exceeds the 256 MB local-save limit."));
    const operation = this.queue.then(() => this.commit(workspace));
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  private async commit(workspace: Workspace): Promise<SaveReceipt> {
    await fs.mkdir(path.join(this.root, "snapshots"), { recursive: true });
    const revisionId = randomUUID();
    const root = path.join(this.root, "snapshots", revisionId);
    const asset = async (relative: string, bytes: string | Buffer) => {
      const hash = createHash("sha256").update(bytes).digest("hex");
      const pooled = path.join(this.root, "_assets", hash);
      try { await writeDurable(pooled, bytes); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      const target = resolveInside(root, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      try { await fs.link(pooled, target); } catch { await fs.copyFile(pooled, target, fs.constants.COPYFILE_EXCL); }
    };
    const persistValues = async (values: Record<string, string> | undefined, folder: string) => {
      if (!values) return undefined;
      const stored: Record<string, any> = {};
      for (const [key, value] of Object.entries(values)) {
        if (value.startsWith("data:image/")) {
          const mime = value.slice(5, value.indexOf(";"));
          const fileRef = `${folder}/custom/${key}.${mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png"}`;
          await asset(fileRef, Buffer.from(value.split(",")[1]!, "base64"));
          stored[key] = { mime, fileRef };
        } else stored[key] = value;
      }
      return stored;
    };
    const subjectRefs: Ref[] = [];
    const pending: Array<{ id: string; kind: "subject" | "program"; operation: "upsert" | "trash" }> = [];
    for (const subject of workspace.subjects) {
      const folder = subject.trashedAt
        ? `_trash/subjects/${subject.id}`
        : `semester-${String(subject.semester).padStart(2, "0")}/${slug(subject.name)}-${subject.id}`;
      const subjectFile = `${folder}/subject.json`;
      subjectRefs.push({ id: subject.id, path: subjectFile });
      pending.push({ id: subject.id, kind: "subject", operation: subject.trashedAt ? "trash" : "upsert" });
      const programRefs: Ref[] = [];
      for (const program of subject.programs) {
        const programFolder = program.trashedAt ? `${folder}/_trash/program-${program.id}` : `${folder}/programs/program-${program.id}`;
        const programFile = `${programFolder}/program.json`;
        programRefs.push({ id: program.id, path: programFile });
        pending.push({ id: program.id, kind: "program", operation: program.trashedAt ? "trash" : "upsert" });
        const sources = [];
        for (const source of program.sources) {
          const { code, ...metadata } = source;
          // ID-based disk names avoid Windows reserved names and duplicate filenames.
          const extension = path.extname(source.name).replace(/[^a-zA-Z0-9.]/g, "").slice(0, 12);
          const fileRef = `${programFolder}/sources/${source.id}${extension}`;
          await asset(fileRef, code);
          sources.push({ ...metadata, fileRef });
        }
        const outputs = [];
        for (const item of program.outputs) {
          if (item.kind === "text") { outputs.push(item); continue; }
          const { dataUrl, ...metadata } = item;
          const comma = dataUrl.indexOf(",");
          const mime = dataUrl.slice(5, dataUrl.indexOf(";"));
          const image = Buffer.from(dataUrl.slice(comma + 1), "base64");
          if (image.length === 0 || image.length > 9 * 1024 * 1024) throw new Error("Output image is empty or larger than 9 MB");
          const extension = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
          const fileRef = `${programFolder}/images/${item.id}.${extension}`;
          await asset(fileRef, image);
          outputs.push({ ...metadata, fileRef, mime });
        }
        await writeDurable(resolveInside(root, programFile), json({ ...program, sources, outputs, values: await persistValues(program.values, programFolder) }));
      }
      let template = subject.template;
      let storedTemplate: any = template;
      if (template) {
        const { dataBase64, ...metadata } = template;
        const fileRef = `${folder}/templates/${template.id}.docx`;
        await asset(fileRef, Buffer.from(dataBase64, "base64"));
        storedTemplate = { ...metadata, fileRef };
      }
      await writeDurable(resolveInside(root, subjectFile), json({ ...subject, programs: programRefs, template: storedTemplate, values: await persistValues(subject.values, folder) }));
    }
    await writeDurable(resolveInside(root, "app.json"), json({ schemaVersion: 1, subjects: subjectRefs }));
    await writeDurable(resolveInside(root, "_local/pending.json"), json({ driveConnected: false, items: pending }));
    const receipt: SaveReceipt = { revisionId, savedAt: new Date().toISOString(), pendingItems: pending.length, storage: "filesystem" };
    const temporaryPointer = path.join(this.root, `.current-${revisionId}.json`);
    await writeDurable(temporaryPointer, json(receipt));
    // Commit last: interruption before this rename leaves the previous complete
    // snapshot active. Old snapshots are local crash/job material, not Git history.
    await fs.rename(temporaryPointer, path.join(this.root, "current.json"));
    await this.collectSnapshots(revisionId);
    return receipt;
  }
  private async collectSnapshots(current: string) {
    // Reclaim superseded cache snapshots. Active background jobs pin their
    // snapshot until completion, so cleanup never changes a running job's data.
    const entries = await fs.readdir(path.join(this.root, "snapshots"));
    for (const entry of entries) {
      if (UUID.test(entry) && entry !== current && !this.pinned.has(entry)) {
        await fs.rm(path.join(this.root, "snapshots", entry), { recursive: true, force: true }).catch(() => undefined);
      }
    }
    const pool = path.join(this.root, "_assets");
    for (const name of await fs.readdir(pool).catch(() => [] as string[])) {
      const filename = path.join(pool, name);
      const stat = await fs.stat(filename).catch(() => null);
      // At least one live or job-pinned snapshot hardlink protects each asset.
      if (/^[a-f0-9]{64}$/.test(name) && stat?.nlink === 1) await fs.unlink(filename).catch(() => undefined);
    }
  }
  async snapshotPath(): Promise<string> {
    await this.queue;
    const pointer = await this.pointer();
    if (!pointer) throw new Error("Save a subject before inspecting a snapshot");
    return path.join(this.root, "snapshots", pointer.revisionId);
  }
  async withSnapshot<T>(job: (snapshot: string) => Promise<T>): Promise<T> {
    const capture = this.queue.then(async () => {
      const pointer = await this.pointer();
      if (!pointer) throw new Error("Save a subject before inspecting a snapshot");
      this.pinned.set(pointer.revisionId, (this.pinned.get(pointer.revisionId) || 0) + 1);
      return pointer.revisionId;
    });
    this.queue = capture.catch(() => undefined);
    const revisionId = await capture;
    try { return await job(path.join(this.root, "snapshots", revisionId)); }
    finally {
      const remaining = (this.pinned.get(revisionId) || 1) - 1;
      if (remaining) this.pinned.set(revisionId, remaining); else this.pinned.delete(revisionId);
      const cleanup = this.queue.then(async () => {
        const pointer = await this.pointer();
        if (pointer) await this.collectSnapshots(pointer.revisionId);
      });
      this.queue = cleanup.catch(() => undefined);
      await this.queue;
    }
  }
}
