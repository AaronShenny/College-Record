import type { DesktopBridge } from "./contracts";
import { dashboardSummarySchema, type DashboardSummary } from "./dashboard-summary";
import { diagnosticControl, diagnosticPage } from "../../services/renderer-diagnostics";

export type NativeBoot = {
  cache: { summary: DashboardSummary; savedAt: string; pendingItems: number } | null;
  name?: string;
  email?: string;
};
declare global {
  interface Window {
    __TAURI__?: { core: { invoke<T>(command: string, args: Record<string, unknown>): Promise<T> } };
    recordMakerStartup?: NativeBoot;
    recordMakerEditState?: (dirty: boolean) => Promise<void>;
    recordMakerSummaryPainted?: () => void;
  }
}

/** No filesystem, token, vault or arbitrary-process capability is exposed. */
export async function installTauriBridge(): Promise<void> {
  const invoke = window.__TAURI__?.core.invoke;
  if (!invoke) throw new Error("The native security bridge did not load. No browser storage was opened.");
  const request = <T = any>(method: string, payload: unknown = null) => invoke<T>("desktop_request", { method, payload });
  const boot = await request<NativeBoot>("boot");
  if (boot.cache) boot.cache.summary = dashboardSummarySchema.parse(boot.cache.summary);
  window.recordMakerStartup = boot;

  // Let the true cached record desk paint before Node is even spawned.
  // Summary links remain real routes; editing still requires complete details.
  const serviceGate = boot.cache ? new Promise<void>(resolve => {
    let painted = false;
    window.recordMakerSummaryPainted = () => {
      if (painted) return;
      painted = true;
      void request("summary-ready").catch(() => undefined);
      setTimeout(resolve, 750);
    };
  }) : Promise.resolve();
  const call = async <T = any>(method: string, payload: unknown = null): Promise<T> => {
    await serviceGate;
    return request<T>(method, payload);
  };
  const bridge: DesktopBridge = {
    reportReady: screen => call("renderer-ready", screen),
    getRuntime: () => call("runtime"),
    loadWorkspace: () => call("load"),
    saveWorkspace: workspace => call("save", workspace),
    importSource: () => call("import-source"),
    pasteImage: () => call("paste-image"),
    checkPython: () => call("python-health"),
    inspectSnapshot: (subjectId, programIds) => call("inspect", { subjectId, programIds }),
    workflow: (action, input) => call("workflow", { action, input }),
  };
  Object.defineProperty(window, "recordMaker", { value: Object.freeze(bridge), writable: false, configurable: false });
  let editingSequence = Date.now() * 1000;
  window.recordMakerEditState = dirty => request<void>("edit-state", { dirty, sequence: ++editingSequence });
  // Privacy-preserving action history, using the same allowlist as Electron.
  let lastEdit = 0;
  const report = (kind: string, details: Record<string, unknown> = {}) => {
    void call("diagnostic", { kind, page: diagnosticPage(location.hash), ...details }).catch(() => undefined);
  };
  for (const kind of ["click", "change", "input", "paste", "submit"] as const) {
    document.addEventListener(kind, event => {
      const target = event.target instanceof Element ? event.target.closest("button,a,input,textarea,select,summary,form") : null;
      if (!target) return;
      if (kind === "input" && performance.now() - lastEdit < 1000) return;
      if (kind === "input") lastEdit = performance.now();
      report(kind === "input" ? "edit" : kind, { control: diagnosticControl(target.getAttribute("data-testid"), target.tagName.toLowerCase()) });
    }, true);
  }
  window.addEventListener("hashchange", () => report("navigate"));
  window.addEventListener("error", () => report("error"));
  window.addEventListener("unhandledrejection", () => report("unhandled-rejection"));
  let last = performance.now(), ticks = 0;
  setInterval(() => {
    const now = performance.now();
    if (!document.hidden && now - last > 7000) report("event-loop-delay", { durationMs: now - last - 5000 });
    if (++ticks % 6 === 0) report("heartbeat", { visible: !document.hidden });
    last = now;
  }, 5000);
}
