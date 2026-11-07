import { app, dialog, safeStorage, shell, type BrowserWindow } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CredentialUnlockError, GoogleAccount } from "./google-auth";
import { DriveSync, DriveFiles } from "./drive-sync";
import { WorkspaceStore } from "./store";
import { PythonWorker } from "./worker-client";
import { DocumentService } from "./processing";
import { Updates } from "./updates";
import { parseDesktopRegistration } from "./google-registration.mjs";

export class NativeWorkflows {
  root: string;
  store: WorkspaceStore;
  worker!: PythonWorker;
  documents!: DocumentService;
  readonly account: GoogleAccount;
  sync: DriveSync;
  private changing = false;
  private startupSync: Promise<unknown> = Promise.resolve();
  readonly updates = new Updates(app.isPackaged);
  constructor(private directory: string, private window: () => BrowserWindow) {
    this.root = path.join(directory, "workspaces/local-development");
    this.store = new WorkspaceStore(this.root);
    this.activate(this.root);
    this.account = new GoogleAccount(path.join(directory, "credentials"), {
      available: () => safeStorage.isEncryptionAvailable() && (process.platform === "win32" || safeStorage.getSelectedStorageBackend() !== "basic_text"),
      encrypt: text => safeStorage.encryptString(text), decrypt: bytes => safeStorage.decryptString(bytes),
    }, url => shell.openExternal(url));
    this.sync = new DriveSync(this.account, () => this.store);
  }
  private activate(root: string) {
    this.worker?.stop("The account workspace changed after saving.");
    this.root = root; this.store = new WorkspaceStore(root);
    const args = ["--workspace-root", root];
    this.worker = app.isPackaged
      ? new PythonWorker(path.join(process.resourcesPath, "python/record-maker-worker.exe"), args)
      : new PythonWorker(process.env.RECORD_MAKER_PYTHON || (process.platform === "win32" ? "python" : "python3"), [path.join(app.getAppPath(), "python/worker.py"), ...args]);
    this.documents = new DocumentService(root, this.worker);
  }
  async initialize() {
    try {
      await this.account.initialize();
    } catch (error) {
      if (!(error instanceof CredentialUnlockError)) throw error;
      const choice = await dialog.showMessageBox({
        type: "warning",
        title: "Saved Google sign-in could not be unlocked",
        message: "Your cached records have not been deleted.",
        detail: "Windows could not unlock the saved Google credentials. Close the app and try again under the original Windows account, or recover sign-in. Recovery preserves the old encrypted credentials separately and does not delete records, pending edits, generated documents, or Drive files. Sign in again with the SAME college Google account to reopen its local records. You will need an internet connection.",
        buttons: ["Close without changes", "Recover sign-in"],
        defaultId: 0, cancelId: 0, noLink: true,
      });
      if (choice.response !== 1) throw error;
      await this.account.recoverLockedCredentials();
    }
    if (!this.account.configured) {
      try {
        const registration = app.isPackaged
          ? await fs.readFile(path.join(process.resourcesPath, "config/google-client.json"), "utf8")
          : process.env.GOOGLE_DESKTOP_CLIENT_JSON_PATH
            ? await fs.readFile(process.env.GOOGLE_DESKTOP_CLIENT_JSON_PATH, "utf8")
            : process.env.GOOGLE_DESKTOP_CLIENT_JSON;
        if (registration) await this.account.configure(parseDesktopRegistration(registration));
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    if (this.account.key) this.activate(path.join(this.directory, "workspaces", `account-${this.account.key}`));
    await this.updates.initialize();
    if (this.account.identity) this.startupSync = this.sync.sync().catch(() => undefined);
    setInterval(() => {
      if (this.account.identity && !this.sync.busy && !this.changing && !this.documents.busy) void this.sync.sync().catch(() => undefined);
    }, 60_000).unref();
  }
  private canChange() {
    if (this.changing || this.sync.busy || this.documents.busy) throw new Error("Wait for processing and synchronization to finish before changing accounts or restarting.");
  }
  get switching() { return this.changing; }
  get canWork() { return !app.isPackaged || !!this.account.identity; }
  async loadWorkspace() {
    if (!this.canWork) return { schemaVersion: 1 as const, subjects: [] };
    await this.startupSync;
    if (this.account.identity && !(await this.store.pointer())) {
      if (this.sync.busy) throw new Error("The initial Drive download is still running. Retry when synchronization finishes.");
      await this.sync.sync();
    }
    return this.store.load();
  }
  async run(action: string, input: Record<string, unknown>) {
    if (!input || typeof input !== "object") throw new Error("Invalid workflow request.");
    if (!this.canWork && !["cloud-status", "configure-google", "connect-drive", "check-updates", "restart-update"].includes(action)) {
      throw new Error("Sign in with your college Google account before accessing record data.");
    }
    if (["inspect-template", "import-questions", "generate"].includes(action)) {
      if (this.changing) throw new Error("Wait for the account change to complete.");
      return this.documents.run(action, input);
    }
    if (action === "cloud-status") return { ...await this.sync.status(), busy: this.changing || this.sync.busy };
    if (action === "list-documents") return this.documents.list();
    if (action === "configure-google") {
      this.canChange();
      const selected = await dialog.showOpenDialog(this.window(), { title: "Load registered Google Desktop OAuth client JSON", properties: ["openFile"], filters: [{ name: "Google Desktop OAuth JSON", extensions: ["json"] }] });
      if (!selected.canceled && selected.filePaths[0]) {
        const file = selected.filePaths[0];
        if ((await fs.stat(file)).size > 32_000) throw new Error("Google client configuration file is unexpectedly large.");
        await this.account.configure(parseDesktopRegistration(await fs.readFile(file, "utf8")));
      }
      return this.sync.status();
    }
    if (action === "connect-drive") {
      this.canChange(); this.changing = true;
      try {
        await this.store.load();
        await this.account.signIn();
        this.activate(path.join(this.directory, "workspaces", `account-${this.account.key}`));
        return await this.sync.sync();
      } finally { this.changing = false; }
    }
    if (action === "sync-drive") {
      if (this.changing || this.documents.busy) throw new Error("Wait for the current account/document operation before syncing.");
      await this.store.load(); return this.sync.sync();
    }
    if (action === "logout-cleanup") {
      this.canChange();
      if (!this.account.key) throw new Error("There is no signed-in account to clean up.");
      this.changing = true;
      try {
        const status = await this.sync.sync();
        if (status.pending || status.state === "error") throw new Error("All pending edits and generated files must successfully sync before cleanup.");
        const root = path.join(this.directory, "workspaces", `account-${this.account.key}`);
        if (root !== this.root) throw new Error("Account cleanup boundary did not match.");
        const names = await fs.readdir(root, { recursive: true });
        if (names.some(name => path.basename(name).startsWith("~$"))) throw new Error("Close the app's generated documents in Microsoft Word before deleting local cached files. Nothing was deleted.");
        this.worker.stop();
        await fs.rm(root, { recursive: true, force: true });
        await this.account.clear();
        // Never open a previous student's anonymous development drafts on logout.
        this.activate(path.join(this.directory, "workspaces", `signed-out-${randomUUID()}`));
        return this.sync.status();
      } finally { this.changing = false; }
    }
    if (action === "open-document") {
      const { item, filename } = await this.documents.file(z.string().uuid().parse(input.id));
      if (input.action === "download") {
        const chosen = await dialog.showSaveDialog(this.window(), { defaultPath: item.name, properties: ["showOverwriteConfirmation", "createDirectory"] });
        if (!chosen.canceled && chosen.filePath) await fs.copyFile(filename, chosen.filePath);
        return { saved: !chosen.canceled };
      }
      if (input.action !== "open") throw new Error("Invalid document action.");
      if (item.format === "docx") return this.documents.run("open-word", { id: item.id });
      const error = await shell.openPath(filename);
      if (error) throw new Error(error);
      return { opened: true };
    }
    if (action === "source-folder") {
      const chosen = await dialog.showOpenDialog(this.window(), { title: "Copy sources from a subject folder", properties: ["openDirectory"] });
      if (chosen.canceled || !chosen.filePaths[0]) return [];
      const directory = chosen.filePaths[0];
      const names = await fs.readdir(directory, { withFileTypes: true });
      const result = [];
      for (const entry of names.filter(n => n.isFile() && /\.(py|java|c|h|cpp|hpp|txt|sql|js|ts)$/i.test(n.name)).slice(0, 300)) {
        const filename = path.join(directory, entry.name);
        if ((await fs.stat(filename)).size > 1_000_000) throw new Error(`Source ${entry.name} exceeds the 1 MB limit.`);
        const code = new TextDecoder("utf-8", { fatal: true }).decode(await fs.readFile(filename));
        if (code.includes("\x00")) throw new Error("A selected source is binary, not source text.");
        result.push({ id: randomUUID(), name: entry.name, role: "Main code", code, include: true });
      }
      return result;
    }
    if (action === "drive-sources") {
      const value = z.string().max(300).parse(input.folderId);
      const id = /\/folders\/([A-Za-z0-9_-]+)/.exec(value)?.[1] || value;
      if (!/^[A-Za-z0-9_-]{5,150}$/.test(id)) throw new Error("Enter a valid Drive folder link or ID.");
      const api = new DriveFiles(this.account);
      const files = await api.list(`'${id}' in parents`);
      const result = [];
      for (const file of files.filter(f => /\.(py|java|c|h|cpp|hpp|txt|sql|js|ts)$/i.test(f.name)).slice(0, 300)) {
        const bytes = await api.bytes(file.id);
        if (bytes.length > 1_000_000) throw new Error(`Source ${file.name} exceeds the 1 MB limit.`);
        const code = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        if (code.includes("\x00")) throw new Error("A selected Drive file is binary.");
        result.push({ id: randomUUID(), name: file.name, role: "Main code", code, include: true });
      }
      return result;
    }
    if (action === "check-updates") return this.updates.check();
    if (action === "restart-update") {
      if (this.changing || this.documents.busy) throw new Error("Finish document processing and account changes before restarting.");
      if (this.updates.status().state !== "downloaded") throw new Error("No verified downloaded update is ready.");
      this.changing = true;
      try {
        await this.store.load();
        await this.sync.pause(); // Pending uploads remain queued; no forced full sync.
        return this.updates.restart();
      } finally { this.changing = false; }
    }
    throw new Error("Unsupported desktop workflow operation.");
  }
}
