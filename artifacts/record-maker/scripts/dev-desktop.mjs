import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const electron = require("electron");
const run = (command, args, options = {}) => spawn(command, args, { cwd: root, stdio: "inherit", shell: false, ...options });
const build = run(process.execPath, [path.join(root, "scripts/build-desktop.mjs")]);
if (await new Promise(resolve => build.on("exit", resolve)) !== 0) process.exit(1);
const vite = run(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--config", "vite.desktop.config.ts"]);
let desktop;
const stop = () => { desktop?.kill(); vite.kill(); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (vite.exitCode !== null) throw new Error("Desktop renderer dev server exited");
    try { ready = (await fetch("http://127.0.0.1:5173/")).ok; } catch {}
    if (ready) break;
    await delay(250);
  }
  if (!ready) throw new Error("Desktop renderer dev server did not become ready");
  desktop = run(electron, [root], { env: { ...process.env, RECORD_MAKER_DEV_URL: "http://127.0.0.1:5173/" } });
  desktop.on("exit", code => { vite.kill(); process.exitCode = code ?? 1; });
  desktop.on("error", error => { process.stderr.write(String(error) + "\n"); stop(); process.exitCode = 1; });
} catch (error) { process.stderr.write(String(error) + "\n"); stop(); process.exitCode = 1; }
