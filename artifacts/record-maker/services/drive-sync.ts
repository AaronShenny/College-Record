import { promises as fs } from "node:fs";
import path from "node:path";
import { mapConcurrent } from "./concurrency";
import { createHash, randomUUID } from "node:crypto";
import { GoogleAccount } from "./google-auth";
import { WorkspaceStore, resolveInside } from "./store";
import { atomicJson, readJson } from "./processing";
import type { CloudStatus, ConflictReview } from "../src/lib/workflow-api";
import { localTransaction, activateIncoming } from "./local-transaction";
import { validateIncomingInventory } from "./download-inventory";

type RemoteFile = { id: string; name: string; mimeType: string; parents?: string[]; appProperties?: Record<string, string> };
type SyncState = { localRevision: string; remoteRevision: string; extraSignature: string; lastSyncAt: string };
type DriveAccount = Pick<GoogleAccount, "identity" | "configured" | "token">;
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const jsonBytes = (value: unknown) => Buffer.from(JSON.stringify(value));
const FOLDER = "application/vnd.google-apps.folder";
const versionedPath = (relative: string, bytes: Buffer) => {
  const extension = path.posix.extname(relative);
  return `${relative.slice(0, relative.length - extension.length)}.${hash(bytes).slice(0, 24)}${extension}`;
};

