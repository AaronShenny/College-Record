import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { GoogleAccount } from "./google-auth";
import { WorkspaceStore, resolveInside } from "./store";
import { atomicJson, readJson } from "./processing";
import type { CloudStatus } from "../src/lib/workflow-api";

type RemoteFile = { id: string; name: string; mimeType: string; parents?: string[]; appProperties?: Record<string, string> };
type SyncState = { localRevision: string; remoteRevision: string; extraSignature: string; lastSyncAt: string };
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const jsonBytes = (value: unknown) => Buffer.from(JSON.stringify(value));
const FOLDER = "application/vnd.google-apps.folder";
const versionedPath = (relative: string, bytes: Buffer) => {
  const extension = path.posix.extname(relative);
  return `${relative.slice(0, relative.length - extension.length)}.${hash(bytes).slice(0, 24)}${extension}`;
};

export class DriveFiles {
  constructor(private account: GoogleAccount, private abort?: AbortSignal) {}
  async request(endpoint: string, init: RequestInit = {}): Promise<Response> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetch(`https://www.googleapis.com${endpoint}`, {
        ...init, headers: { ...init.headers, Authorization: `Bearer ${await this.account.token()}` },
        signal: this.abort ? AbortSignal.any([this.abort, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
      });
      if (response.ok) return response;
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 750 * 2 ** attempt)); continue;
      }
      throw new Error(response.status === 401 ? "Google authorization expired; reconnect your college account." :
        response.status === 403 ? "Drive denied access. Check granted scopes, college policy and storage quota." :
        `Drive request failed (${response.status}). No sync acknowledgement was recorded; retry when connected.`);
    }
    throw new Error("Drive is temporarily unavailable.");
  }
  async list(q: string) {
    const all: RemoteFile[] = []; let next = "";
    do {
      const response = await this.request("/drive/v3/files?" + new URLSearchParams({ q: `trashed = false and (${q})`,
        fields: "nextPageToken,files(id,name,mimeType,parents,appProperties)", pageSize: "1000", ...(next ? { pageToken: next } : {}) }));
      const result = await response.json(); all.push(...result.files); next = result.nextPageToken || "";
      if (all.length > 50_000) throw new Error("Drive workspace is too large for this release.");
    } while (next);
    return all;
  }
  async root() {
    const roots = await this.list(`mimeType = '${FOLDER}' and appProperties has { key='recordMaker' and value='root-v1' }`);
    if (roots.length > 1) throw new Error("More than one College Record Maker app root was found. Resolve duplicate app folders before syncing; no data was overwritten.");
    if (roots[0]) return roots[0].id;
    const response = await this.request("/drive/v3/files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "College Record Maker", mimeType: FOLDER, appProperties: { recordMaker: "root-v1" } }) });
    return (await response.json()).id as string;
  }
  async createFolder(root: string, parent: string, name: string, key: string) {
    const response = await this.request("/drive/v3/files?fields=id,name,mimeType,parents,appProperties", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent],
        appProperties: { recordMakerRoot: root, recordMakerKey: hash(key) } }) });
    return await response.json() as RemoteFile;
  }
  async upload(root: string, parent: string, name: string, key: string, bytes: Buffer, existing?: RemoteFile) {
    const boundary = `recordmaker${randomUUID().replaceAll("-", "")}`;
    const metadata = { name, ...(!existing ? { parents: [parent] } : {}), appProperties: { recordMakerRoot: root, recordMakerKey: hash(key) } };
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const response = await this.request(`/upload/drive/v3/files${existing ? "/" + existing.id : ""}?uploadType=multipart&fields=id,name,mimeType,parents,appProperties`, {
      method: existing ? "PATCH" : "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: new Uint8Array(body),
    });
    return await response.json() as RemoteFile;
  }
  async bytes(id: string) {
    const response = await this.request(`/drive/v3/files/${encodeURIComponent(id)}?alt=media`);
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > 270 * 1024 * 1024) throw new Error("Drive file exceeds the local size limit.");
    const chunks: Uint8Array[] = []; let length = 0;
    const reader = response.body!.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 270 * 1024 * 1024) throw new Error("Drive file exceeds the local size limit.");
        chunks.push(value);
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    return Buffer.concat(chunks);
  }
}

