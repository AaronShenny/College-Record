import { bridge } from "./bridge";
import type { TemplateConfig, Workspace, SourceFile } from "./contracts";

export type ImportRow = { number: number | null; title: string; question: string; sourcePages?: number[]; confidence?: string };
export type ImportResult = { entries?: ImportRow[]; columns?: string[]; rows?: Record<string, string>[]; warnings: string[] };
export type DocumentFile = { id: string; name: string; format: "docx" | "pdf"; subjectId: string; programIds: string[]; createdAt: string; byteLength: number; dataBase64?: string };
export type GenerationResult = { documents: DocumentFile[]; failures: { number?: number; message: string }[]; snapshotAt: string };
export type CloudStatus = { connected: boolean; configured: boolean; account?: { name: string; email: string }; state: string; message?: string; lastSyncAt?: string; pending?: boolean; busy?: boolean; switching?: boolean; revision?: string; syncedRevision?: string };
export async function feature<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (window.recordMaker?.workflow) return window.recordMaker.workflow(action, payload);
  if (location.protocol === "file:" || navigator.userAgent.includes("Electron/")) throw new Error("Desktop workflow bridge is unavailable; no browser fallback was used.");
  const response = await fetch(`${import.meta.env.BASE_URL}__record-maker/engine`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Record-Maker-Preview": "1" },
    body: JSON.stringify({ action, payload }),
  });
  const result = await response.json().catch(() => { throw new Error("The local processing service is unavailable. Start the development server or use the installed desktop app."); });
  if (!response.ok || result.error) throw new Error(result.error || "Processing failed");
  return result;
}
export async function base64File(file: File): Promise<string> {
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose a file smaller than 20 MB.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onerror = () => reject(new Error("File could not be read"));
    reader.onload = () => resolve(String(reader.result).split(",")[1]!); reader.readAsDataURL(file);
  });
}
export async function inspectTemplate(file: File): Promise<{ template: TemplateConfig; warnings: string[] }> {
  if (!file.name.toLowerCase().endsWith(".docx")) throw new Error("Upload a .docx Word template, not .doc or .docm.");
  const dataBase64 = await base64File(file);
  const result = await feature<{ placeholders: string[]; warnings: string[] }>("inspect-template", { dataBase64 });
  return { template: { id: crypto.randomUUID(), name: file.name, dataBase64, placeholders: result.placeholders, mappings: {}, reviewed: false, uploadedAt: new Date().toISOString() }, warnings: result.warnings };
}
export async function importQuestions(file: File, pages = "", subjectId?: string): Promise<ImportResult> {
  const dataBase64 = await base64File(file);
  const result = await feature<ImportResult>("import-questions", { name: file.name, dataBase64, pages, subjectId });
  if (!window.recordMaker) {
    const db = await docsDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("imports", "readwrite");
        tx.objectStore("imports").put({ id: crypto.randomUUID(), name: file.name, dataBase64, subjectId, importedAt: new Date().toISOString() });
        tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(new Error("The original import could not be archived in browser storage."));
      });
    } finally { db.close(); }
  }
  return result;
}
const DOCS_DB = "record-maker-generated-documents";
async function docsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DOCS_DB, 2); r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains("documents")) r.result.createObjectStore("documents", { keyPath: "id" });
      if (!r.result.objectStoreNames.contains("imports")) r.result.createObjectStore("imports", { keyPath: "id" });
    };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(new Error("Document storage could not be opened"));
  });
}
async function keepDocuments(documents: DocumentFile[]) {
  const db = await docsDb();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("documents", "readwrite");
    for (const doc of documents) tx.objectStore("documents").put(doc);
    tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(new Error("Generated files could not be saved in this browser. Keep the page open and retry."));
  }); } finally { db.close(); }
}
export async function generateDocuments(workspace: Workspace, subjectId: string, programIds: string[], mode: "individual" | "combined", pdf: boolean): Promise<GenerationResult> {
  const subject = workspace.subjects.find(item => item.id === subjectId);
  if (!subject) throw new Error("The selected subject is missing.");
  const selected = new Set(programIds);
  // IPC/JSON serializes this immutable selection before yielding. Do not clone
  // unrelated subjects, code and screenshot data on the UI thread.
  const snapshot = { ...workspace, subjects: [{ ...subject, programs: subject.programs.filter(program => selected.has(program.id)) }] };
  const result = await feature<GenerationResult>("generate", { workspace: snapshot, subjectId, programIds, mode, pdf });
  if (!window.recordMaker) await keepDocuments(result.documents);
  return result;
}
export async function listDocuments(): Promise<DocumentFile[]> {
  if (window.recordMaker) return feature("list-documents");
  const db = await docsDb();
  try { return await new Promise((resolve, reject) => {
    const r = db.transaction("documents", "readonly").objectStore("documents").getAll();
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(new Error("Saved documents could not be read"));
  }); } finally { db.close(); }
}
export async function openDocument(doc: DocumentFile, action: "open" | "download" = "download") {
  if (window.recordMaker) return feature("open-document", { id: doc.id, action });
  if (!doc.dataBase64) throw new Error("Document bytes are missing from local storage.");
  const bytes = Uint8Array.from(atob(doc.dataBase64), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: doc.format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  const a = document.createElement("a"); a.href = url; a.download = doc.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function localSourceFolder(): Promise<SourceFile[]> {
  return feature("source-folder");
}
export const cloudStatus = () => feature<CloudStatus>("cloud-status");
export const exportDiagnostics = () => feature<{ saved: boolean }>("export-diagnostics");
export const exportSavedPdf = (id: string) => feature<{ documents: DocumentFile[] }>("export-pdf", { id });
export const connectDrive = () => feature<CloudStatus>("connect-drive");
export const syncDrive = () => feature<CloudStatus>("sync-drive");
export const configureGoogle = () => feature<CloudStatus>("configure-google");
export const logoutCleanup = () => feature<CloudStatus>("logout-cleanup");
export const checkUpdates = () => feature<{ state: string; message?: string }>("check-updates");
export const restartForUpdate = () => feature("restart-update");
