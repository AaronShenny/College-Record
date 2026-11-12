// Electron launcher packaging around the shared, host-neutral Windows collector.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
const compiled = spawnSync(process.execPath, [path.join(root, "scripts/build-startup-trace.mjs")], { stdio: "inherit", shell: false });
if (compiled.error) throw compiled.error;
if (compiled.status !== 0) process.exit(compiled.status || 1);
const launcher = path.join(import.meta.dirname, "Start-Startup-Check.ps1").replaceAll("'", "''");
const syntax = spawnSync("powershell.exe", ["-NoProfile", "-Command",
  `$t=$null; $e=$null; [System.Management.Automation.Language.Parser]::ParseFile('${launcher}',[ref]$t,[ref]$e)|Out-Null; if($e){throw 'Invalid startup launcher syntax'}`],
{ stdio: "inherit", shell: false, timeout: 30_000, windowsHide: true });
if (syntax.error) throw syntax.error;
if (syntax.status !== 0) process.exit(syntax.status || 1);
if (process.argv.includes("--standalone")) {
  const tools = path.resolve(root, "../../generated-artifacts/startup-trace-tools");
  mkdirSync(tools, { recursive: true });
  copyFileSync(path.join(root, "dist/diagnostics/record-maker-startup-trace.exe"), path.join(tools, "record-maker-startup-trace.exe"));
  for (const filename of ["Start-Windows-Trace.cmd", "Start-Startup-Check.ps1", "STARTUP-TRACE-README.txt"]) {
    copyFileSync(path.join(import.meta.dirname, filename), path.join(tools, filename));
  }
  console.log("Standalone legacy Electron trace tools staged.");
}
