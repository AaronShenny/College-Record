import { useMemo, useState } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";
import type { Subject } from "@/lib/contracts";
import { activePrograms, initials, pad, programState, slug } from "@/hooks/use-workspace";
import { href } from "./kit";

export function SubjectList({ subjects, onNew }: { subjects: Subject[]; onNew: () => void }) {
  const [q, setQ] = useState(""); const [sem, setSem] = useState("all");
  const semesters = useMemo(() => [...new Set(subjects.map(s => s.semester))].sort((a, b) => a - b), [subjects]);
  const shown = subjects
    .filter(s => sem === "all" || String(s.semester) === sem)
    .filter(s => { const t = q.trim().toLowerCase(); return !t || s.name.toLowerCase().includes(t) || s.courseCode.toLowerCase().includes(t); })
    .sort((a, b) => a.semester - b.semester || a.name.localeCompare(b.name));
  return (
    <>
      <div className="subject-filters">
        <label style={{ position: "relative", flex: 1 }}>
          <span className="sr-only">Search subjects</span>
          <Search size={14} style={{ position: "absolute", left: 10, top: 11, color: "var(--muted)" }} aria-hidden="true" />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or course code" style={{ paddingLeft: 30 }} data-testid="input-search-subjects" />
        </label>
        <label><span className="sr-only">Filter by semester</span>
          <select value={sem} onChange={e => setSem(e.target.value)} data-testid="select-semester-filter">
            <option value="all">All semesters</option>
            {semesters.map(s => <option key={s} value={String(s)}>Semester {s}</option>)}
          </select></label>
      </div>
      {shown.length === 0 && <p className="hint" style={{ padding: "14px 8px" }}>No subjects match this search. Clear the filter to see all {subjects.length}.</p>}
      {shown.map((s, i) => {
        const progs = activePrograms(s);
        const ready = progs.filter(p => programState(p).tone === "good").length;
        const tone = progs.length === 0 ? "neutral" : ready === progs.length ? "good" : "warn";
        return (
          <a className="subject-row" href={href(`/subject/${s.id}`)} key={s.id} data-testid={`link-subject-${s.id}`}>
            <span className={`subject-mark mark-${i % 4}`}>{initials(s.name)}</span>
            <span className="subject-info"><span className="subject-name">{s.name}{s.courseCode && <span className="muted" style={{ fontWeight: 500 }}> · {s.courseCode}</span>}</span>
              <span className="subject-path mono">semester-{pad(s.semester)} / {slug(s.name)}</span></span>
            <span className="subject-last">{progs.length ? `${ready} of ${progs.length} ready` : "No programs yet"}</span>
            <span className={`badge ${tone}`}>{progs.length === 0 ? "Empty" : tone === "good" ? "Ready" : "In progress"}</span>
            <ChevronRight size={16} color="#8a9690" aria-hidden="true" />
          </a>
        );
      })}
      <button className="add-subject" onClick={onNew} data-testid="button-add-subject-inline"><Plus size={14} /> Create a subject record</button>
    </>
  );
}
