import { autoUpdater } from "electron-updater";
import { promises as fs } from "node:fs";
import path from "node:path";

export class Updates {
  private state = { state: "unconfigured", message: "A signed Windows release and HTTPS update feed have not been configured." };
  private configured = false;
  constructor(private packaged: boolean) {}
  async initialize() {
    if (!this.packaged || process.platform !== "win32") return;
    let config: any;
    try { config = JSON.parse(await fs.readFile(path.join(process.resourcesPath, "config/release-config.json"), "utf8")); }
    catch { return; }
    if (!config.feed || !Array.isArray(config.publisherNames) || !config.publisherNames.length || new URL(config.feed).protocol !== "https:") return;
    this.configured = true;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.setFeedURL({ provider: "generic", url: config.feed });
    autoUpdater.on("checking-for-update", () => { this.state = { state: "checking", message: "Checking signed releases…" }; });
    autoUpdater.on("update-not-available", () => { this.state = { state: "current", message: "This is the latest available release." }; });
    autoUpdater.on("download-progress", progress => { this.state = { state: "downloading", message: `Downloading update: ${Math.round(progress.percent)}%` }; });
    autoUpdater.on("update-downloaded", () => { this.state = { state: "downloaded", message: "Verified update downloaded. Save your work, then restart now or continue working." }; });
    autoUpdater.on("error", () => { this.state = { state: "error", message: "Update verification or download failed. The current application was not replaced." }; });
    void this.check().catch(() => undefined);
    setInterval(() => { void this.check().catch(() => undefined); }, 6 * 60 * 60 * 1000).unref();
  }
  async check() {
    if (this.configured && !["checking", "downloading", "downloaded"].includes(this.state.state)) await autoUpdater.checkForUpdates();
    return this.state;
  }
  status() { return this.state; }
  restart() {
    if (this.state.state !== "downloaded") throw new Error("No verified downloaded update is ready.");
    autoUpdater.quitAndInstall(false, true);
    return { restarting: true };
  }
}
