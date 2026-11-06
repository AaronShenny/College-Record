import type { Plugin } from "vite";
import { spawn } from "node:child_process";
import path from "node:path";
import { workspaceSchema } from "../src/lib/contracts";

// Development only: stateless processing. No Google credentials, server-side
// user database, shared Drive identity, or durable uploaded files.
export function processingPreview(): Plugin {
  return {
    name: "record-maker-local-processing",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split("?")[0] !== "/__record-maker/engine") return next();
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        if (req.method !== "POST" || req.headers["x-record-maker-preview"] !== "1") {
          res.statusCode = 403; res.end(JSON.stringify({ error: "Use the local application processing interface." })); return;
        }
        let child: ReturnType<typeof spawn> | undefined;
        try {
          const chunks: Buffer[] = []; let size = 0;
          for await (const chunk of req) {
            size += Buffer.byteLength(chunk);
            if (size > 260 * 1024 * 1024) throw new Error("Workspace processing request exceeds the 260 MB limit.");
            chunks.push(Buffer.from(chunk));
          }
          const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (request.action === "cloud-status") {
            res.end(JSON.stringify({ configured: false, connected: false, state: "desktop-required",
              message: "Per-student Google authorization uses the installed Windows application. The Agent's Drive connection is not shared with students." })); return;
          }
          if (!["inspect-template", "import-questions", "generate"].includes(request.action)) throw new Error("This operation requires the installed desktop application; it is not simulated in Preview.");
          if (request.action === "generate") request.payload.workspace = workspaceSchema.parse(request.payload.workspace);
          const python = process.env.RECORD_MAKER_PYTHON || "python";
          child = spawn(python, [path.join(import.meta.dirname, "../python/engine.py")], { shell: false, stdio: ["pipe", "pipe", "pipe"] });
          const result = await new Promise<string>((resolve, reject) => {
            let output = ""; let timer: NodeJS.Timeout;
            child!.stdout!.setEncoding("utf8"); child!.stderr!.resume();
            child!.stdout!.on("data", chunk => {
              output += chunk;
              if (output.length > 350 * 1024 * 1024) { child!.kill(); reject(new Error("Generated results exceed the processing size limit.")); }
            });
            child!.on("error", () => reject(new Error("The local Python processing service could not start.")));
            child!.stdin!.on("error", () => reject(new Error("Processing input could not be sent to Python.")));
            child!.on("exit", () => { clearTimeout(timer); resolve(output); });
            timer = setTimeout(() => { child!.kill(); reject(new Error("Document processing timed out. Saved source content is unchanged.")); }, 600_000);
            child!.stdin!.end(JSON.stringify(request));
          });
          const value = JSON.parse(result);
          if (value.error) throw new Error(value.error);
          res.end(JSON.stringify(value));
        } catch (error) {
          child?.kill();
          res.statusCode = 400;
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Processing failed" }));
        }
      });
    },
  };
}
