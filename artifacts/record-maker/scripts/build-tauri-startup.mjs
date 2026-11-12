import { build as viteBuild } from "vite";
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "startup-test");
const run = (command, args, options = {}) => {
  const p = spawnSync(command, args, { cwd: root, stdio: "inherit", timeout: 20 * 60_000, ...options });
  if (p.error) throw p.error;
  if (p.status !== 0) throw new Error(`Tauri startup build step failed (${p.status}).`);
};
await viteBuild({ configFile: path.join(source, "vite.config.ts") });
await build({
  entryPoints: [path.join(source, "fixture-service.ts")], bundle: true,
  platform: "node", target: "node22", format: "cjs",
  outfile: path.join(root, "dist/tauri-startup-service.cjs"), minify: true,
});
run(process.execPath, ["--import", "tsx", "--test", path.join(source, "startup.test.ts")]);
// Generated diagnostic icon, not a runtime dependency on an uploaded image.
const dib = Buffer.alloc(40 + 16 * 16 * 4 + 16 * 4);
dib.writeUInt32LE(40); dib.writeInt32LE(16, 4); dib.writeInt32LE(32, 8);
dib.writeUInt16LE(1, 12); dib.writeUInt16LE(32, 14);
for (let i = 40; i < 40 + 16 * 16 * 4; i += 4) {
  dib[i] = 55; dib[i + 1] = 60; dib[i + 2] = 23; dib[i + 3] = 255;
}
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); ico[6] = 16; ico[7] = 16;
ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(dib.length, 14); ico.writeUInt32LE(22, 18);
writeFileSync(path.join(root, "dist/tauri-startup-icon.ico"), Buffer.concat([ico, dib]));
if (process.argv.includes("--assets-only")) process.exit(0);
if (process.platform !== "win32") throw new Error("Native Windows compilation requires the Tauri Startup Test GitHub workflow. Use --assets-only here.");

run("cargo", ["test", "--release", "--locked", "--manifest-path", path.join(source, "src-tauri/Cargo.toml")]);
run("cargo", ["build", "--release", "--locked", "--manifest-path", path.join(source, "src-tauri/Cargo.toml")]);
run(process.execPath, [path.join(root, "scripts/build-startup-trace.mjs")]);
const destination = path.resolve(root, "../../generated-artifacts/tauri-startup-test");
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
const copy = (from, to = path.basename(from)) => copyFileSync(from, path.join(destination, to));
copy(path.join(source, "src-tauri/target/release/record-maker-tauri-startup.exe"));
copy(process.execPath, "node.exe");
copy(path.join(root, "dist/tauri-startup-service.cjs"), "fixture-service.cjs");
copy(path.join(root, "dist/diagnostics/record-maker-startup-trace.exe"));
for (const file of ["Start-Tauri-Test.ps1", "Start-Tauri-Test.cmd", "Prepare-Test.cmd", "README.txt"]) copy(path.join(source, file));
copy(path.join(root, "scripts/compare-tauri-startup.mjs"), "Compare-Results.mjs");
const framework = path.join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET/Framework64/v4.0.30319/csc.exe");
if (!existsSync(framework)) throw new Error("Windows .NET Framework compiler is required.");
run(framework, ["/nologo", "/optimize+", "/target:exe", "/platform:anycpu",
  `/out:${path.join(destination, "startup-process-memory.exe")}`, path.join(source, "process-memory.cs")]);
const launcher = path.join(destination, "Start-Tauri-Test.ps1").replaceAll("'", "''");
run("powershell.exe", ["-NoProfile", "-Command",
  `$t=$null;$e=$null;[System.Management.Automation.Language.Parser]::ParseFile('${launcher}',[ref]$t,[ref]$e)|Out-Null;if($e){throw 'Invalid Tauri test launcher syntax'}`]);
const files = ["record-maker-tauri-startup.exe", "node.exe", "fixture-service.cjs", "record-maker-startup-trace.exe", "startup-process-memory.exe"];
writeFileSync(path.join(destination, "build-inventory.json"), JSON.stringify({
  benchmarkVersion: "0.2.0", builtAt: new Date().toISOString(), nodeVersion: process.version,
  release: true, pythonBundled: false, productionMigration: false,
  webview2: "System Evergreen Runtime required; installation excluded from startup measurement",
  files: files.map(name => ({ name, bytes: statSync(path.join(destination, name)).size,
    sha256: createHash("sha256").update(readFileSync(path.join(destination, name))).digest("hex") })),
}, null, 2));
run(process.execPath, [path.join(root, "scripts/smoke-tauri-startup.mjs"), destination]);
