import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { PerformanceLog } from "../../../services/performance-log";
import { configureGraphics } from "./graphics";
import { diagnosticPage } from "./startup-diagnostic-page";
import { DIAGNOSTIC_DEADLINE_MS, DiagnosticState, diagnosticRunName, PAGE_SIGNAL, type Milestone } from "./startup-diagnostic-core";

type ElectronHost = Pick<typeof import("electron"), "app" | "BrowserWindow" | "Menu" | "shell">;

/** Called only by the isolated entry branch, never by normal record startup. */
export function startDiagnostic(host: ElectronHost, entryProcessAgeMs: number) {
  const { app, BrowserWindow, Menu, shell } = host;
  const run = diagnosticRunName(process.argv);
  const root = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "CollegeRecordMaker-StartupChecks", run);
  fs.mkdirSync(root, { recursive: true });
  const log = new PerformanceLog(root, app.getVersion());
  const state = new DiagnosticState(entryProcessAgeMs);
  const age = () => Math.round(process.uptime() * 1000);
  const record = (event: string, details: Record<string, unknown> = {}) => log.record(`startup-check-${event}`, details);
  record("entry", { entryProcessAgeMs, scenario: "minimal-electron" });
  void log.flush();

  // Exclusive creation refuses stale profiles. Both Chromium storage paths are
  // redirected before readiness; no normal app directory is opened or deleted.
  record("profile-setup-start");
  const profile = path.join(root, "temporary-profile");
  fs.mkdirSync(profile);
  app.setName("College Record Maker Startup Check");
  app.setPath("userData", profile);
  app.setPath("sessionData", profile);
  const graphics = configureGraphics(app, process.platform, process.argv);
  record("profile-setup-end", { profile: "fresh-isolated", ...graphics });
  let window: InstanceType<typeof BrowserWindow> | undefined;
  let exiting = false;
  let successTimer: NodeJS.Timeout | undefined;
  const summary = () => fs.promises.writeFile(path.join(root, "startup-summary.json"),
    JSON.stringify({ version: app.getVersion(), ...state.report() }, null, 2), { mode: 0o600 });
  const metrics = () => {
    try {
      record("processes", { processes: app.getAppMetrics().map(item => ({
        type: item.type, cpu: item.cpu.percentCPUUsage, memoryKB: item.memory.workingSetSize,
      })) });
    } catch { record("process-metrics-unavailable"); }
  };
  const shutdown = async () => {
    if (exiting) return;
    exiting = true;
    clearTimeout(deadline); clearInterval(heartbeat); clearTimeout(successTimer);
    state.finish("closed-before-ready");
    record("finished", { result: state.result });
    // Only the diagnostic process is ended. The external launcher also bounds
    // execution if this process never gets far enough to start its own timer.
    const forced = setTimeout(() => app.exit(2), 3000);
    try { await summary(); await log.flush(); }
    catch { /* The launcher's independent log remains available on I/O failure. */ }
    finally { clearTimeout(forced); app.exit(state.result === "ready" ? 0 : 2); }
  };
  const deadline = setTimeout(() => {
    state.finish("timeout");
    record("deadline", { result: state.result });
    metrics();
    void shutdown();
  }, Math.max(1, DIAGNOSTIC_DEADLINE_MS - (age() - entryProcessAgeMs)));
  let previousTick = performance.now();
  const heartbeat = setInterval(() => {
    const now = performance.now(), lateMs = Math.round(now - previousTick - 5000);
    previousTick = now;
    record("heartbeat", { result: state.result, lateMs: Math.max(0, lateMs) });
  }, 5000);
  const mark = (stage: Milestone) => {
    const before = state.result;
    state.mark(stage, age());
    record(stage);
    if (before !== "ready" && state.result === "ready") {
      clearTimeout(deadline);
      metrics();
      const readyAt = Math.max(...Object.values(state.milestones).filter((value): value is number => value !== undefined));
      window?.setTitle(`Startup check — ready at ${(readyAt / 1000).toFixed(1)} seconds from process start`);
      record("ready", { readyAtMs: readyAt });
      void summary().then(() => log.flush()).catch(() => undefined);
      successTimer = setTimeout(() => void shutdown(), 8000);
    }
  };
  app.on("will-quit", event => { event.preventDefault(); void shutdown(); });
  app.on("window-all-closed", () => { void shutdown(); });
  app.on("child-process-gone", (_event, details) => record("child-process-gone", {
    reason: details.reason, processType: details.type, exitCode: details.exitCode,
  }));
  void app.whenReady().then(() => {
    if (exiting) return;
    mark("electronReady");
    record("window-create-start");
    window = new BrowserWindow({
      width: 920, height: 650, show: true, backgroundColor: "#f4f1e8",
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true },
    });
    mark("windowCreated");
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    window.webContents.session.webRequest.onBeforeRequest(
      { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*", "ftp://*/*"] },
      (_details, callback) => callback({ cancel: true }));
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", event => event.preventDefault());
    window.webContents.on("did-start-loading", () => record("loading-start"));
    window.webContents.on("dom-ready", () => mark("domReady"));
    window.webContents.on("did-finish-load", () => mark("loadFinished"));
    window.webContents.on("console-message", details => {
      // Current Electron supplies an event with message. Never log arbitrary console
      // text, source URLs, payloads, command arguments, or local user paths.
      if (details.message === PAGE_SIGNAL) mark("scriptReady");
    });
    window.once("ready-to-show", () => mark("firstPaint"));
    window.on("unresponsive", () => { state.unresponsiveCount++; record("unresponsive"); metrics(); });
    window.on("responsive", () => record("responsive"));
    window.webContents.on("render-process-gone", (_event, details) => {
      record("renderer-gone", { reason: details.reason, exitCode: details.exitCode });
      state.finish("error"); void shutdown();
    });
    window.webContents.on("did-fail-load", (_event, errorCode) => {
      record("load-failed", { errorCode }); state.finish("error"); void shutdown();
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: "Diagnostic", submenu: [
      { label: "Open diagnostic results folder", click: () => { void shell.openPath(root).then(error => record("open-results", { ok: !error })); } },
      { label: "Close test", click: () => { void shutdown(); } },
    ] }]));
    record("load-requested");
    void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(diagnosticPage(randomUUID()))}`)
      .catch(() => { state.finish("error"); record("load-rejected"); void shutdown(); });
  }).catch(() => { state.finish("error"); record("initialization-failed"); void shutdown(); });
}
