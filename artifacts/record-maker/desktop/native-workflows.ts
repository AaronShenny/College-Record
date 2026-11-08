import { app, dialog, safeStorage, shell, utilityProcess, type BrowserWindow } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CredentialUnlockError, GoogleAccount } from "./google-auth";
import { BackgroundClient, BackgroundStore, BackgroundSync, BackgroundDocuments, BackgroundPython, cloudStatusWithActivity } from "./background-client";
import { Updates } from "./updates";
import { parseDesktopRegistration } from "./google-registration.mjs";
import { PerformanceLog } from "./performance-log";

export class NativeWorkflows {
  root: string;
  store!: BackgroundStore;
  worker!: BackgroundPython;
  documents!: BackgroundDocuments;
  readonly account: GoogleAccount;
  readonly diagnostics: PerformanceLog;
  sync!: BackgroundSync;
  private background!: BackgroundClient;
  private changing = false;
  private startupSync: Promise<unknown> = Promise.resolve();
  private backgroundStarted = false;
  private syncTimer?: NodeJS.Timeout;
  private updateTimer?: NodeJS.Timeout;
  readonly updates = new Updates(app.isPackaged);
  constructor(private directory: string, private window: () => BrowserWindow, diagnostics?: PerformanceLog) {
    this.diagnostics = diagnostics || new PerformanceLog(directory, app.getVersion());
    this.root = path.join(directory, "workspaces/local-development");
    this.account = new GoogleAccount(path.join(directory, "credentials"), {
      available: () => safeStorage.isEncryptionAvailable() && (process.platform === "win32" || safeStorage.getSelectedStorageBackend() !== "basic_text"),
      encrypt: text => this.vaultOperation("encrypt", () => safeStorage.encryptString(text)),
      decrypt: bytes => this.vaultOperation("decrypt", () => safeStorage.decryptString(bytes)),
    }, url => shell.openExternal(url));
  }
  private vaultOperation<T>(operation: string, job: () => T): T {
    const started = performance.now();
    try { return job(); }
    finally { this.diagnostics.record("credential-vault", { operation, durationMs: Math.round(performance.now() - started) }); }
  }
  private activate(root: string) {
    this.background?.stop();
    this.root = root;
    const args = ["--workspace-root", root];
    const command = app.isPackaged
      ? path.join(process.resourcesPath, "python/record-maker-worker.exe")
      : process.env.RECORD_MAKER_PYTHON || (process.platform === "win32" ? "python" : "python3");
    const pythonArgs = app.isPackaged ? args : [path.join(app.getAppPath(), "python/worker.py"), ...args];
    const child = utilityProcess.fork(path.join(__dirname, "background.cjs"), [root, command, ...pythonArgs], {
      serviceName: "Record storage and Drive", stdio: "pipe",
    });
    child.stdout?.resume(); child.stderr?.resume();
    child.on("spawn", () => this.diagnostics.record("background-started"));
    this.background = new BackgroundClient(child, this.account, (event, details) => this.diagnostics.record(event, details));
    this.store = new BackgroundStore(root, this.background);
    this.sync = new BackgroundSync(this.background);
    this.documents = new BackgroundDocuments(this.background);
    this.worker = new BackgroundPython(this.background);
  }
  async initialize() {
    const started = performance.now();
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
    this.diagnostics.record("credentials-ready", { durationMs: Math.round(performance.now() - started) });
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
    this.activate(this.account.key ? path.join(this.directory, "workspaces", `account-${this.account.key}`) : this.root);
    this.diagnostics.record("services-ready", { durationMs: Math.round(performance.now() - started) });
  }
  /** Called after a real renderer screen has painted, not during window creation. */
  startBackground() {
    if (this.backgroundStarted) return;
    this.backgroundStarted = true;
    if (this.account.identity && !this.sync.busy && !this.documents.busy && !this.changing) this.startupSync = this.sync.sync().catch(() => undefined);
    this.syncTimer = setInterval(() => {
      if (this.account.identity && !this.sync.busy && !this.changing && !this.documents.busy) void this.sync.sync().catch(() => undefined);
    }, 60_000).unref();
    this.updateTimer = setTimeout(() => {
      const started = performance.now();
      void this.updates.initialize()
        .then(() => this.diagnostics.record("updates-initialized", { durationMs: Math.round(performance.now() - started) }))
        .catch(() => this.diagnostics.record("updates-initialization-failed"));
    }, 10_000).unref();
  }
  async close() {
    clearInterval(this.syncTimer); clearTimeout(this.updateTimer);
    await this.background?.close();
  }
  private canChange() {
    if (this.changing || this.sync.busy || this.documents.busy) throw new Error("Wait for processing and synchronization to finish before changing accounts or restarting.");
  }
  get switching() { return this.changing; }
  get canWork() { return !app.isPackaged || !!this.account.identity; }
  async loadWorkspace() {
    if (!this.canWork) return { workspace: { schemaVersion: 1 as const, subjects: [] }, revisionId: null };
    // A cached workspace must open even on a slow/offline connection. Only a
    // first download, with no local committed snapshot, needs to wait for Drive.
    if (this.account.identity && !(await this.store.pointer())) {
      // A new computer has no cache to display. Only this path must download
      // before editing; its renderer remains responsive while the child works.
      this.startBackground();
      await this.startupSync;
    }
    if (this.account.identity && !(await this.store.pointer())) {
      if (this.sync.busy) throw new Error("The initial Drive download is still running. Retry when synchronization finishes.");
      await this.sync.sync();
    }
    return this.store.loadWithRevision();
  }
  async run(action: string, input: Record<string, unknown>) {
    if (!input || typeof input !== "object") throw new Error("Invalid workflow request.");
    if (!this.canWork && !["cloud-status", "configure-google", "connect-drive", "check-updates", "restart-update", "export-diagnostics"].includes(action)) {
      throw new Error("Sign in with your college Google account before accessing record data.");
    }
    if (["inspect-template", "import-questions", "generate"].includes(action)) {
      if (this.changing) throw new Error("Wait for the account change to complete.");
      try { return await this.documents.run(action, input); }
      finally { await this.sync.invalidateStatus(); }
    }
    if (action === "cloud-status") {
      const status = await this.sync.status();
      // A cached "synced empty" status is not evidence that Drive is still
      // empty before this launch's first check. Nonempty cached records remain
      // usable, but the initial empty dashboard must stay behind its load gate.
      return cloudStatusWithActivity(status, !!this.account.identity && !this.backgroundStarted, this.changing, this.sync.busy);
    }
    if (action === "export-diagnostics") {
      const chosen = await dialog.showSaveDialog(this.window(), { defaultPath: "record-maker-diagnostics.txt", filters: [{ name: "Diagnostic log", extensions: ["txt"] }] });
      if (!chosen.canceled && chosen.filePath) await this.diagnostics.exportTo(chosen.filePath);
      return { saved: !chosen.canceled };
    }
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
        const root = path.join(this.directory, "workspaces", `account-${this.account.key}`);
        // Repairing authorization for the SAME account must not replace its
        // store or invalidate an already loaded renderer's save boundary.
        if (root !== this.root) this.activate(root);
        this.startupSync = this.sync.sync().catch(() => undefined);
        return await this.sync.status();
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
        await this.background.request("cleanup");
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
      return this.background.request("source-folder", { directory: chosen.filePaths[0] });
    }
    if (action === "drive-sources") {
      const value = z.string().max(300).parse(input.folderId);
      const id = /\/folders\/([A-Za-z0-9_-]+)/.exec(value)?.[1] || value;
      if (!/^[A-Za-z0-9_-]{5,150}$/.test(id)) throw new Error("Enter a valid Drive folder link or ID.");
      return this.background.request("drive-sources", { id });
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
