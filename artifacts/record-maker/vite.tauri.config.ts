import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  plugins: [react(), tailwindcss(), {
    name: "native-tauri-entry",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html.replace('/src/main.tsx', '/src/tauri-main.ts').replace('href="/favicon.svg"', 'href="./favicon.svg"');
      },
    },
  }],
  resolve: { alias: { "@": path.join(import.meta.dirname, "src") }, dedupe: ["react", "react-dom"] },
  build: { outDir: path.join(import.meta.dirname, "dist/tauri-renderer"), emptyOutDir: true },
});
