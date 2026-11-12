import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { TextDecoder } from "node:util";
import { z } from "zod";
import type { HostWorkflows } from "./host-workflows";
import type { NativePlatform } from "./native-platform";
import { uuid, workflowInput } from "./startup-validation";
import { parseRendererEvent } from "./renderer-diagnostics";
import { workspaceSchema } from "../src/lib/contracts";

/** Account/revision guards stay outside the renderer, regardless of native host. */
export class NativeSession {
  private rendererRoot: string | null = null;
  private rendererRevision: string | null = null;
  private rendererAccount: string | null = null;
  private diagnosticWindow = Date.now();
  private diagnosticCount = 0;
  constructor(private workflows: HostWorkflows, private platform: NativePlatform,
    private paste: () => Promise<unknown>) {}
  async dispatch(method: string, payload: unknown): Promise<unknown> {
    const services = this.workflows;
    if (method === "runtime") return {
      mode: "desktop", version: this.platform.version, platform: process.platform,
      storageLabel: services.root, driveConnected: !!services.account.identity, pythonAvailable: null,
      requiresSignIn: this.platform.packaged, workspaceAccount: this.rendererAccount,
      workspaceRevision: this.rendererRevision,
    };
    if (method === "load") {
      const store = services.store, started = performance.now();
      const loaded = await services.loadWorkspace();
      if (services.switching || services.store !== store) throw new Error("The account is changing. Wait for sign-in to finish, then retry opening your records.");
      this.rendererRoot = store.root;
      this.rendererRevision = loaded.revisionId;
      this.rendererAccount = services.account.identity?.email ?? null;
      services.diagnostics.record("workspace-load", { durationMs: Math.round(performance.now() - started), subjects: loaded.workspace.subjects.length });
      if (!loaded.workspace.subjects.length) services.startBackground();
      return loaded.workspace;
    }
    if (method === "save") {
      if (!services.canWork) throw new Error("Sign in with your college Google account before saving record data.");
      const store = services.store;
      if (services.switching || this.rendererRoot !== services.root || this.rendererAccount !== (services.account.identity?.email ?? null)) {
        services.diagnostics.record("save-rejected", { reason: "account-boundary" });
        throw new Error("The account changed. Reload the correct workspace before saving; no old-account data was written into this account.");
      }
      // The store repeats this check INSIDE its serialized write queue.
      if (((await store.pointer())?.revisionId || null) !== this.rendererRevision) {
        throw new Error("Your saved workspace changed. Reload before saving again. No changes were overwritten.");
      }
      const receipt = await store.save(workspaceSchema.parse(payload), this.rendererRevision);
      this.rendererRevision = receipt.revisionId;
      await services.sync.invalidateStatus();
      return receipt;
    }
    if (method === "workflow") {
      const input = z.object({ action: z.unknown(), input: z.unknown() }).strict().parse(payload);
      const [action, values] = workflowInput(input.action, input.input);
      return services.run(action, values);
    }
    if (method === "renderer-ready") {
      if (payload !== "dashboard" && payload !== "sign-in") throw new Error("Invalid readiness signal.");
      services.diagnostics.record("renderer-ready", { screen: payload });
      services.startBackground();
      return null;
    }
    if (method === "diagnostic") {
      if (Date.now() - this.diagnosticWindow > 1000) { this.diagnosticWindow = Date.now(); this.diagnosticCount = 0; }
      if (++this.diagnosticCount > 30) return null;
      const event = parseRendererEvent(payload);
      if (event) services.diagnostics.record("renderer-event", event);
      return null;
    }
    if (method === "shutdown") { await services.close(); return null; }
    if (method === "python-health") {
      if (services.documents.busy) throw new Error("The Python helper is processing documents. Retry the health check after generation finishes.");
      return services.worker.health();
    }
    if (!services.canWork) throw new Error("Sign in with your college Google account before accessing record data.");
    if (services.switching) throw new Error("Wait for the account change to complete.");
    if (method === "inspect") {
      if (services.documents.busy) throw new Error("Finish document processing before running a Python snapshot inspection.");
      const input = z.object({ subjectId: z.unknown(), programIds: z.array(z.unknown()).max(500) }).strict().parse(payload);
      return services.worker.inspect(uuid(input.subjectId), input.programIds.map(uuid));
    }
    if (method === "import-source") {
      const chosen = await this.platform.openDialog({
        properties: ["openFile"], filters: [{ name: "Source code", extensions: ["py", "java", "c", "h", "cpp", "txt"] }],
      });
      if (chosen.canceled || !chosen.filePaths[0]) return null;
      const filename = chosen.filePaths[0];
      if (![".py", ".java", ".c", ".h", ".cpp", ".txt"].includes(path.extname(filename).toLowerCase())) throw new Error("Choose a supported source code file.");
      // Open once and check the same file handle before reading its bounded bytes.
      const handle = await fs.open(filename, "r");
      try {
        const info = await handle.stat();
        if (!info.isFile() || info.size > 1_000_000) throw new Error("Source files must be smaller than 1 MB.");
        const buffer = Buffer.alloc(info.size + 1);
        const { bytesRead } = await handle.read(buffer);
        if (bytesRead !== info.size) throw new Error("The source file changed during import. Try importing it again.");
        const code = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytesRead));
        if (code.includes("\0")) throw new Error("Choose a UTF-8 text source file.");
        return { id: randomUUID(), name: path.basename(filename), code, role: "Main code", include: true };
      } finally { await handle.close(); }
    }
    if (method === "paste-image") return this.paste();
    throw new Error("Unsupported desktop operation.");
  }
}
