import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { bridge } from "@/lib/bridge";
import { workspaceSchema, type Program, type RuntimeInfo, type Subject, type Workspace } from "@/lib/contracts";

export type SaveKind = "idle" | "dirty" | "saving" | "saved" | "error" | "invalid";
export type SaveState = { kind: SaveKind; message?: string; savedAt?: string; storage?: string; pending?: number };
export type Toast = { id: number; text: string; tone: "info" | "error" };

type Store = {
  workspace: Workspace | null;
  loadError: string | null;
  reload: () => void;
  update: (fn: (w: Workspace) => Workspace) => void;
  save: SaveState;
  saveNow: () => void;
  runtime: RuntimeInfo | null;
  runtimeError: string | null;
  toasts: Toast[];
  notify: (text: string, tone?: "info" | "error") => void;
  dismiss: (id: number) => void;
  drafts: Set<string>;
  setDraft: (key: string, on: boolean) => void;
};

const Ctx = createContext<Store | null>(null);
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const nowIso = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [drafts, setDrafts] = useState<Set<string>>(new Set());

  const latest = useRef<Workspace | null>(null);
  const rev = useRef(0);
  const savedRev = useRef(0);
  const inFlight = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const lastSavedAt = useRef<string | undefined>(undefined);
  const statusRef = useRef<SaveKind>("idle");
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  const setStatus = useCallback((s: SaveState) => { statusRef.current = s.kind; setSave(s); }, []);

  const notify = useCallback((text: string, tone: "info" | "error" = "info") => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t.slice(-3), { id, text, tone }]);
    window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), tone === "error" ? 9000 : 4500);
  }, []);
  const dismiss = useCallback((id: number) => setToasts(t => t.filter(x => x.id !== id)), []);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (inFlight.current || !latest.current) return;
    if (savedRev.current === rev.current) return;
    const target = rev.current;
    const parsed = workspaceSchema.safeParse(latest.current);
    if (!parsed.success) {
      setStatus({ kind: "invalid", message: parsed.error.issues[0]?.message ?? "Workspace has invalid data.", savedAt: lastSavedAt.current });
      return;
    }
    inFlight.current = true;
    setStatus({ kind: "saving", savedAt: lastSavedAt.current });
    let failed = false;
    try {
      const receipt = await bridge.saveWorkspace(parsed.data);
      // Older completions never move savedRev backwards.
      savedRev.current = Math.max(savedRev.current, target);
      lastSavedAt.current = receipt.savedAt;
      setStatus({ kind: rev.current === target ? "saved" : "dirty", savedAt: receipt.savedAt, storage: receipt.storage, pending: receipt.pendingItems });
    } catch (e) {
      failed = true;
      setStatus({ kind: "error", message: errMsg(e), savedAt: lastSavedAt.current });
    } finally {
      inFlight.current = false;
      if (!failed && rev.current !== savedRev.current) void flush();
    }
  }, [setStatus]);

  const update = useCallback((fn: (w: Workspace) => Workspace) => {
    if (!latest.current) return;
    const next = fn(latest.current);
    if (next === latest.current) return;
    latest.current = next;
    rev.current += 1;
    setWorkspace(next);
    if (!inFlight.current) setStatus({ kind: "dirty", savedAt: lastSavedAt.current });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 900);
  }, [flush, setStatus]);

  const saveNow = useCallback(() => {
    if (savedRev.current === rev.current && statusRef.current !== "error") { notify("Everything is already saved locally."); return; }
    if (statusRef.current === "error") savedRev.current = Math.min(savedRev.current, rev.current - 1);
    void flush();
  }, [flush, notify]);

  const reload = useCallback(async () => {
    setLoadError(null); setWorkspace(null);
    try {
      const w = await bridge.loadWorkspace();
      latest.current = w; rev.current = 0; savedRev.current = 0;
      setWorkspace(w); setStatus({ kind: "idle" });
    } catch (e) { setLoadError(errMsg(e)); }
  }, [setStatus]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    bridge.getRuntime().then(setRuntime).catch(e => setRuntimeError(errMsg(e)));
  }, []);
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      const k = statusRef.current;
      if (k === "dirty" || k === "saving" || k === "error" || k === "invalid" || draftsRef.current.size > 0) {
        if (k === "dirty") void flush();
        e.preventDefault(); e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [flush]);

  const setDraft = useCallback((key: string, on: boolean) => {
    setDrafts(d => {
      if (d.has(key) === on) return d;
      const n = new Set(d); if (on) n.add(key); else n.delete(key); return n;
    });
  }, []);

  return <Ctx.Provider value={{ workspace, loadError, reload: () => void reload(), update, save, saveNow, runtime, runtimeError, toasts, notify, dismiss, drafts, setDraft }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("WorkspaceProvider missing");
  return s;
}

/* Pure helpers */
export const activeSubjects = (w: Workspace) => w.subjects.filter(s => !s.trashedAt);
export const activePrograms = (s: Subject) => s.programs.filter(p => !p.trashedAt).sort((a, b) => a.number - b.number);
export const pad = (n: number) => String(n).padStart(2, "0");
export const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
export const nextNumber = (s: Subject) => { const used = new Set(activePrograms(s).map(p => p.number)); let n = 1; while (used.has(n)) n++; return n; };
export const initials = (name: string) => name.split(/\s+/).filter(w => /^[A-Za-z]/.test(w) && !/^(of|and|the|lab)$/i.test(w)).slice(0, 2).map(w => w[0]!.toUpperCase()).join("") || "S";

export function programChecks(p: Program) {
  const hasSource = p.sources.some(s => s.include && s.code.trim().length > 0);
  const hasOutput = p.outputs.some(o => o.include);
  return [
    { label: "Title entered", ok: p.title.trim().length > 0 },
    { label: "Question entered", ok: p.question.trim().length > 0 },
    { label: "Included source with code", ok: hasSource },
    { label: "Included output", ok: hasOutput },
  ];
}
export function programState(p: Program): { tone: "good" | "warn" | "alert"; label: string; missing: string[] } {
  const missing = programChecks(p).filter(c => !c.ok).map(c => c.label.toLowerCase());
  if (missing.length === 0) return p.outputMayBeStale ? { tone: "warn", label: "Output may be outdated", missing } : { tone: "good", label: "Ready", missing };
  if (missing.length >= 3) return { tone: "alert", label: "Just started", missing };
  return { tone: "warn", label: "Incomplete", missing };
}

export function mapSubject(w: Workspace, id: string, fn: (s: Subject) => Subject): Workspace {
  return { ...w, subjects: w.subjects.map(s => (s.id === id ? fn(s) : s)) };
}
export function mapProgram(w: Workspace, sid: string, pid: string, fn: (p: Program) => Program, markStale = false): Workspace {
  const t = nowIso();
  return mapSubject(w, sid, s => ({ ...s, updatedAt: t, programs: s.programs.map(p => {
    if (p.id !== pid) return p;
    const n = fn(p);
    return { ...n, updatedAt: t, outputMayBeStale: markStale && n.outputs.length > 0 ? true : n.outputMayBeStale };
  }) }));
}