// Every referenced file is immutable; only app.json is replaced at commit.
// Thus interrupted uploads cannot mix newly uploaded source code with old
// program metadata. Files are normal Drive JSON/assets, not a central DB.
export async function buildRemoteSnapshot(snapshot: string) {
  const files = new Map<string, Buffer>();
  const immutable = (relative: string, bytes: Buffer) => {
    const target = versionedPath(relative, bytes);
    files.set(target, bytes); return target;
  };
  const load = async (relative: string) => JSON.parse(await fs.readFile(resolveInside(snapshot, relative), "utf8"));
  const asset = async (relative: string) => immutable(relative, await fs.readFile(resolveInside(snapshot, relative)));
  const rewriteValues = async (values: Record<string, any> | undefined) => {
    if (values) for (const value of Object.values(values)) if (typeof value === "object" && value?.fileRef) value.fileRef = await asset(value.fileRef);
  };
  const app = await load("app.json");
  for (const subjectRef of app.subjects) {
    const subject = await load(subjectRef.path);
    if (subject.template?.fileRef) subject.template.fileRef = await asset(subject.template.fileRef);
    await rewriteValues(subject.values);
    for (const ref of subject.programs) {
      const program = await load(ref.path);
      for (const source of program.sources) source.fileRef = await asset(source.fileRef);
      for (const item of program.outputs) if (item.fileRef) item.fileRef = await asset(item.fileRef);
      await rewriteValues(program.values);
      ref.path = immutable(ref.path, jsonBytes(program));
    }
    subjectRef.path = immutable(subjectRef.path, jsonBytes(subject));
  }
  return { app, files, immutable };
}

