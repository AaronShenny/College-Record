import { useState } from "react";
import { FileInput, FileText, History, LayoutTemplate, Pencil, Plus, Trash2 } from "lucide-react";
import { Shell } from "@/components/shell";
import { EmptyState, fmtTime, href } from "@/components/kit";
import { GenerateDialog } from "@/components/generate-dialog";
import { ConfirmDialog, ProgramDialog, SubjectDialog } from "@/components/dialogs";
import { activePrograms, mapSubject, nowIso, pad, programState, useStore } from "@/hooks/use-workspace";

export default function SubjectPage({ id }: { id: string }) {
  const { workspace, update, notify } = useStore();
  const subject = workspace!.subjects.find(s => s.id === id);
  const [edit, setEdit] = useState(false); const [add, setAdd] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set()); const [genOpen, setGenOpen] = useState(false);
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
    <Shell active="subjects" crumb={<><a href={href("/")} className="crumb-link" data-testid="link-all-subjects">Subjects</a> / <strong>{subject.name}</strong></>}>
      <div className="page">
        <div className="subject-head">
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">Semester {subject.semester}{subject.courseCode ? " · " + subject.courseCode : ""}</div>
            <h1>{subject.name}</h1>
          </div>
          <div className="head-actions">
            <button className="btn" onClick={() => setAdd(true)} data-testid="button-new-program"><Plus size={14} /> New program</button>
            <button className="btn primary" disabled={!progs.length} onClick={() => setGenOpen(true)} data-testid="button-generate-subject"><FileText size={14} /> {picked.size ? `Generate ${picked.size} selected` : "Generate all"}</button>
          </div>
        </div>
        <nav className="setup-strip" aria-label="Subject setup">
          <a href={href(`/template/${subject.id}`)} data-testid="link-template"><LayoutTemplate size={14} /> Template & mapping <span className={`badge ${!subject.template ? "alert" : subject.template.reviewed ? "good" : "warn"}`}>{!subject.template ? "Missing" : subject.template.reviewed ? "Reviewed" : "Needs review"}</span></a>
          <a href={href(`/import/${subject.id}`)} data-testid="link-import"><FileInput size={14} /> Import questions & code</a>
          <a href={href(`/documents/${subject.id}`)} data-testid="link-documents"><History size={14} /> Saved versions</a>
          <span style={{ flex: 1 }} />
          <button onClick={() => setEdit(true)} data-testid="button-rename-subject"><Pencil size={13} /> Edit subject</button>
          <button className="danger" onClick={() => setTrashSubject(true)} data-testid="button-trash-subject"><Trash2 size={13} /> Trash</button>
        </nav>
        <section className="panel">
          {progs.length === 0 ? (
            <EmptyState mark={pad(1)} title="No programs yet" action={<div style={{ display: "flex", gap: 8 }}><button className="btn primary" onClick={() => setAdd(true)}><Plus size={14} /> Add program 1</button><a className="btn" href={href(`/import/${subject.id}`)}>Import a list</a></div>}>
              Programs are numbered like your record book. Add one, paste your code and the output screenshot.
            </EmptyState>
          ) : (
            <div className="prog-table">
              <div className="prog-row head">
                <label className="sel"><span className="sr-only">Select all</span><input type="checkbox" className="check" checked={picked.size === progs.length} onChange={e => setPicked(e.target.checked ? new Set(progs.map(p => p.id)) : new Set())} data-testid="check-select-all" /></label>
                <span>No.</span><span>Title</span><span>Status</span><span className="hide-sm">Updated</span><span />
              </div>
              {progs.map(p => { const st = programState(p, subject); return (
                <div key={p.id} className={`prog-row ${picked.has(p.id) ? "picked" : ""}`} data-testid={`row-program-${p.id}`}>
                  <label className="sel"><span className="sr-only">Select program {p.number}</span><input type="checkbox" className="check" checked={picked.has(p.id)} onChange={e => { const n = new Set(picked); if (e.target.checked) n.add(p.id); else n.delete(p.id); setPicked(n); }} data-testid={`check-program-${p.id}`} /></label>
                  <span className="mono list-no">{pad(p.number)}</span>
                  <a className="prog-open" href={href(`/program/${subject.id}/${p.id}`)} data-testid={`button-open-${p.id}`}>{p.title || <span className="muted">Untitled program</span>}</a>
                  <span><span className={`badge ${st.tone}`}>{st.label}</span>{st.missing.length > 0 && <small className="missing">needs {st.missing.join(", ")}</small>}</span>
                  <span className="muted hide-sm" style={{ fontSize: 12 }}>{fmtTime(p.updatedAt)}</span>
                  <button className="icon-btn" aria-label={`Move program ${p.number} to Trash`} onClick={() => setTrashProg(p.id)} data-testid={`button-trash-${p.id}`}><Trash2 size={14} /></button>
                </div>); })}
            </div>
          )}
        </section>
      </div>
      <GenerateDialog open={genOpen} onClose={() => setGenOpen(false)} subject={subject} programIds={picked.size ? [...picked] : progs.map(p => p.id)} />
      <SubjectDialog open={edit} onClose={() => setEdit(false)} subject={subject} />
      <ProgramDialog open={add} onClose={() => setAdd(false)} subject={subject} />
      <ConfirmDialog open={trashSubject} onClose={() => setTrashSubject(false)} title="Move subject to Trash?" confirmLabel="Move to Trash"
        body={`"${subject.name}" and its ${progs.length} program(s) will move to Trash. You can restore everything from Trash at any time; nothing is permanently deleted.`}
        onConfirm={() => { update(w => mapSubject(w, subject.id, s => ({ ...s, trashedAt: nowIso(), updatedAt: nowIso() }))); notify("Subject moved to Trash. Restore it from Trash."); window.location.hash = "/"; }} />
      <ConfirmDialog open={!!target} onClose={() => setTrashProg(null)} title="Move program to Trash?" confirmLabel="Move to Trash"
        body={target ? `Program ${pad(target.number)} "${target.title || "Untitled"}" will move to Trash. Its number becomes free; you can restore it later.` : ""}
        onConfirm={() => { if (!target) return; update(w => mapSubject(w, subject.id, s => ({ ...s, updatedAt: nowIso(), programs: s.programs.map(p => p.id === target.id ? { ...p, trashedAt: nowIso() } : p) }))); setPicked(x => { const n = new Set(x); n.delete(target.id); return n; }); notify("Program moved to Trash."); }} />
    </Shell>
  );
}
