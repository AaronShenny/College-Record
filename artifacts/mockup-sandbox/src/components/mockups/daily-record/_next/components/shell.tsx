import { useEffect, type ReactNode } from "react";
import { runSelectorIntent } from "./focus-intent";
import { AlertTriangle, BookOpen, FileText, Save, Settings, Trash2, X } from "lucide-react";
import { cloudLabel, useStore } from "../hooks/use-workspace";
import { fmtTime, href } from "./kit";

const NAV = [
  { key: "subjects", label: "Subjects", path: "/", icon: BookOpen },
  { key: "documents", label: "Documents", path: "/documents", icon: FileText },
  { key: "settings", label: "Settings", path: "/settings", icon: Settings },
  { key: "trash", label: "Trash", path: "/trash", icon: Trash2 },
];

export function SaveIndicator() {
  const { save, drafts } = useStore();
  const map = {
    idle: { dot: "good", text: "Saved locally" },
    saved: { dot: "good", text: `Saved locally${save.savedAt ? " " + fmtTime(save.savedAt) : ""}` },
    dirty: { dot: "", text: "Autosaving…" },
    saving: { dot: "busy", text: "Saving locally…" },
    error: { dot: "bad", text: "Local save failed" },
    invalid: { dot: "bad", text: "Not saved: invalid data" },
  }[save.kind];
  return <span data-testid="status-save" role="status"><i className={`dot ${map.dot}`} />{map.text}{drafts.size > 0 && save.kind !== "error" ? ` · ${drafts.size} field${drafts.size > 1 ? "s" : ""} need fixing` : ""}</span>;
}

function GenStatus() {
  const { gen, workspace } = useStore();
  if (gen.state === "idle") return null;
  const name = workspace?.subjects.find(s => s.id === gen.subjectId)?.name ?? "subject";
  const failures = gen.result?.failures.length ?? 0;
  const tone = gen.state === "running" ? "busy" : gen.state === "error" || failures ? "bad" : "good";
  const text = gen.state === "running" ? `Generating ${gen.count} program(s)…`
    : gen.state === "error" ? "Generation failed · view"
    : failures ? `${gen.result?.documents.length ?? 0} saved, ${failures} failed · view` : `${gen.result?.documents.length ?? 0} file(s) ready · view`;
  return <a className={`gen-chip ${tone}`} href={href(`/documents/${gen.subjectId ?? ""}`)} title={name} data-testid="link-generation-status" role={tone === "bad" ? "alert" : "status"}><i className={`dot ${tone}`} />{text}</a>;
}

export function Shell({ active, crumb, children }: { active: string; crumb: string; children: ReactNode }) {
  const { runtime, save, saveNow, toasts, dismiss, cloud, cloudError } = useStore();
  const drive = cloudLabel(cloud);
  useEffect(() => { runSelectorIntent(); }, [crumb]);
  const items = NAV.map(n => (
    <a key={n.key} href={href(n.path)} className={`nav-item ${active === n.key ? "active" : ""}`} aria-current={active === n.key ? "page" : undefined} data-testid={`link-nav-${n.key}`}>
      <n.icon size={16} aria-hidden="true" /><span>{n.label}</span>
    </a>
  ));
  const cloudProblem = cloudError ? `Drive status could not be read: ${cloudError}` : cloud?.connected && cloud.state === "error" ? `Drive sync error${cloud.message ? ": " + cloud.message : "."} Your work is still saved on this computer.` : null;
  return (
    <div className="crm">
      <div className="app-shell">
        <aside className="sidebar">
          <a className="brand" href={href("/")} aria-label="College Record Maker subjects" data-testid="link-brand">
            <span className="brand-mark">R</span>
            <span className="brand-copy"><span className="brand-name">Record maker</span><span className="brand-sub">College lab records</span></span>
          </a>
          <nav className="nav-list" aria-label="Main navigation">{items}</nav>
          <div className="sidebar-bottom">
            <a className="local-mini" href={href("/settings")} data-testid="text-account-mini"><b>{cloud?.connected && cloud.account ? cloud.account.name : "This computer only"}</b>{cloud?.connected && cloud.account ? cloud.account.email : "Drive not connected"}</a>
          </div>
        </aside>
        <main className="main">
          <nav className="mobile-nav" aria-label="Main navigation (compact)">{items}</nav>
          <div className="topbar">
            <div className="crumb">{crumb}</div>
            <div className="top-right">
              <GenStatus />
              <div className="save-area" aria-label="Save status">
                <SaveIndicator />
                <a href={href("/settings")} data-testid="status-drive" className={`drive-${drive.tone}`}><i className={`dot ${drive.tone === "good" ? "good" : drive.tone === "alert" ? "bad" : ""}`} />{cloudError ? "Drive status unavailable" : drive.text}</a>
                <button className="btn small" onClick={saveNow} data-testid="button-save-now"><Save size={12} /> Save Now</button>
              </div>
            </div>
          </div>
          {runtime?.mode === "browser-preview" && (
            <div className="preview-banner" role="note" data-testid="banner-preview">
              <AlertTriangle size={13} aria-hidden="true" />
              <span><b>Browser preview.</b> Work is stored in this browser only; Word PDF export and Google sign-in need the desktop app. <a className="inline-link" href={href("/settings")}>Details in Settings</a></span>
            </div>
          )}
          {(save.kind === "error" || save.kind === "invalid") && (
            <div className="preview-banner bad" role="alert" data-testid="banner-save-error">
              <AlertTriangle size={14} aria-hidden="true" />
              <span style={{ flex: 1 }}><b>Latest changes are not saved.</b> {save.message} Nothing was cleared.</span>
              <button className="btn small" onClick={saveNow} data-testid="button-retry-save">Retry save</button>
            </div>
          )}
          {cloudProblem && (
            <div className="preview-banner bad" role="alert" data-testid="banner-cloud-error">
              <AlertTriangle size={14} aria-hidden="true" />
              <span style={{ flex: 1 }}>{cloudProblem}</span>
              <a className="btn small" href={href("/settings")} data-testid="link-cloud-settings">Open Settings</a>
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

