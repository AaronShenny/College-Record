import { useState } from "react";
import { ArrowLeft, FileInput, FileText, LayoutTemplate, Pencil, Plus, Trash2 } from "lucide-react";
import { Shell } from "@/components/shell";
import { EmptyState, PageHead, fmtTime, go, href } from "@/components/kit";
import { ConfirmDialog, ProgramDialog, SubjectDialog } from "@/components/dialogs";
import { activePrograms, mapSubject, nowIso, pad, programState, slug, useStore } from "@/hooks/use-workspace";

export default function SubjectPage({ id }: { id: string }) {
  const { workspace, update, notify } = useStore();
  const subject = workspace!.subjects.find(s => s.id === id);
  const [edit, setEdit] = useState(false); const [add, setAdd] = useState(false);
  const [trashSubject, setTrashSubject] = useState(false); const [trashProg, setTrashProg] = useState<string | null>(null);

  if (!subject || subject.trashedAt) {
    return <Shell active="subjects" crumb="Subject"><div className="page"><div className="panel">
      <EmptyState mark="?" title={subject ? "This subject is in Trash" : "Subject not found"} action={<a className="btn primary" href={href(subject ? "/trash" : "/subjects")}>{subject ? "Open Trash" : "Back to subjects"}</a>}>
        {subject ? "Restore it from Trash to keep editing. Nothing inside it was removed." : "It may have been moved or this link is out of date."}
      </EmptyState></div></div></Shell>;
  }
  const progs = activePrograms(subject);
  const target = progs.find(p => p.id === trashProg);
  return (
    <Shell active="subjects" crumb={subject.name}>
      <div className="page">
        <a className="btn small ghost" href={href("/subjects")} style={{ marginBottom: 12, paddingLeft: 0 }}><ArrowLeft size={13} /> All subjects</a>
        <PageHead eyebrow={`Semester ${subject.semester}${subject.courseCode ? " · " + subject.courseCode : ""}`} title={subject.name}
          description={`semester-${pad(subject.semester)} / ${slug(subject.name)} · ${progs.length} program${progs.length === 1 ? "" : "s"}`}
          actions={<>
            <button className="btn" onClick={() => setEdit(true)} data-testid="button-rename-subject"><Pencil size={13} /> Rename</button>
            <button className="btn danger" onClick={() => setTrashSubject(true)} data-testid="button-trash-subject"><Trash2 size={13} /> Move to Trash</button>
            <button className="btn primary" onClick={() => setAdd(true)} data-testid="button-new-program"><Plus size={14} /> New program</button>
          </>} />
        <div className="subject-actions">
          <a className="sa-card" href={href(`/template/${subject.id}`)} data-testid="link-template"><LayoutTemplate size={18} /><span><b>Template & mapping</b><small>{subject.template ? `${subject.template.name} · ${subject.template.reviewed ? "reviewed" : "needs review"}` : "No Word template yet"}</small></span></a>
          <a className="sa-card" href={href(`/import/${subject.id}`)} data-testid="link-import"><FileInput size={18} /><span><b>Import questions & code</b><small>PDF or CSV list, optional source folder</small></span></a>
          <a className="sa-card" href={href(`/documents/${subject.id}`)} data-testid="link-documents"><FileText size={18} /><span><b>Generate records</b><small>Word files, optional PDF</small></span></a>
        </div>
        <section className="panel panel-pad">
          {progs.length === 0 ? (
            <EmptyState mark={pad(1)} title="No programs yet" action={<button className="btn primary" onClick={() => setAdd(true)}><Plus size={14} /> Add program 1</button>}>
              Programs are numbered like your record book. Add the first one, then paste your code and attach the output screenshot.
            </EmptyState>
          ) : (
            <div style={{ overflowX: "auto" }}><table className="table">
              <thead><tr><th style={{ width: 60 }}>No.</th><th>Title</th><th>Sources</th><th>Outputs</th><th>Status</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{progs.map(p => { const st = programState(p, subject); return (
                <tr key={p.id} data-testid={`row-program-${p.id}`}>
                  <td className="mono" style={{ color: "#8f6b44" }}>{pad(p.number)}</td>
                  <td><a href={href(`/program/${subject.id}/${p.id}`)} style={{ fontWeight: 700 }}>{p.title || <span className="muted">Untitled program</span>}</a></td>
                  <td>{p.sources.filter(s => s.include).length}/{p.sources.length}</td>
                  <td>{p.outputs.filter(o => o.include).length}/{p.outputs.length}</td>
                  <td><span className={`badge ${st.tone}`} title={st.missing.length ? "Missing: " + st.missing.join(", ") : undefined}>{st.label}</span></td>
                  <td className="muted" style={{ fontSize: 12 }}>{fmtTime(p.updatedAt)}</td>
                  <td><div className="row-actions">
                    <button className="btn small" onClick={() => go(`/program/${subject.id}/${p.id}`)} data-testid={`button-open-${p.id}`}>Open</button>
                    <button className="icon-btn" aria-label={`Move program ${p.number} to Trash`} onClick={() => setTrashProg(p.id)} data-testid={`button-trash-${p.id}`}><Trash2 size={14} /></button>
                  </div></td>
                </tr>); })}</tbody>
            </table></div>
          )}
        </section>
      </div>
      <SubjectDialog open={edit} onClose={() => setEdit(false)} subject={subject} />
      <ProgramDialog open={add} onClose={() => setAdd(false)} subject={subject} />
      <ConfirmDialog open={trashSubject} onClose={() => setTrashSubject(false)} title="Move subject to Trash?" confirmLabel="Move to Trash"
        body={`"${subject.name}" and its ${progs.length} program(s) will move to Trash. You can restore everything from Trash at any time; nothing is permanently deleted.`}
        onConfirm={() => { update(w => mapSubject(w, subject.id, s => ({ ...s, trashedAt: nowIso(), updatedAt: nowIso() }))); notify("Subject moved to Trash. Restore it from Trash."); go("/subjects"); }} />
      <ConfirmDialog open={!!target} onClose={() => setTrashProg(null)} title="Move program to Trash?" confirmLabel="Move to Trash"
        body={target ? `Program ${pad(target.number)} "${target.title || "Untitled"}" will move to Trash. Its number becomes free; you can restore it later.` : ""}
        onConfirm={() => { if (!target) return; update(w => mapSubject(w, subject.id, s => ({ ...s, updatedAt: nowIso(), programs: s.programs.map(p => p.id === target.id ? { ...p, trashedAt: nowIso() } : p) }))); notify("Program moved to Trash."); }} />
    </Shell>
  );
}
