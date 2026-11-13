import type { NativeBoot } from "@/lib/tauri-bridge";
import { href, BrandMark } from "./kit";
import { useEffect } from "react";

/** A distinct read-only projection. It never becomes Workspace or autosave input. */
export function StartupDashboard({ boot, opening }: { boot: NativeBoot; opening: boolean }) {
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => window.recordMakerSummaryPainted?.());
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, []);
  const summary = boot.cache!.summary;
  const last = summary.subjects.flatMap(subject => subject.programs.map(program => ({ subject, program })))
    .sort((a, b) => b.program.updatedAt.localeCompare(a.program.updatedAt))[0];
  return <div className="crm"><div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href={href("/")}><BrandMark /><span className="brand-copy"><span className="brand-name">Recordly</span><span className="brand-sub">by extapano</span></span></a>
      <nav className="nav-list" aria-label="Main navigation">
        {[["Subjects", "/"], ["Documents", "/documents"], ["Settings", "/settings"], ["Trash", "/trash"]].map(([label, path]) =>
          <a className={`nav-item ${path === "/" ? "active" : ""}`} href={href(path!)} key={label}>{label}</a>)}
      </nav>
      <div className="sidebar-bottom"><div className="local-mini"><b>{boot.name || "Your workspace"}</b>{boot.email}</div></div>
    </aside>
    <main className="main">
      <div className="topbar"><div className="crumb">Subjects</div><div className="save-area" role="status">
        <span>Saved on this computer</span><span>Drive check pending</span>
      </div></div>
      <div className="page home">
        <div className="home-head"><div><div className="eyebrow">Your record desk</div><h1>Subjects</h1></div>
          {last && <a className="resume" data-testid="link-resume" href={href(`/program/${last.subject.id}/${last.program.id}`)}>
            <span className="kicker">Continue</span><span><b className="mono">{String(last.program.number).padStart(2, "0")}</b> {last.program.title || "Untitled program"} · {last.subject.name}</span>
          </a>}
        </div>
        <p className="hint" role="status">{opening ? "Opening your selected page. Source files and screenshots are loading…" : "Your saved subjects are available. Editing opens as the complete records finish loading."}</p>
        <div style={{ display: "grid", gap: 12 }}>
          {summary.subjects.map(subject => <a className="panel panel-pad" href={href(`/subject/${subject.id}`)} key={subject.id} style={{ color: "inherit", textDecoration: "none" }}>
            <div className="eyebrow">Semester {subject.semester} {subject.courseCode && `· ${subject.courseCode}`}</div>
            <h2>{subject.name}</h2><p className="hint">{subject.programs.length} programs · {subject.programs.filter(p => p.state === "ready").length} ready</p>
          </a>)}
        </div>
      </div>
    </main>
  </div></div>;
}
