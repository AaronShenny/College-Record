import { type ReactNode } from "react";
import { AlertTriangle, BookOpen, FileText, Save, Settings, Trash2, X } from "lucide-react";
import { cloudLabel, useStore } from "@/hooks/use-workspace";
import { fmtTime, href } from "./kit";

const NAV = [
  { key: "subjects", label: "Subjects", path: "/", icon: BookOpen },
  { key: "documents", label: "Documents", path: "/documents", icon: FileText },
];
const PREFS = [
  { key: "settings", label: "Settings", path: "/settings", icon: Settings },
  { key: "trash", label: "Trash", path: "/trash", icon: Trash2 },
];

export function SaveIndicator() {
  const { save, drafts } = useStore();
  const map = {
    idle: { dot: "good", text: "All saved" },
    saved: { dot: "good", text: `Saved${save.savedAt ? " " + fmtTime(save.savedAt) : ""}` },
    dirty: { dot: "", text: "Autosaving…" },
    saving: { dot: "busy", text: "Saving…" },
    error: { dot: "bad", text: "Local save failed" },
    invalid: { dot: "bad", text: "Not saved: invalid data" },
  }[save.kind];
  return <span data-testid="status-save" title={save.message} role="status"><i className={`dot ${map.dot}`} />{map.text}{drafts.size > 0 && save.kind !== "error" ? ` · ${drafts.size} field${drafts.size > 1 ? "s" : ""} to fix` : ""}</span>;
}

/** One compact status: local save + Drive, with Save Now. */
function StatusPill() {
  const { saveNow, cloud, cloudError } = useStore();
  const c = cloudLabel(cloud);
  const drive = cloudError ? "Drive status unavailable" : c.text;
  const bad = !!cloudError || c.tone === "alert";
  return <div className="status-pill">
    <SaveIndicator />
    <span className="sep" aria-hidden="true" />
    {bad ? <a href={href("/settings")} className="drive-alert" data-testid="status-drive">{drive} · Fix</a>
      : <span data-testid="status-drive" className={`drive-${c.tone}`}>{drive}</span>}
    <button className="btn small primary" onClick={saveNow} data-testid="button-save-now"><Save size={12} /> Save Now</button>
  </div>;
}

export function Shell({ active, crumb, children }: { active: string; crumb: ReactNode; children: ReactNode }) {
  const { runtime, save, saveNow, toasts, dismiss, cloud } = useStore();
  const items = (list: typeof NAV) => list.map(n => (
    <a key={n.key} href={href(n.path)} className={`nav-item ${active === n.key ? "active" : ""}`} aria-current={active === n.key ? "page" : undefined} data-testid={`link-nav-${n.key}`}>
      <n.icon size={16} aria-hidden="true" /><span>{n.label}</span>
    </a>
  ));
  return (
    <div className="crm">
      <div className="app-shell">
        <aside className="sidebar">
          <a className="brand" href={href("/")} aria-label="College Record Maker home" data-testid="link-brand">
            <span className="brand-mark">R</span>
            <span className="brand-copy"><span className="brand-name">Record maker</span><span className="brand-sub">Rajagiri lab records</span></span>
          </a>
          <nav className="nav-list" aria-label="Main navigation">{items(NAV)}</nav>
          <div className="sidebar-bottom">
            <nav className="nav-list" aria-label="Preferences">{items(PREFS)}</nav>
            <a href={href("/settings")} className="local-mini" data-testid="text-account-mini"><b>{cloud?.connected && cloud.account ? cloud.account.name : "Local workspace"}</b>{cloud?.connected && cloud.account ? <>{cloud.account.email}{cloud.lastSyncAt ? <><br />Last sync {fmtTime(cloud.lastSyncAt)}</> : null}</> : "On this device only"}</a>
          </div>
        </aside>
        <main className="main">
          <nav className="mobile-nav" aria-label="Main navigation (compact)">{items([...NAV, ...PREFS])}</nav>
          <div className="topbar">
            <div className="crumb">{crumb}</div>
            <StatusPill />
          </div>
          {runtime?.mode === "browser-preview" && (
            <div className="preview-banner" role="note" data-testid="banner-preview" title="Work is stored only in this browser. Word PDF conversion and Google sign-in need the installed desktop app.">
              <AlertTriangle size={13} aria-hidden="true" /><span><b>Browser preview</b> · stored in this browser only; PDF and Google sign-in need the desktop app.</span>
            </div>
          )}
          {(save.kind === "error" || save.kind === "invalid") && (
            <div className="preview-banner bad" role="alert" data-testid="banner-save-error">
              <AlertTriangle size={14} aria-hidden="true" />
              <span style={{ flex: 1 }}><b>Your latest changes are not saved.</b> {save.message} Nothing was cleared.</span>
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