export class DriveFiles {
  private etags = new Map<string, string>();
  hasConditionalUpdate(id: string) { return this.etags.has(id); }
  constructor(private account: DriveAccount, private abort?: AbortSignal,
    private diagnostic: (details: Record<string, unknown>) => void = () => undefined) {}
  async request(endpoint: string, init: RequestInit = {}): Promise<Response> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const started = performance.now();
      let response: Response;
      try {
        response = await fetch(`https://www.googleapis.com${endpoint}`, {
          ...init, headers: { ...init.headers, Authorization: `Bearer ${await this.account.token()}` },
          signal: this.abort ? AbortSignal.any([this.abort, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
        });
      } catch (error) {
        this.diagnostic({ method: init.method || "GET", attempt: attempt + 1, httpStatus: 0, ok: false,
          durationMs: Math.round(performance.now() - started), error: error instanceof Error ? error.message : "" });
        throw error;
      }
      // No endpoint, query, headers, body, Drive IDs or remote filenames.
      this.diagnostic({ method: init.method || "GET", attempt: attempt + 1, httpStatus: response.status, ok: response.ok,
        durationMs: Math.round(performance.now() - started) });
      if (response.ok) return response;
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 750 * 2 ** attempt)); continue;
      }
      throw new Error(response.status === 412 ? "Drive changed during upload. Review or retry; no newer index was overwritten." :
        response.status === 401 ? "Google authorization expired; reconnect your college account." :
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
    if (roots.length > 1) throw new Error("More than one Recordly/legacy College Record Maker app root was found. Resolve duplicate app folders before syncing; no data was overwritten.");
    if (roots[0]) return roots[0].id;
    const response = await this.request("/drive/v3/files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Recordly", mimeType: FOLDER, appProperties: { recordMaker: "root-v1" } }) });
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
      method: existing ? "PATCH" : "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}`,
        ...(existing && this.etags.has(existing.id) ? { "If-Match": this.etags.get(existing.id)! } : {}) }, body: new Uint8Array(body),
    });
    return await response.json() as RemoteFile;
  }
  async bytes(id: string) {
    const response = await this.request(`/drive/v3/files/${encodeURIComponent(id)}?alt=media`);
    const etag = response.headers.get("etag");
    if (etag) this.etags.set(id, etag);
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
      const stat = await fs.lstat(filename);
      if (stat.isSymbolicLink()) throw new Error("The local inventory contains a linked file. Originals were preserved.");
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
  private extrasCache?: { root: string; signature: string; until: number };
  private extrasScan?: { root: string; promise: Promise<string> };
  private statusEpoch = 0;
  private conflicted = false;
  private review?: { token: string; root: string; account: string; local: string | null; extras: string; remote: string; expires: number };
  constructor(readonly account: DriveAccount, private store: () => WorkspaceStore,
    private diagnostic: (details: Record<string, unknown>) => void = () => undefined) {}
  invalidateStatus() { this.extrasCache = undefined; this.statusEpoch++; }
  private async extrasSignature() {
    const root = this.store().root;
    if (this.extrasCache?.root === root && this.extrasCache.until > Date.now()) return this.extrasCache.signature;
    if (this.extrasScan?.root === root) return this.extrasScan.promise;
    const epoch = this.statusEpoch;
    const promise = extras(root).then(files => {
      const signature = hash(files.map(e => e.signature).join("\n"));
      if (epoch === this.statusEpoch) this.extrasCache = { root, signature, until: Date.now() + 15_000 };
      return signature;
    });
    this.extrasScan = { root, promise };
    try { return await promise; }
    finally { if (this.extrasScan?.promise === promise) this.extrasScan = undefined; }
  }
  private async state(): Promise<SyncState | null> { return readJson(path.join(this.store().root, "sync-state.json"), null); }
  async status(): Promise<CloudStatus> {
    return localTransaction(this.store().root, async () => {
    const state = await this.state();
    const pointer = await this.store().pointer();
    const signature = await this.extrasSignature();
    return { connected: !!this.account.identity, configured: this.account.configured,
      account: this.account.identity ? { name: this.account.identity.name, email: this.account.identity.email } : undefined,
      busy: this.busy, state: this.busy ? "syncing" : this.conflicted ? "conflict" : this.lastFailure ? "error" : state ? "synced" : "local",
      pending: !!pointer && pointer.revisionId !== state?.localRevision || signature !== (state?.extraSignature || hash("")),
      lastSyncAt: state?.lastSyncAt, message: this.message, revision: pointer?.revisionId, syncedRevision: state?.localRevision };
    });
  }
  async pause() { this.controller?.abort(); await this.finished; }
  async reviewConflict(): Promise<ConflictReview> {
    if (this.busy || !this.account.identity) throw new Error("Wait for synchronization and connect the correct account before reviewing.");
    const api = new DriveFiles(this.account);
    const root = await api.root();
    const records = await api.list(`appProperties has { key='recordMakerRoot' and value='${root}' }`);
    const manifests = records.filter(r => r.appProperties?.recordMakerKey === hash("app.json"));
    if (manifests.length !== 1) throw new Error("The Drive workspace does not have one valid index to review.");
    const remote = JSON.parse((await api.bytes(manifests[0]!.id)).toString());
    if (remote.schemaVersion !== 1 || typeof remote.revision !== "string" || !Array.isArray(remote.subjects)) throw new Error("Drive index is invalid; nothing was replaced.");
    return localTransaction(this.store().root, async () => {
      const pointer = await this.store().pointer();
      const state = await this.state();
      const signature = hash((await extras(this.store().root)).map(e => e.signature).join("\n"));
      if (state?.remoteRevision === remote.revision) throw new Error("Drive no longer conflicts. Retry ordinary synchronization.");
      this.review = { token: randomUUID(), root: this.store().root, account: this.account.identity!.sub,
        local: pointer?.revisionId ?? null, extras: signature, remote: remote.revision, expires: Date.now() + 300_000 };
      return { token: this.review.token, scope: "workspace", account: this.account.identity!.email,
        localSavedAt: pointer?.savedAt, remoteSavedAt: remote.savedAt,
        localSubjects: (await this.store().load()).subjects.length, remoteSubjects: remote.subjects.length };
    });
  }
  async resolveConflict(token: string, choice: "local" | "drive") {
    const review = this.review;
    this.review = undefined; // one-use, account-bound review
    if (!review || review.token !== token || review.expires < Date.now() || review.account !== this.account.identity?.sub ||
        review.root !== this.store().root || !["local", "drive"].includes(choice)) throw new Error("Conflict review expired or changed. Review both copies again.");
    return this.sync({ review, choice });
  }
  async sync(force?: { review: NonNullable<DriveSync["review"]>; choice: "local" | "drive" }): Promise<CloudStatus> {
    if (this.busy) throw new Error("A Drive operation is already running.");
    if (!this.account.identity) throw new Error("Connect your college Google account first.");
    this.busy = true; this.conflicted = false; this.message = "Synchronizing app workspace files…";
    this.controller = new AbortController();
    this.finished = new Promise(resolve => { this.markFinished = resolve; });
    try {
      const api = new DriveFiles(this.account, this.controller.signal, this.diagnostic);
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
      if (force) {
        const reviewed = force.review;
        if (reviewed.remote !== remote?.revision || reviewed.local !== (pointer?.revisionId ?? null) || reviewed.extras !== signature) {
          throw new Error("Local or Drive changed since your conflict review. Nothing was replaced; review again.");
        }
        if (force.choice === "local") {
          if (!pointer) throw new Error("There is no saved local workspace to upload.");
          await this.upload(api, lookup, root, pointer.revisionId, reviewed.remote, signature);
        } else {
          await this.download(api, records, root, remote, pointer?.revisionId ?? null, signature, true);
        }
        this.conflicted = false; this.lastFailure = false; this.message = "The confirmed workspace version is saved to Drive and this computer.";
        this.invalidateStatus();
        return { ...await this.status(), busy: false, state: "synced" };
      }
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
        // Old releases could leave remote extras in live storage on a failed
        // download. It is safe to retry only when *every* current extra already
        // has exactly the incoming content-addressed identity, and the editable
        // revision is still acknowledged. Never infer this from filenames alone.
        if (localDirty && (!pointer || pointer.revisionId === previous?.localRevision) && Array.isArray(remote.extras)) {
          const verifiedPartial = await localTransaction(this.store().root, async () => {
            if (((await this.store().pointer())?.revisionId ?? null) !== (pointer?.revisionId ?? null)) return false;
            const current = await extras(this.store().root);
            if (hash(current.map(e => e.signature).join("\n")) !== signature) return false;
            for (const item of current) {
              const ref = remote.extras.find((e: any) => e.path === item.relative)?.ref;
              if (ref !== versionedPath(item.relative, await fs.readFile(item.filename))) return false;
            }
            return true;
          });
          if (verifiedPartial) localDirty = false;
        }
        if (localDirty) {
          this.conflicted = true;
          throw new Error("Drive changed while this computer had pending edits or uncertain files from an older failed download. Local files and Drive originals were preserved. Review the conflict and explicitly choose which whole workspace to keep.");
        }
        await this.download(api, records, root, remote, pointer?.revisionId || null, signature);
      } else if (!pointer && !remote) {
        const receipt = await this.store().save({ schemaVersion: 1, subjects: [] });
        await this.upload(api, lookup, root, receipt.revisionId, previous?.remoteRevision || null);
      } else if (localDirty || !remote) {
        if (!pointer) await this.store().save({ schemaVersion: 1, subjects: [] });
        await this.upload(api, lookup, root, (await this.store().pointer())!.revisionId, previous?.remoteRevision || null);
      }
      this.conflicted = false; this.lastFailure = false; this.message = "Workspace files are saved to your Drive.";
    } catch (error) {
      if (error instanceof Error && /Drive changed|changed since.*review|Local changed since|safe conditional update/i.test(error.message)) this.conflicted = true;
      this.lastFailure = true; this.message = error instanceof Error ? error.message : "Drive synchronization failed.";
      throw error;
    } finally { this.invalidateStatus(); this.busy = false; this.controller = undefined; this.markFinished?.(); this.markFinished = undefined; }
    return this.status();
  }
  private async upload(api: DriveFiles, lookup: Map<string, RemoteFile>, root: string, _revision: string, expectedRemote: string | null, reviewedExtras?: string) {
    await this.store().withSnapshot(async snapshot => {
      const revision = path.basename(snapshot);
      const { bundle, signature } = await localTransaction(this.store().root, async () => {
        const bundle = await buildRemoteSnapshot(snapshot);
        const extraFiles = await extras(this.store().root);
        const signature = hash(extraFiles.map(e => e.signature).join("\n"));
        bundle.app.extras = [];
        for (const item of extraFiles) bundle.app.extras.push({ path: item.relative, ref: bundle.immutable(item.relative, await fs.readFile(item.filename)) });
        return { bundle, signature };
      });
      const remoteRevision = randomUUID();
      bundle.app.revision = remoteRevision;
      bundle.app.localSnapshot = revision;
      bundle.app.savedAt = new Date().toISOString();
      const folders = new Map<string, string>([["", root]]);
      const pendingFolders = new Map<string, Promise<string>>();
      const ensureFolder = async (relative: string): Promise<string> => {
        if (folders.has(relative)) return folders.get(relative)!;
        if (pendingFolders.has(relative)) return pendingFolders.get(relative)!;
        const creating = (async () => {
        const parent = path.posix.dirname(relative) === "." ? "" : path.posix.dirname(relative);
        const parentId = await ensureFolder(parent);
        let folder = lookup.get(hash(`folder:${relative}`));
        if (!folder) {
          folder = await api.createFolder(root, parentId, path.posix.basename(relative), `folder:${relative}`);
          lookup.set(hash(`folder:${relative}`), folder);
        }
        folders.set(relative, folder.id); return folder.id;
        })();
        pendingFolders.set(relative, creating);
        try { return await creating; } finally { pendingFolders.delete(relative); }
      };
      await mapConcurrent([...bundle.files].filter(([relative]) => !lookup.has(hash(relative))), async ([relative, bytes]) => {
        const parent = path.posix.dirname(relative);
        const file = await api.upload(root, await ensureFolder(parent), path.posix.basename(relative), relative, bytes);
        lookup.set(hash(relative), file);
      });
      // Re-check immediately before publishing the new complete reference graph.
      const appRecord = lookup.get(hash("app.json"));
      const current = appRecord ? JSON.parse((await api.bytes(appRecord.id)).toString("utf8")) : null;
      if ((current?.revision || null) !== expectedRemote) throw new Error("Drive changed during upload. The new file graph was not published; pending local changes remain.");
      if (reviewedExtras !== undefined && appRecord && !api.hasConditionalUpdate(appRecord.id)) {
        throw new Error("Drive did not provide a safe conditional update for this conflict. Nothing was replaced; review again when the connection supports it.");
      }
      if (reviewedExtras !== undefined) await localTransaction(this.store().root, async () => {
        if ((await this.store().pointer())?.revisionId !== _revision ||
            hash((await extras(this.store().root)).map(e => e.signature).join("\n")) !== reviewedExtras) throw new Error("Local changed since conflict review. Review again; Drive was not replaced.");
      });
      await api.upload(root, root, "app.json", "app.json", jsonBytes(bundle.app), appRecord);
      await atomicJson(path.join(this.store().root, "sync-state.json"), { localRevision: revision, remoteRevision, extraSignature: signature, lastSyncAt: new Date().toISOString() });
    }, true, _revision);
  }
  private async download(api: DriveFiles, records: RemoteFile[], root: string, manifest: any, expectedLocal: string | null, expectedExtras: string, replace = false) {
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
      const digest = /\.([a-f0-9]{24})(?:\.[^/.]+)?$/.exec(relative)?.[1];
      if (digest && hash(bytes).slice(0, 24) !== digest) throw new Error("Drive file content does not match its immutable reference. Cached data was preserved.");
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
      for (const extra of manifest.extras || []) {
        if (typeof extra.path !== "string" || !/^(generated|imports)\//.test(extra.path) ||
            extra.path.includes("\\") || extra.path.includes(":") || path.posix.normalize(extra.path) !== extra.path ||
            extra.path.split("/").includes("..") || downloaded.has(extra.path)) throw new Error("Drive has an invalid extra-file reference.");
        downloaded.add(extra.path);
        const bytes = await download(extra.ref, `extras/${extra.path}`);
        if (extra.ref !== versionedPath(extra.path, bytes)) throw new Error("Drive has an invalid immutable extra-file identity. Cached data was preserved.");
      }
      const store = this.store();
      const currentIndex = records.find(r => r.appProperties?.recordMakerKey === hash("app.json"));
      if (!currentIndex || JSON.parse((await api.bytes(currentIndex.id)).toString()).revision !== manifest.revision) throw new Error("Drive changed during download. Review or retry; local data was preserved.");
      await localTransaction(store.root, async () => {
        const unchanged = async () => {
          this.controller?.signal.throwIfAborted();
          if (((await store.pointer())?.revisionId ?? null) !== expectedLocal ||
              hash((await extras(store.root)).map(e => e.signature).join("\n")) !== expectedExtras) {
            throw new Error("Local changes arrived during the Drive download. Cached edits were preserved; retry after saving.");
          }
        };
        await unchanged();
        const incoming = path.join(stage, "incoming");
        for (const dir of ["generated", "imports"]) {
          const source = path.join(store.root, dir), target = path.join(incoming, dir);
          if (replace) { await fs.mkdir(target, { recursive: true }); continue; }
          try { await fs.cp(source, target, { recursive: true, preserveTimestamps: true, errorOnExist: true, force: false }); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; await fs.mkdir(target, { recursive: true }); }
        }
        for (const extra of manifest.extras || []) {
          const target = resolveInside(incoming, extra.path);
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.copyFile(resolveInside(snapshot, `extras/${extra.path}`), target);
        }
        await unchanged();
        await validateIncomingInventory(incoming);
        const pointer = await store.pointer();
        const sameWorkspace = pointer && JSON.stringify(await store.load()) === JSON.stringify(workspace);
        const receipt = sameWorkspace ? pointer : await store.prepareIncoming(workspace);
        const signature = hash((await extras(incoming)).map(e => e.signature).join("\n"));
        await unchanged();
        await activateIncoming(store.root, incoming, receipt, { localRevision: receipt.revisionId,
          remoteRevision: manifest.revision, extraSignature: signature, lastSyncAt: new Date().toISOString() }, this.controller?.signal);
      });
    } finally { await fs.rm(stage, { recursive: true, force: true }); }
  }
}
