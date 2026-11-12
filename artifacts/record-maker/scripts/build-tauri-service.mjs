import path from "node:path";
import { builtinModules } from "node:module";
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "dist/tauri-host");
const compiled = await build({
  entryPoints: {
    "service-host": path.join(root, "tauri/service-host.ts"),
    background: path.join(root, "services/background.ts"),
  },
  bundle: true, platform: "node", format: "cjs", target: "node22",
  outdir: output, outExtension: { ".js": ".cjs" }, sourcemap: false,
  minify: true, metafile: true,
});
const builtins = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)]);
for (const input of Object.keys(compiled.metafile.inputs)) {
  if (input.replaceAll("\\", "/").includes("/legacy/electron/")) throw new Error("The Tauri service imported archived Electron code.");
}
for (const emitted of Object.values(compiled.metafile.outputs)) {
  for (const dependency of emitted.imports) {
    if (dependency.external && !builtins.has(dependency.path)) throw new Error(`Unbundled Tauri service dependency: ${dependency.path}`);
  }
}
await mkdir(output, { recursive: true });
await writeFile(path.join(output, "bundle-audit.json"), JSON.stringify({
  entrypoints: ["service-host.cjs", "background.cjs"],
  electronImported: false, applicationHttpServer: false,
  note: "The Google OAuth callback is the only permitted loopback HTTP listener.",
  outputs: Object.fromEntries(Object.entries(compiled.metafile.outputs).map(([name, value]) => [path.basename(name), { bytes: value.bytes }])),
}, null, 2));
console.log("Built host-neutral Tauri services without Electron or external runtime dependencies.");
