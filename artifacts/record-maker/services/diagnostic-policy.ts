/** Only categories/codes leave this classifier, never raw exception messages or stacks. */
export function diagnosticError(error: unknown): Record<string, string | number> {
  const e = error as { message?: unknown; code?: unknown; name?: unknown };
  const text = typeof e?.message === "string" ? e.message : "";
  const code = typeof e?.code === "string" && /^(ENOENT|EACCES|EPERM|ENOSPC|EBUSY|EIO|ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED)$/.test(e.code) ? e.code : undefined;
  const category = code ? "system-io" :
    /timeout|timed out|within .*seconds|stopped responding/i.test(text) ? "timeout" :
    /authorization|sign.in|oauth|invalid_grant|token.*(?:expired|refresh)|Google access|college account/i.test(text) ? "authorization" :
    /Drive changed|workspace changed|revision|account changed|account.*boundary|newer workspace/i.test(text) ? "workspace-boundary" :
    /Microsoft Word|win32com|\bCOM\b|PDF export/i.test(text) ? "word-or-pdf" :
    /python|helper|worker/i.test(text) ? "python-worker" :
    /fetch|network|temporarily unavailable|Drive request/i.test(text) ? "network-or-drive" :
    /Zod|Validation/i.test(String(e?.name)) || /invalid|unsupported|limit|too large|required|missing/i.test(text) ? "validation" :
    /already running|finish processing|wait for|busy/i.test(text) ? "busy" : "unclassified";
  const status = /\bDrive request failed \((\d{3})\)/.exec(text)?.[1];
  const officeCode = /Office code: (0x[0-9A-F]{8})/.exec(text)?.[1];
  const officeStage = /during (starting-word|opening-document|exporting-pdf)/.exec(text)?.[1];
  return { category, ...(code ? { code } : {}), ...(status ? { httpStatus: Number(status) } : {}),
    ...(officeCode ? { officeCode } : {}), ...(officeStage ? { officeStage } : {}) };
}

const operations = new Set([
  "runtime", "load", "save", "renderer-ready", "python-health", "inspect", "import-source", "paste-image",
  "cloud-status", "configure-google", "connect-drive", "check-updates", "restart-update", "export-diagnostics",
  "inspect-template", "import-questions", "generate", "list-documents", "sync-drive", "logout-cleanup",
  "open-document", "source-folder", "drive-sources", "store-pointer", "store-load", "store-save", "sync-status",
  "sync-run", "sync-pause", "sync-invalidate", "documents-list", "documents-file", "documents-run", "cleanup",
  "shutdown", "health", "snapshot-summary", "workflow", "open-word", "google-token", "export-pdf",
  "close-check", "conflict-review", "resolve-conflict", "sync-review", "sync-resolve", "export-configuration", "import-configuration", "store-save-generation",
]);
export const diagnosticOperation = (value: unknown): string => typeof value === "string" && operations.has(value) ? value : "unknown";

/** Summarize structured outcomes; never serialize payloads or returned records. */
export function diagnosticOutcome(value: any): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const details: Record<string, unknown> = {};
  for (const key of ["saved", "opened"] as const) if (typeof value[key] === "boolean") details[key] = value[key];
  if (Array.isArray(value.documents)) details.documents = value.documents.length;
  if (Array.isArray(value.failures)) {
    details.failures = value.failures.length;
    details.failureCategories = [...new Set(value.failures.map((failure: any) => diagnosticError(new Error(
      typeof failure?.message === "string" ? failure.message : "",
    )).category))];
  }
  if (Array.isArray(value.entries)) details.entries = value.entries.length;
  if (Array.isArray(value.warnings)) details.warnings = value.warnings.length;
  if (["disconnected", "syncing", "synced", "error", "conflict", "pending", "offline"].includes(value.state)) details.state = value.state;
  return details;
}
