import { RotateCcw } from "lucide-react";
import { Shell } from "@/components/shell";
import { EmptyState, PageHead, fmtTime } from "@/components/kit";
import { activePrograms, mapSubject, nowIso, nextNumber, pad, useStore } from "@/hooks/use-workspace";

export default function TrashPage() {
  const { workspace, update, notify } = useStore();
  const trashedSubjects = workspace!.subjects.filter(s => s.trashedAt);
  const trashedPrograms = workspace!.subjects.flatMap(s => s.programs.filter(p => p.trashedAt).map(p => ({ s, p })));
  const restoreSubject = (id: string) => { update(w => mapSubject(w, id, s => ({ ...s, trashedAt: null, updatedAt: nowIso() }))); notify("Subject restored."); };
  const restoreProgram = (sid: string, pid: string) => {
    let note = "Program restored.";
    update(w => mapSubject(w, sid, s => {
      const p = s.programs.find(x => x.id === pid)!;
      const clash = activePrograms(s).some(x => x.number === p.number);
      const num = clash ? nextNumber(s) : p.number;
      if (clash) note = `Program restored as number ${pad(num)} because ${pad(p.number)} is now used.`;
      return { ...s, updatedAt: nowIso(), programs: s.programs.map(x => x.id === pid ? { ...x, trashedAt: null, number: num, updatedAt: nowIso() } : x) };
    }));
    notify(note);
  };
  const empty = trashedSubjects.length === 0 && trashedPrograms.length === 0;
  return (
    <Shell active="trash" crumb="Trash">
      <div className="page">
        <PageHead eyebrow="Recoverable" title="Trash" description="Items here can always be restored. Permanent deletion is intentionally unavailable until a retention policy is decided." />
        {empty ? <div className="panel"><EmptyState mark="0" title="Trash is empty">Subjects and programs you move to Trash appear here with a Restore button.</EmptyState></div> : (
          <section className="panel panel-pad">
            <table className="table">
              <thead><tr><th>Item</th><th>Belongs to</th><th>Trashed</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {trashedSubjects.map(s => <tr key={s.id}><td><b>{s.name}</b> <span className="badge neutral">Subject · {s.programs.length} programs</span></td><td>Semester {s.semester}</td><td className="muted">{fmtTime(s.trashedAt!)}</td>
                  <td><div className="row-actions"><button className="btn small" onClick={() => restoreSubject(s.id)} data-testid={`button-restore-subject-${s.id}`}><RotateCcw size={12} /> Restore</button></div></td></tr>)}
                {trashedPrograms.map(({ s, p }) => <tr key={p.id}><td><span className="mono" style={{ color: "#8f6b44" }}>{pad(p.number)}</span> <b>{p.title || "Untitled program"}</b></td><td>{s.name}{s.trashedAt && <span className="hint"> (subject also in Trash)</span>}</td><td className="muted">{fmtTime(p.trashedAt!)}</td>
                  <td><div className="row-actions"><button className="btn small" onClick={() => restoreProgram(s.id, p.id)} data-testid={`button-restore-program-${p.id}`}><RotateCcw size={12} /> Restore</button></div></td></tr>)}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </Shell>
  );
}
