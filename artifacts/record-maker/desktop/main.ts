import { app, BrowserWindow, ipcMain, dialog, clipboard, session } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { WorkspaceStore } from "./store";
import { PythonWorker } from "./worker-client";
import { workspaceSchema } from "../src/lib/contracts";

let window: BrowserWindow | undefined;
let worker: PythonWorker | undefined;
app.setName("College Record Maker");
const devUrl = process.env.RECORD_MAKER_DEV_URL;
if (devUrl && !/^http:\/\/127\.0\.0\.1:5173\/?$/.test(devUrl)) throw new Error("Desktop development renderer must be the local dev server");
const entry = path.join(__dirname, "../renderer/index.html");
const allowedUrl = devUrl || pathToFileURL(entry).href;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { window?.restore(); window?.focus(); });
  app.whenReady().then(async () => {
    const root = path.join(app.getPath("userData"), "workspaces", "local-development");
    const store = new WorkspaceStore(root);
    const workerArgs = ["--workspace-root", root];
    worker = app.isPackaged
      ? new PythonWorker(path.join(process.resourcesPath, "python", "record-maker-worker.exe"), workerArgs)
      : new PythonWorker(process.env.RECORD_MAKER_PYTHON || (process.platform === "win32" ? "python" : "python3"), [path.join(app.getAppPath(), "python/worker.py"), ...workerArgs]);
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
      storageLabel: root, driveConnected: false, pythonAvailable: null,
    }));
    handle("load", () => store.load());
    handle("save", input => store.save(workspaceSchema.parse(input)));
    handle("python-health", () => worker!.request("health"));
    handle("inspect", async (subjectId: unknown, programIds: unknown) => {
      const subject = z.string().uuid().parse(subjectId);
      const programs = z.array(z.string().uuid()).max(500).parse(programIds);
      return store.withSnapshot(snapshotPath => worker!.request("snapshot-summary", { snapshotPath, subjectId: subject, programIds: programs }));
    });
    handle("import-source", async () => {
      const selected = await dialog.showOpenDialog(window!, { title: "Import a source file (copy only)", properties: ["openFile"],
        filters: [{ name: "Source text", extensions: ["py", "java", "c", "h", "cpp", "hpp", "txt", "js", "ts", "sql"] }] });
      if (selected.canceled || !selected.filePaths[0]) return null;
      const filename = selected.filePaths[0];
      const stat = await fs.stat(filename);
      if (!stat.isFile() || stat.size > 1_000_000) throw new Error("Source file must be a text file no larger than 1 MB");
      const code = new TextDecoder("utf-8", { fatal: true }).decode(await fs.readFile(filename));
      return { id: randomUUID(), name: path.basename(filename), role: "Main code", code, include: true };
    });
    handle("paste-image", async () => {
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
    window.on("closed", () => { window = undefined; });
    if (devUrl) await window.loadURL(devUrl); else await window.loadFile(entry);
  }).catch(error => { dialog.showErrorBox("College Record Maker could not start", String(error)); app.quit(); });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => worker?.stop());
}
