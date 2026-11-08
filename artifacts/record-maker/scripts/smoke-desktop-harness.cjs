const { app } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const directory = process.argv[2];
if (!directory || !path.isAbsolute(directory)) throw new Error("A disposable smoke directory is required");
app.setPath("userData", directory);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let running = false;
app.on("browser-window-created", (_event, window) => {
  if (running) return;
  running = true;
  window.webContents.once("did-finish-load", () => void (async () => {
    async function waitForTitle(title) {
      for (let attempt = 0; attempt < 150; attempt++) {
        if (await window.webContents.executeJavaScript(`document.body.innerText.includes(${JSON.stringify(title)})`)) return;
        await delay(100);
      }
      throw new Error("The compiled dashboard did not display its saved cache.");
    }
    await waitForTitle("Native startup smoke fixture");
    const runtime = await window.webContents.executeJavaScript("window.recordMaker.getRuntime()");
    assert.equal(runtime.mode, "desktop");
    assert.equal(runtime.driveConnected, false);
    // Wait for the real React after-paint report, not a direct test IPC signal.
    let dashboard;
    for (let attempt = 0; attempt < 30; attempt++) {
      const text = await fs.readFile(path.join(directory, "logs/performance.jsonl"), "utf8").catch(() => "");
      const rows = text.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
      dashboard = rows.find(row => row.event === "renderer-interactive" && row.screen === "dashboard");
      if (dashboard) break;
      await delay(100);
    }
    assert.ok(dashboard, "A loading window must not count as an interactive dashboard");
    await window.webContents.executeJavaScript(`(async () => {
      const w = await window.recordMaker.loadWorkspace();
      if (w.subjects.length !== 1) throw new Error("Unexpected disposable workspace");
      w.subjects[0].name = "Saved native smoke fixture";
      await window.recordMaker.saveWorkspace(w);
      const reopened = await window.recordMaker.loadWorkspace();
      if (reopened.subjects[0].name !== w.subjects[0].name) throw new Error("Native save did not persist");
    })()`);
    const reloaded = new Promise(resolve => window.webContents.once("did-finish-load", resolve));
    window.webContents.reload(); await reloaded;
    await waitForTitle("Saved native smoke fixture");
    await fs.writeFile(path.join(directory, "smoke-result.json"), JSON.stringify({ ok: true, dashboardProcessAgeMs: dashboard.processAgeMs }));
    window.close(); // Exercise the real graceful background shutdown.
  })().catch(async error => {
    await fs.writeFile(path.join(directory, "smoke-result.json"), JSON.stringify({ ok: false, error: error.message }));
    app.exit(1);
  }));
});
require("../dist/desktop/main.cjs");
