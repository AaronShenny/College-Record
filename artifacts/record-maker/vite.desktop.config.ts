import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  plugins: [
    react(), tailwindcss(),
    {
      name: "desktop-content-security-policy",
      transformIndexHtml(html, context) {
        if (context.server) return html;
        return html.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">`);
      },
    },
  ],
  resolve: { alias: { "@": path.join(import.meta.dirname, "src") }, dedupe: ["react", "react-dom"] },
  build: { outDir: path.join(import.meta.dirname, "dist/renderer"), emptyOutDir: true },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
