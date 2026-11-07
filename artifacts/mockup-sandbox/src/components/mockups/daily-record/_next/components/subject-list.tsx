import { useMemo, useState } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";
import type { Subject } from "../lib/contracts";
import { activePrograms, initials, programState } from "../hooks/use-workspace";
import { href } from "./kit";

export function SubjectList({ subjects, onNew }: { subjects: Subject[]; onNew: () => void }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const shown = subjects
      .filter(s => !t || s.name.toLowerCase().includes(t) || s.courseCode.toLowerCase().includes(t) || `semester ${s.semester}`.includes(t))
      .sort((a, b) => b.semester - a.semester || a.name.localeCompare(b.name));
    const m = new Map<number, Subject[]>();
    for (const s of shown) { if (!m.has(s.semester)) m.set(s.semester, []); m.get(s.semester)!.push(s); }
    return [...m.entries()];
  }, [subjects, q]);
  return (
    <div className="subj-list">
      <div className="subj-search">
        <label style={{ position: "relative", flex: 1 }}>
          <span className="sr-only">Search subjects</span>
          <Search size={15} className="search-icon" aria-hidden="true" />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search subjects by name, course code or semester" data-testid="input-search-subjects" autoFocus />
        </label>
        <button className="btn primary" onClick={onNew} data-testid="button-new-subject"><Plus size={14} /> New subject</button>
      </div>
      {groups.length === 0 && <div className="subj-none"><p>No subject matches "{q}".</p><button className="btn small" onClick={() => setQ("")} data-testid="button-clear-search">Clear search</button></div>}
      {groups.map(([sem, list]) => (
        <section key={sem} className="sem-group" aria-labelledby={`sem-${sem}`}>
          <h2 id={`sem-${sem}`} className="sem-head"><span>Semester {sem}</span><small>{list.length} subject{list.length === 1 ? "" : "s"}</small></h2>
          {list.map((s, i) => {
            const progs = activePrograms(s);
            const ready = progs.filter(p => programState(p, s).tone === "good").length;
            const tone = progs.length === 0 ? "neutral" : ready === progs.length ? "good" : "warn";
            return (
              <a className="subject-row" href={href(`/subject/${s.id}`)} key={s.id} data-testid={`link-subject-${s.id}`}>
                <span className={`subject-mark mark-${i % 4}`}>{initials(s.name)}</span>
                <span className="subject-info"><span className="subject-name">{s.name}</span>
                  <span className="subject-path">{s.courseCode || "No course code"}{s.template ? "" : " · no template yet"}</span></span>
                <span className="subject-prog" aria-label={`${ready} of ${progs.length} programs ready`}>
                  <span className="mini-track"><i style={{ transform: `scaleX(${progs.length ? ready / progs.length : 0})` }} /></span>
                  {progs.length ? `${ready}/${progs.length} ready` : "No programs"}</span>
                <span className={`badge ${tone}`}>{progs.length === 0 ? "Empty" : tone === "good" ? "Ready" : "In progress"}</span>
                <ChevronRight size={16} color="#8a9690" aria-hidden="true" />
              </a>
            );
          })}
        </section>
      ))}
    </div>
  );
}
