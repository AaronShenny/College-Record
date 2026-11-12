import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  root: import.meta.dirname, base: "./", plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../src") }, dedupe: ["react", "react-dom"] },
  build: {
    outDir: path.resolve(import.meta.dirname, "../dist/tauri-startup-ui"), emptyOutDir: true,
    rollupOptions: { input: { minimal: path.join(import.meta.dirname, "minimal.html"),
      dashboard: path.join(import.meta.dirname, "dashboard.html") } },
  },
});
