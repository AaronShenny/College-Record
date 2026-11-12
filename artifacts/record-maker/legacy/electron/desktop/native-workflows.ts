import { app, dialog, safeStorage, shell, utilityProcess, type BrowserWindow } from "electron";
import path from "node:path";
import { HostWorkflows } from "../../../services/host-workflows";
import type { PerformanceLog } from "../../../services/performance-log";
import { Updates } from "./updates";

// Reference host adapter. Domain logic has one active owner in services/.
export class NativeWorkflows extends HostWorkflows {
  constructor(directory: string, window: () => BrowserWindow, diagnostics?: PerformanceLog) {
    super(directory, {
      version: app.getVersion(), packaged: app.isPackaged, resources: process.resourcesPath,
      appRoot: app.getAppPath(), updates: new Updates(app.isPackaged),
      vault: {
        available: () => safeStorage.isEncryptionAvailable() && (process.platform === "win32" || safeStorage.getSelectedStorageBackend() !== "basic_text"),
        encrypt: text => safeStorage.encryptString(text), decrypt: bytes => safeStorage.decryptString(bytes),
      },
      createBackground: (root, command, args) => {
        const child = utilityProcess.fork(path.join(__dirname, "background.cjs"), [root, command, ...args], {
          serviceName: "Record storage and Drive", stdio: "pipe",
        });
        child.stdout?.resume(); child.stderr?.resume();
        return child;
      },
      openExternal: url => shell.openExternal(url), openPath: filename => shell.openPath(filename),
      openDialog: options => dialog.showOpenDialog(window(), options),
      saveDialog: options => dialog.showSaveDialog(window(), options),
      messageDialog: options => dialog.showMessageBox(options),
    }, diagnostics);
  }
}
