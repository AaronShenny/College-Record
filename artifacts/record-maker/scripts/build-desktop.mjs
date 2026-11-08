import path from "node:path";
import { build as viteBuild } from "vite";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
await viteBuild({ configFile: path.join(root, "vite.desktop.config.ts"), mode: "desktop" });
await build({
  entryPoints: {
    main: path.join(root, "desktop/main.ts"),
    preload: path.join(root, "desktop/preload.ts"),
    services: path.join(root, "desktop/native-workflows.ts"),
    background: path.join(root, "desktop/background.ts"),
  },
  bundle: true, platform: "node", format: "cjs", target: "node22",
  external: ["electron"], outdir: path.join(root, "dist/desktop"),
  outExtension: { ".js": ".cjs" }, sourcemap: true,
});
