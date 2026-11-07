import { app, BrowserWindow, ipcMain, dialog, clipboard, session } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { workspaceSchema } from "../src/lib/contracts";
import { NativeWorkflows } from "./native-workflows";

let window: BrowserWindow | undefined;
let services: NativeWorkflows | undefined;
app.setName("College Record Maker");
const devUrl = process.env.RECORD_MAKER_DEV_URL;
if (devUrl && !/^http:\/\/127\.0\.0\.1:5173\/?$/.test(devUrl)) throw new Error("Desktop development renderer must be the local dev server");
const entry = path.join(__dirname, "../renderer/index.html");
const allowedUrl = devUrl || pathToFileURL(entry).href;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { window?.restore(); window?.focus(); });
  app.whenReady().then(async () => {
    const started = performance.now();
    services = new NativeWorkflows(app.getPath("userData"), () => window!);
    await services.initialize();
    let rendererRoot = services.root;
    let rendererRevision: string | null = null;
    let rendererAccount: string | null = null;
    const handle = (name: string, handler: (...args: any[]) => unknown) => {
      ipcMain.handle(`record-maker:${name}`, async (event, ...args) => {
        if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame ||
            event.senderFrame.url.split("#")[0].replace(/\/$/, "") !== allowedUrl.replace(/\/$/, "")) {
          throw new Error("Desktop operation rejected: untrusted renderer");
        }
        return handler(...args);
      });
    };
    handle("runtime", () => ({
      mode: "desktop", version: app.getVersion(), platform: process.platform,
      storageLabel: services!.root, driveConnected: !!services!.account.identity, pythonAvailable: null,
      requiresSignIn: app.isPackaged,
      workspaceAccount: rendererAccount,
      workspaceRevision: rendererRevision,
    }));
    handle("load", async () => {
      const started = performance.now();
      const store = services!.store;
      const loaded = await services!.loadWorkspace();
      if (services!.switching || services!.store !== store) throw new Error("The account is changing. Wait for sign-in to finish, then retry opening your records.");
      rendererRoot = store.root;
      rendererRevision = loaded.revisionId;
      rendererAccount = services!.account.identity?.email ?? null;
      services!.diagnostics.record("workspace-load", { durationMs: Math.round(performance.now() - started), subjects: loaded.workspace.subjects.length });
      return loaded.workspace;
    });
    handle("save", async input => {
      const started = performance.now();
      if (!services!.canWork) throw new Error("Sign in with your college Google account before saving record data.");
      const store = services!.store;
      if (services!.switching || rendererRoot !== services!.root) {
        services!.diagnostics.record("save-rejected", { reason: "account-boundary", changing: services!.switching, rootMismatch: rendererRoot !== services!.root });
        throw new Error("The account changed. Reload the correct workspace before saving; no old-account data was written into this account.");
      }
      const current = (await store.pointer())?.revisionId || null;
      if (current !== rendererRevision) {
        services!.diagnostics.record("save-rejected", { reason: "revision-boundary" });
        throw new Error("The workspace changed from Drive. Unsaved edits remain in this window; do not overwrite the downloaded workspace.");
      }
      const receipt = await store.save(workspaceSchema.parse(input), rendererRevision);
      rendererRevision = receipt.revisionId;
      services!.diagnostics.record("workspace-save", { durationMs: Math.round(performance.now() - started) });
      return receipt;
    });
    handle("workflow", (action, payload) => services!.run(z.string().max(80).parse(action), z.record(z.unknown()).parse(payload)));
    handle("python-health", () => services!.worker.request("health"));
    handle("inspect", async (subjectId: unknown, programIds: unknown) => {
      if (!services!.canWork) throw new Error("Sign in before accessing saved records.");
      const subject = z.string().uuid().parse(subjectId);
      const programs = z.array(z.string().uuid()).max(500).parse(programIds);
      return services!.store.withSnapshot(snapshotPath => services!.worker.request("snapshot-summary", { snapshotPath, subjectId: subject, programIds: programs }));
    });
    handle("import-source", async () => {
      if (!services!.canWork) throw new Error("Sign in before importing source files.");
      const selected = await dialog.showOpenDialog(window!, { title: "Import a source file (copy only)", properties: ["openFile"],
        filters: [{ name: "Source text", extensions: ["py", "java", "c", "h", "cpp", "hpp", "txt", "js", "ts", "sql"] }] });
      if (selected.canceled || !selected.filePaths[0]) return null;
      const filename = selected.filePaths[0];
      const stat = await fs.stat(filename);
      if (!stat.isFile() || stat.size > 1_000_000) throw new Error("Source file must be a text file no larger than 1 MB");
      const code = new TextDecoder("utf-8", { fatal: true }).decode(await fs.readFile(filename));
      if (code.includes("\x00")) throw new Error("Select a text source file, not binary content.");
      return { id: randomUUID(), name: path.basename(filename), role: "Main code", code, include: true };
    });
    handle("paste-image", async () => {
      if (!services!.canWork) throw new Error("Sign in before reading the clipboard.");
      for (const item of await clipboard.read()) {
        const mime = (["image/png", "image/jpeg", "image/webp"] as const).find(type => item.types.includes(type));
        if (!mime) continue;
        const image = await item.getType(mime);
        if (image.size > 8 * 1024 * 1024) throw new Error("Clipboard image is too large; use an image smaller than 8 MB");
        if (!image.size) continue;
        const dataUrl = `data:${mime};base64,${Buffer.from(await image.arrayBuffer()).toString("base64")}`;
        return { id: randomUUID(), kind: "image", name: "Pasted screenshot", dataUrl, include: true };
      }
      return null;
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    window = new BrowserWindow({
      width: 1440, height: 960, minWidth: 860, minHeight: 620, backgroundColor: "#f4f1e8", show: false,
      webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true },
    });
    window.setMenuBarVisibility(false);
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event, url) => {
      if (url.split("#")[0].replace(/\/$/, "") !== allowedUrl.replace(/\/$/, "")) event.preventDefault();
    });
    window.webContents.on("will-prevent-unload", () => {
      dialog.showMessageBoxSync(window!, { type: "warning", title: "Local changes are not saved",
        message: "Finish saving before closing", detail: "Use Save Now and resolve any save error. Pending Drive uploads can remain queued locally, but unsaved edits must be saved before closing.", buttons: ["Keep working"] });
    });
    window.once("ready-to-show", () => window?.show());
    window.on("unresponsive", () => services?.diagnostics.record("window-unresponsive", {
      processes: app.getAppMetrics().map(m => ({ type: m.type, cpu: m.cpu.percentCPUUsage, memoryKB: m.memory.workingSetSize })),
    }));
    window.on("responsive", () => services?.diagnostics.record("window-responsive"));
    let lastTick = performance.now();
    setInterval(() => {
      const now = performance.now();
      if (now - lastTick > 3000) services?.diagnostics.record("main-thread-delay", { durationMs: Math.round(now - lastTick - 1000) });
      lastTick = now;
    }, 1000).unref();
    window.on("close", event => {
      if (services?.documents.busy) {
        event.preventDefault();
        dialog.showMessageBoxSync(window!, { type: "info", title: "Document processing is running",
          message: "Wait for document processing to finish before closing.", detail: "You can continue editing while it runs.", buttons: ["Keep working"] });
      }
    });
    window.on("closed", () => { window = undefined; });
    if (devUrl) await window.loadURL(devUrl); else await window.loadFile(entry);
    services.diagnostics.record("window-loaded", { durationMs: Math.round(performance.now() - started) });
  }).catch(error => { dialog.showErrorBox("College Record Maker could not start", String(error)); app.quit(); });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", event => {
    if (services?.documents.busy) { event.preventDefault(); window?.focus(); return; }
    services?.worker.stop();
  });
}
