import type { ReactNode } from "react";

const items = [
  ["Dashboard", "/__mockup/preview/college-record-maker/Dashboard", "⌂"],
  ["Subjects", "/__mockup/preview/college-record-maker/Subject", "▤"],
  ["Documents", "/__mockup/preview/college-record-maker/Documents", "▧"],
  ["Settings", "/__mockup/preview/college-record-maker/Settings", "⚙"],
  ["Trash", "/__mockup/preview/college-record-maker/Trash", "⌑"],
];

export function Chrome({ active, children }: { active: string; children: ReactNode }) {
  return <div className="crm"><div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/__mockup/preview/college-record-maker/Dashboard" aria-label="College Record Maker dashboard">
        <span className="brand-mark">R</span><span className="brand-copy"><span className="brand-name">Record maker</span><span className="brand-sub">Rajagiri study desk</span></span>
      </a>
      <div><div className="nav-label">Workspace</div><nav className="nav-list" aria-label="Main navigation">
        {items.slice(0,3).map(([label, href, glyph]) => <a key={label} href={href} className={`nav-item ${active===label?"active":""}`}><span className="nav-glyph" aria-hidden="true">{glyph}</span><span>{label}</span></a>)}
      </nav></div>
      <div><div className="nav-label">Preferences</div><nav className="nav-list" aria-label="Preferences">
        {items.slice(3).map(([label, href, glyph]) => <a key={label} href={href} className={`nav-item ${active===label?"active":""}`}><span className="nav-glyph" aria-hidden="true">{glyph}</span><span>{label}</span></a>)}
      </nav></div>
      <div className="sidebar-bottom">
        <div className="student-mini"><span className="avatar">RS</span><span className="student-copy"><span className="student-name">Rajagiri student</span><span className="student-email">student@rajagiri.edu</span></span></div>
        <div className="hint" style={{padding:"0 8px"}}>Personal workspace · sample data</div>
      </div>
    </aside>
    <main className="main"><div className="topbar"><div className="crumb">College Record Maker <span aria-hidden="true">/</span> <strong>{active}</strong></div><div className="top-right"><span><i className="sync-dot"/> <span className="sync-text">Offline sample · local changes only</span></span><span aria-hidden="true">⌄</span></div></div>{children}</main>
  </div></div>;
}

export function PageHead({eyebrow,title,description,actions}: {eyebrow:string;title:string;description:string;actions?:ReactNode}) {
  return <div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="subhead">{description}</p></div><div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>{actions}<span className="sample-tag">Prototype · sample data</span></div></div>;
}

export function TinyIcon({children}:{children:ReactNode}) { return <span aria-hidden="true" style={{fontFamily:"'DM Mono',monospace"}}>{children}</span>; }
