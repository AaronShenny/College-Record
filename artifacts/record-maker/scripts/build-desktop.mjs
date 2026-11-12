import path from "node:path";
import { build as viteBuild } from "vite";
import { build } from "esbuild";
import { builtinModules } from "node:module";
import { rm } from "node:fs/promises";

const root = path.resolve(import.meta.dirname, "..");
await viteBuild({ configFile: path.join(root, "vite.desktop.config.ts"), mode: "desktop" });
await rm(path.join(root, "dist/desktop"), { recursive: true, force: true });
const desktop = await build({
  entryPoints: {
    main: path.join(root, "desktop/entry.ts"),
    application: path.join(root, "desktop/main.ts"),
    "startup-diagnostic": path.join(root, "desktop/startup-diagnostic.ts"),
    preload: path.join(root, "desktop/preload.ts"),
    services: path.join(root, "desktop/native-workflows.ts"),
    background: path.join(root, "desktop/background.ts"),
  },
  bundle: true, platform: "node", format: "cjs", target: "node22",
  external: ["electron"], outdir: path.join(root, "dist/desktop"),
  outExtension: { ".js": ".cjs" }, sourcemap: false, minify: true, metafile: true,
});
const allowed = new Set(["electron", ...builtinModules, ...builtinModules.map(name => `node:${name}`)]);
for (const output of Object.values(desktop.metafile.outputs)) {
  for (const dependency of output.imports) {
    if (dependency.external && !allowed.has(dependency.path)) throw new Error(`Unbundled desktop runtime dependency: ${dependency.path}`);
  }
}
