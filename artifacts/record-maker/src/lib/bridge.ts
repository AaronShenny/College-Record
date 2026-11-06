import { emptyWorkspace, pendingItemCount, workspaceSchema, type DesktopBridge, type Workspace } from "./contracts";

// Browser persistence is a development preview only. Installed Electron uses
// filesystem storage through the preload bridge; it never silently falls back.
const DB_NAME = "record-maker-foundation-preview";
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("workspace");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Browser storage could not be opened. Local changes are not saved."));
    request.onblocked = () => reject(new Error("Close other preview tabs to open the local workspace."));
  });
}
async function readPreview(): Promise<Workspace> {
  const db = await database();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction("workspace", "readonly");
      const request = tx.objectStore("workspace").get("current");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Unable to read preview storage."));
    });
    return value === undefined ? emptyWorkspace() : workspaceSchema.parse(value);
  } finally { db.close(); }
}
async function savePreview(workspace: Workspace) {
  const validated = workspaceSchema.parse(workspace);
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("workspace", "readwrite");
      tx.objectStore("workspace").put(validated, "current");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error("Local save failed. Browser storage may be full."));
      tx.onabort = () => reject(new Error("Local save was interrupted. Your changes are not saved."));
    });
    return { savedAt: new Date().toISOString(), revisionId: crypto.randomUUID(), pendingItems: pendingItemCount(workspace), storage: "browser" as const };
  } finally { db.close(); }
}
const desktopOnly = async (): Promise<never> => {
  throw new Error("This operation requires the installed desktop application. The browser preview cannot run the Python helper or native file dialogs.");
};
const previewBridge: DesktopBridge = {
  getRuntime: async () => ({
    mode: "browser-preview", version: "0.1.0", platform: "Browser preview",
    storageLabel: "This browser only — not Windows files or Drive", driveConnected: false, pythonAvailable: null,
  }),
  loadWorkspace: readPreview,
  saveWorkspace: savePreview,
  importSource: desktopOnly,
  pasteImage: desktopOnly,
  checkPython: desktopOnly,
  inspectSnapshot: desktopOnly,
};
const missingBridge = async (): Promise<never> => {
  throw new Error("The desktop security bridge did not load. Restart or reinstall the application; the workspace has not been opened in browser storage.");
};
const unavailableBridge: DesktopBridge = {
  getRuntime: missingBridge, loadWorkspace: missingBridge, saveWorkspace: missingBridge,
  importSource: missingBridge, pasteImage: missingBridge, checkPython: missingBridge, inspectSnapshot: missingBridge,
};
const isDesktop = location.protocol === "file:" || navigator.userAgent.includes("Electron/");
export const bridge: DesktopBridge = window.recordMaker ?? (isDesktop ? unavailableBridge : previewBridge);
