import { useMemo, useState } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";
import type { Subject } from "@/lib/contracts";
import { activePrograms, initials, programState } from "@/hooks/use-workspace";
import { href } from "./kit";

export function SubjectList({ subjects, onNew }: { subjects: Subject[]; onNew: () => void }) {
  const [q, setQ] = useState(""); const [sem, setSem] = useState("all");
  const semesters = useMemo(() => [...new Set(subjects.map(s => s.semester))].sort((a, b) => b - a), [subjects]);
  const shown = subjects
    .filter(s => sem === "all" || String(s.semester) === sem)
    .filter(s => { const t = q.trim().toLowerCase(); return !t || s.name.toLowerCase().includes(t) || s.courseCode.toLowerCase().includes(t); })
    .sort((a, b) => b.semester - a.semester || a.name.localeCompare(b.name));
  const groups = semesters.map(n => [n, shown.filter(s => s.semester === n)] as const).filter(([, l]) => l.length);
  return (
    <>
      <div className="subject-filters">
        <label className="search-box">
          <span className="sr-only">Search subjects</span>
          <Search size={15} aria-hidden="true" />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Find a subject or course code" data-testid="input-search-subjects" autoFocus />
        </label>
        <div className="sem-tabs" role="group" aria-label="Filter by semester">
          <button className={sem === "all" ? "on" : ""} aria-pressed={sem === "all"} onClick={() => setSem("all")} data-testid="select-semester-filter">All</button>
          {semesters.map(s => <button key={s} className={sem === String(s) ? "on" : ""} aria-pressed={sem === String(s)} onClick={() => setSem(String(s))} data-testid={`button-sem-${s}`}>S{s}</button>)}
        </div>
      </div>
      {shown.length === 0 && <p className="hint" style={{ padding: "14px 8px" }}>No subjects match. <button className="linkish" onClick={() => { setQ(""); setSem("all"); }}>Clear filters</button> to see all {subjects.length}.</p>}
      {groups.map(([n, list]) => <section key={n} className="sem-group" aria-label={`Semester ${n}`}>
        <div className="sem-label"><span>Semester {n}</span><i /></div>
        {list.map(s => {
          const progs = activePrograms(s);
          const ready = progs.filter(p => programState(p, s).tone === "good").length;
          const tone = progs.length === 0 ? "neutral" : ready === progs.length ? "good" : "warn";
          return (
            <a className="subject-row" href={href(`/subject/${s.id}`)} key={s.id} data-testid={`link-subject-${s.id}`}>
              <span className={`subject-mark mark-${s.semester % 4}`}>{initials(s.name)}</span>
              <span className="subject-info"><span className="subject-name">{s.name}</span>
                <span className="subject-path">{s.courseCode || "No course code"}{!s.template && " · no template yet"}</span></span>
              <span className="subject-meter" aria-label={`${ready} of ${progs.length} ready`}><i style={{ transform: `scaleX(${progs.length ? ready / progs.length : 0})` }} /></span>
              <span className={`badge ${tone}`}>{progs.length ? `${ready}/${progs.length} ready` : "Empty"}</span>
              <ChevronRight size={16} color="#8a9690" aria-hidden="true" />
            </a>
          );
        })}
      </section>)}
      <button className="add-subject" onClick={onNew} data-testid="button-add-subject-inline"><Plus size={14} /> New subject</button>
    </>
  );
}
