import { type ReactNode } from "react";
import { AlertTriangle, BookOpen, CircleSlash, FileText, Home, Settings, Trash2, X } from "lucide-react";
import { useStore } from "@/hooks/use-workspace";
import { fmtTime, href } from "./kit";

const NAV = [
  { key: "dashboard", label: "Dashboard", path: "/", icon: Home },
  { key: "subjects", label: "Subjects", path: "/subjects", icon: BookOpen },
  { key: "documents", label: "Documents", path: "/documents", icon: FileText },
];
const PREFS = [
  { key: "settings", label: "Settings", path: "/settings", icon: Settings },
  { key: "trash", label: "Trash", path: "/trash", icon: Trash2 },
];

export function SaveIndicator() {
  const { save, drafts } = useStore();
  const map = {
    idle: { dot: "good", text: "No unsaved changes" },
    saved: { dot: "good", text: `Saved locally${save.savedAt ? " · " + fmtTime(save.savedAt) : ""}` },
    dirty: { dot: "", text: "Unsaved changes · autosaving" },
    saving: { dot: "busy", text: "Saving locally…" },
    error: { dot: "bad", text: "Local save failed" },
    invalid: { dot: "bad", text: "Not saved: invalid data" },
  }[save.kind];
  return <span data-testid="status-save" title={save.message} role="status"><i className={`dot ${map.dot}`} />{map.text}{drafts.size > 0 && save.kind !== "error" ? ` · ${drafts.size} field${drafts.size > 1 ? "s" : ""} not yet valid` : ""}</span>;
}

export function Shell({ active, crumb, children }: { active: string; crumb: string; children: ReactNode }) {
  const { runtime, save, saveNow, toasts, dismiss } = useStore();
  const items = (list: typeof NAV) => list.map(n => (
    <a key={n.key} href={href(n.path)} className={`nav-item ${active === n.key ? "active" : ""}`} aria-current={active === n.key ? "page" : undefined} data-testid={`link-nav-${n.key}`}>
      <n.icon size={16} aria-hidden="true" /><span>{n.label}</span>
    </a>
  ));
  return (
    <div className="crm">
      <div className="app-shell">
        <aside className="sidebar">
          <a className="brand" href={href("/")} aria-label="College Record Maker dashboard" data-testid="link-brand">
            <span className="brand-mark">R</span>
            <span className="brand-copy"><span className="brand-name">Record maker</span><span className="brand-sub">College lab records</span></span>
          </a>
          <div><div className="nav-label">Workspace</div><nav className="nav-list" aria-label="Main navigation">{items(NAV)}</nav></div>
          <div><div className="nav-label">Preferences</div><nav className="nav-list" aria-label="Preferences">{items(PREFS)}</nav></div>
          <div className="sidebar-bottom">
            <div className="local-mini"><b>Local workspace</b>Not a Google account. Sign-in and Drive sync arrive in a later milestone.</div>
          </div>
        </aside>
        <main className="main">
          <nav className="mobile-nav" aria-label="Main navigation (compact)">{items([...NAV, ...PREFS])}</nav>
          <div className="topbar">
            <div className="crumb">College Record Maker <span aria-hidden="true">/</span> <strong>{crumb}</strong></div>
            <div className="top-right">
              <SaveIndicator />
              <span><CircleSlash size={11} style={{ verticalAlign: "-1px", marginRight: 5 }} aria-hidden="true" />Drive not connected</span>
            </div>
          </div>
          {runtime?.mode === "browser-preview" && (
            <div className="preview-banner" role="note" data-testid="banner-preview">
              <AlertTriangle size={14} aria-hidden="true" />
              <span><b>Development preview.</b> Your work is stored only in this browser. Native Windows files and the Python helper require the installed desktop app.</span>
            </div>
          )}
          {(save.kind === "error" || save.kind === "invalid") && (
            <div className="preview-banner" style={{ background: "#fcf0e9", color: "#7d422e", borderColor: "#e7c8ba" }} role="alert" data-testid="banner-save-error">
              <AlertTriangle size={14} aria-hidden="true" />
              <span style={{ flex: 1 }}><b>Your latest changes are not saved.</b> {save.message} Your workspace is still open; nothing was cleared.</span>
              <button className="btn small" onClick={saveNow} data-testid="button-retry-save">Retry save</button>
            </div>
          )}
          {children}
        </main>
      </div>
      <div className="toasts" aria-live="polite">
        {toasts.map(t => <div key={t.id} className={`toast ${t.tone === "error" ? "error" : ""}`} role={t.tone === "error" ? "alert" : "status"}>{t.text}<button aria-label="Dismiss message" onClick={() => dismiss(t.id)}><X size={14} /></button></div>)}
      </div>
    </div>
  );
}