async function extras(root: string) {
  const result: { relative: string; filename: string; signature: string }[] = [];
  for (const dir of ["generated", "imports"]) {
    const base = path.join(root, dir);
    let names: string[];
    try { names = await fs.readdir(base, { recursive: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    for (const name of names.sort()) {
      if (path.basename(name).startsWith("~$") || name.endsWith(".tmp")) continue;
      const filename = path.join(base, name);
      const stat = await fs.stat(filename);
      if (stat.isFile()) result.push({ relative: `${dir}/${name.split(path.sep).join("/")}`, filename, signature: `${dir}/${name}:${stat.size}:${stat.mtimeMs}` });
    }
  }
  return result;
}
export class DriveSync {
  busy = false;
  message?: string;
  private lastFailure = false;
  private controller?: AbortController;
  private finished: Promise<void> = Promise.resolve();
  private markFinished?: () => void;
  constructor(readonly account: GoogleAccount, private store: () => WorkspaceStore) {}
  private async state(): Promise<SyncState | null> { return readJson(path.join(this.store().root, "sync-state.json"), null); }
  async status(): Promise<CloudStatus> {
    const state = await this.state();
    const pointer = await this.store().pointer();
    const signature = hash((await extras(this.store().root)).map(e => e.signature).join("\n"));
    return { connected: !!this.account.identity, configured: this.account.configured,
      account: this.account.identity ? { name: this.account.identity.name, email: this.account.identity.email } : undefined,
      busy: this.busy, state: this.busy ? "syncing" : this.lastFailure ? "error" : state ? "synced" : "local",
      pending: !!pointer && pointer.revisionId !== state?.localRevision || signature !== (state?.extraSignature || hash("")),
      lastSyncAt: state?.lastSyncAt, message: this.message, revision: pointer?.revisionId, syncedRevision: state?.localRevision };
  }
  async pause() { this.controller?.abort(); await this.finished; }
  async sync(): Promise<CloudStatus> {
    if (this.busy) throw new Error("A Drive operation is already running.");
    if (!this.account.identity) throw new Error("Connect your college Google account first.");
    this.busy = true; this.message = "Synchronizing app workspace files…";
    this.controller = new AbortController();
    this.finished = new Promise(resolve => { this.markFinished = resolve; });
    try {
      const api = new DriveFiles(this.account, this.controller.signal);
      const root = await api.root();
      const records = await api.list(`appProperties has { key='recordMakerRoot' and value='${root}' }`);
      const lookup = new Map<string, RemoteFile>();
      for (const record of records) {
        const key = record.appProperties?.recordMakerKey;
        if (key && lookup.has(key)) throw new Error("Drive contains duplicate app file identities. No automatic overwrite policy is applied.");
        if (key) lookup.set(key, record);
      }
      const appRecord = lookup.get(hash("app.json"));
      const remote = appRecord ? JSON.parse((await api.bytes(appRecord.id)).toString("utf8")) : null;
      let previous = await this.state();
      const pointer = await this.store().pointer();
      const localExtras = await extras(this.store().root);
      const signature = hash(localExtras.map(e => e.signature).join("\n"));
      let localDirty = !!pointer && pointer.revisionId !== previous?.localRevision || signature !== (previous?.extraSignature || hash(""));
      if (pointer && remote?.localSnapshot === pointer.revisionId && remote?.revision !== previous?.remoteRevision) {
        // Recover a completed remote commit interrupted before its local ack.
        const currentExtras = [];
        for (const item of localExtras) currentExtras.push({ path: item.relative, ref: versionedPath(item.relative, await fs.readFile(item.filename)) });
        const comparable = (items: any[]) => JSON.stringify([...items].sort((a, b) => a.path.localeCompare(b.path)));
        const extrasMatch = comparable(currentExtras) === comparable(remote.extras || []);
        previous = { localRevision: pointer.revisionId, remoteRevision: remote.revision,
          extraSignature: extrasMatch ? signature : "pending", lastSyncAt: new Date().toISOString() };
        await atomicJson(path.join(this.store().root, "sync-state.json"), previous);
        localDirty = !extrasMatch;
      }
      if (remote?.revision && remote.revision !== previous?.remoteRevision) {
        if (localDirty) throw new Error("Drive changed while this computer had pending edits. V1 supports one active computer; your local edits were preserved. Resolve this before syncing—no version was silently overwritten.");
        await this.download(api, records, root, remote, pointer?.revisionId || null, signature);
      } else if (!pointer && !remote) {
        const receipt = await this.store().save({ schemaVersion: 1, subjects: [] });
        await this.upload(api, lookup, root, receipt.revisionId, previous?.remoteRevision || null);
      } else if (localDirty || !remote) {
        if (!pointer) await this.store().save({ schemaVersion: 1, subjects: [] });
        await this.upload(api, lookup, root, (await this.store().pointer())!.revisionId, previous?.remoteRevision || null);
      }
      this.lastFailure = false; this.message = "Workspace files are saved to your Drive.";
    } catch (error) {
      this.lastFailure = true; this.message = error instanceof Error ? error.message : "Drive synchronization failed.";
      throw error;
    } finally { this.busy = false; this.controller = undefined; this.markFinished?.(); this.markFinished = undefined; }
    return this.status();
  }
  private async upload(api: DriveFiles, lookup: Map<string, RemoteFile>, root: string, _revision: string, expectedRemote: string | null) {
    await this.store().withSnapshot(async snapshot => {
      const revision = path.basename(snapshot);
      const bundle = await buildRemoteSnapshot(snapshot);
      const extraFiles = await extras(this.store().root);
      const signature = hash(extraFiles.map(e => e.signature).join("\n"));
      bundle.app.extras = [];
      for (const item of extraFiles) bundle.app.extras.push({ path: item.relative, ref: bundle.immutable(item.relative, await fs.readFile(item.filename)) });
      const remoteRevision = randomUUID();
      bundle.app.revision = remoteRevision;
      bundle.app.localSnapshot = revision;
      const folders = new Map<string, string>([["", root]]);
      const ensureFolder = async (relative: string): Promise<string> => {
        if (folders.has(relative)) return folders.get(relative)!;
        const parent = path.posix.dirname(relative) === "." ? "" : path.posix.dirname(relative);
        const parentId = await ensureFolder(parent);
        let folder = lookup.get(hash(`folder:${relative}`));
        if (!folder) {
          folder = await api.createFolder(root, parentId, path.posix.basename(relative), `folder:${relative}`);
          lookup.set(hash(`folder:${relative}`), folder);
        }
        folders.set(relative, folder.id); return folder.id;
      };
      for (const [relative, bytes] of bundle.files) {
        if (lookup.has(hash(relative))) continue;
        const parent = path.posix.dirname(relative);
        const file = await api.upload(root, await ensureFolder(parent), path.posix.basename(relative), relative, bytes);
        lookup.set(hash(relative), file);
      }
      // Re-check immediately before publishing the new complete reference graph.
      const appRecord = lookup.get(hash("app.json"));
      const current = appRecord ? JSON.parse((await api.bytes(appRecord.id)).toString("utf8")) : null;
      if ((current?.revision || null) !== expectedRemote) throw new Error("Drive changed during upload. The new file graph was not published; pending local changes remain.");
      await api.upload(root, root, "app.json", "app.json", jsonBytes(bundle.app), appRecord);
      await atomicJson(path.join(this.store().root, "sync-state.json"), { localRevision: revision, remoteRevision, extraSignature: signature, lastSyncAt: new Date().toISOString() });
    });
  }
  private async download(api: DriveFiles, records: RemoteFile[], root: string, manifest: any, expectedLocal: string | null, expectedExtras: string) {
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.subjects) || typeof manifest.revision !== "string") throw new Error("Drive workspace manifest is unsupported; cached data was preserved.");
    const stage = path.join(this.store().root, "downloads", randomUUID());
    const revision = randomUUID();
    const snapshot = path.join(stage, "snapshots", revision);
    const lookup = new Map(records.map(r => [r.appProperties?.recordMakerKey, r]));
    let total = 0;
    const download = async (relative: string, target = relative) => {
      const record = lookup.get(hash(relative));
      if (!record) throw new Error("Drive workspace has a missing referenced file. The local workspace was not replaced.");
      const bytes = await api.bytes(record.id); total += bytes.length;
      if (total > 512 * 1024 * 1024) throw new Error("Drive download exceeds this release's 512 MB workspace limit.");
      const filename = resolveInside(snapshot, target);
      await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, bytes, { flag: "wx" });
      return bytes;
    };
    const values = async (entries: Record<string, any> | undefined) => {
      if (entries) for (const value of Object.values(entries)) if (typeof value === "object" && value?.fileRef) await download(value.fileRef);
    };
    const downloaded = new Set<string>();
    const originalDownload = download;
    // Each source/image is identified by a unique stable UUID; no recursive
    // filesystem extraction or caller-supplied absolute path is permitted.
    try {
      for (const ref of manifest.subjects) {
        const subject = JSON.parse((await originalDownload(ref.path)).toString("utf8"));
        if (subject.template?.fileRef) await download(subject.template.fileRef);
        await values(subject.values);
        for (const programRef of subject.programs) {
          const program = JSON.parse((await download(programRef.path)).toString("utf8"));
          for (const source of program.sources) await download(source.fileRef);
          for (const output of program.outputs) if (output.fileRef) await download(output.fileRef);
          await values(program.values);
        }
      }
      await atomicJson(path.join(snapshot, "app.json"), manifest);
      await atomicJson(path.join(stage, "current.json"), { revisionId: revision, savedAt: new Date().toISOString(), pendingItems: 0 });
      const workspace = await new WorkspaceStore(stage).load(); // Validate before replacement.
      if (((await this.store().pointer())?.revisionId || null) !== expectedLocal ||
          hash((await extras(this.store().root)).map(e => e.signature).join("\n")) !== expectedExtras) {
        throw new Error("Local changes arrived during the Drive download. Cached edits were preserved; retry after saving.");
      }
      for (const extra of manifest.extras || []) {
        if (!/^(generated|imports)\//.test(extra.path) || downloaded.has(extra.path)) throw new Error("Drive has an invalid extra-file reference.");
        downloaded.add(extra.path);
        const bytes = await download(extra.ref, `extras/${extra.path}`);
        const filename = resolveInside(this.store().root, extra.path);
        await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, bytes);
      }
      const pointer = await this.store().pointer();
      const sameWorkspace = pointer && JSON.stringify(await this.store().load()) === JSON.stringify(workspace);
      const receipt = sameWorkspace ? pointer : await this.store().save(workspace);
      const signature = hash((await extras(this.store().root)).map(e => e.signature).join("\n"));
      await atomicJson(path.join(this.store().root, "sync-state.json"), { localRevision: receipt.revisionId, remoteRevision: manifest.revision, extraSignature: signature, lastSyncAt: new Date().toISOString() });
    } finally { await fs.rm(stage, { recursive: true, force: true }); }
  }
}
