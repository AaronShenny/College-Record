import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "../src/lib/contracts";

const bridge: DesktopBridge = {
  getRuntime: () => ipcRenderer.invoke("record-maker:runtime"),
  loadWorkspace: () => ipcRenderer.invoke("record-maker:load"),
  saveWorkspace: workspace => ipcRenderer.invoke("record-maker:save", workspace),
  importSource: () => ipcRenderer.invoke("record-maker:import-source"),
  pasteImage: () => ipcRenderer.invoke("record-maker:paste-image"),
  checkPython: () => ipcRenderer.invoke("record-maker:python-health"),
  inspectSnapshot: (subjectId, programIds) => ipcRenderer.invoke("record-maker:inspect", subjectId, programIds),
};
contextBridge.exposeInMainWorld("recordMaker", Object.freeze(bridge));
