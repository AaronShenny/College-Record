import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "../../../src/lib/contracts";
import { diagnosticControl, diagnosticPage } from "../../../services/renderer-diagnostics";

const bridge: DesktopBridge = {
  reportReady: screen => ipcRenderer.invoke("record-maker:renderer-ready", screen),
  workflow: (action, payload) => ipcRenderer.invoke("record-maker:workflow", action, payload),
  getRuntime: () => ipcRenderer.invoke("record-maker:runtime"),
  loadWorkspace: () => ipcRenderer.invoke("record-maker:load"),
  saveWorkspace: workspace => ipcRenderer.invoke("record-maker:save", workspace),
  importSource: () => ipcRenderer.invoke("record-maker:import-source"),
  pasteImage: () => ipcRenderer.invoke("record-maker:paste-image"),
  checkPython: () => ipcRenderer.invoke("record-maker:python-health"),
  inspectSnapshot: (subjectId, programIds) => ipcRenderer.invoke("record-maker:inspect", subjectId, programIds),
};
contextBridge.exposeInMainWorld("recordMaker", Object.freeze(bridge));

// Capture actions before React runs, including actions that never reach native IPC.
// No extra public bridge is exposed, and no form/clipboard contents are inspected.
const report = (kind: string, details: Record<string, unknown> = {}) => {
  void ipcRenderer.invoke("record-maker:renderer-diagnostic", {
    kind, page: diagnosticPage(location.hash), ...details,
  }).catch(() => undefined);
};
let lastEdit = 0;
for (const kind of ["click", "change", "input", "paste", "submit"] as const) {
  document.addEventListener(kind, event => {
    const target = event.target instanceof Element ? event.target.closest("button,a,input,textarea,select,summary,form") : null;
    if (!target) return;
    if (kind === "input") {
      if (performance.now() - lastEdit < 1000) return;
      lastEdit = performance.now();
    }
    report(kind === "input" ? "edit" : kind, {
      control: diagnosticControl(target.getAttribute("data-testid"), target.tagName.toLowerCase()),
    });
  }, true);
}
window.addEventListener("hashchange", () => report("navigate"));
window.addEventListener("DOMContentLoaded", () => report("navigate"), { once: true });
window.addEventListener("error", () => report("error")); // Never send message/stack/filename.
window.addEventListener("unhandledrejection", () => report("unhandled-rejection"));
window.addEventListener("focus", () => report("focus"));
window.addEventListener("blur", () => report("blur"));
document.addEventListener("visibilitychange", () => report("visibility", { visible: !document.hidden }));
document.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") report("save-shortcut");
  else if (event.key === "Escape") report("escape");
});
let lastTick = performance.now(), ticks = 0, wasVisible = !document.hidden;
setInterval(() => {
  const now = performance.now(), visible = !document.hidden;
  const delay = now - lastTick - 5000;
  if (delay > 2000 && visible && wasVisible) report("event-loop-delay", { durationMs: delay });
  if (++ticks % 6 === 0) report("heartbeat", { visible });
  lastTick = now; wasVisible = visible;
}, 5000);
try {
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (entry.duration >= 200 && !document.hidden) report("long-task", { durationMs: entry.duration });
    }
  }).observe({ entryTypes: ["longtask"] });
} catch { /* Optional browser metric; heartbeat still works. */ }
