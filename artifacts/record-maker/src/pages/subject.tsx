import { useEffect, useState } from "react";
import { takeIntent } from "@/components/focus-intent";
import { ArrowLeft, Download, FileInput, Upload, FileText, LayoutTemplate, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { Shell } from "@/components/shell";
import { EmptyState, Modal, fmtTime, go, href } from "@/components/kit";
import { ConfirmDialog, ProgramDialog, SubjectDialog } from "@/components/dialogs";
import { GeneratePanel } from "@/components/generate-panel";
import { ExportConfigDialog, ImportConfigDialog } from "@/components/subject-config";
import { activePrograms, mapSubject, nowIso, pad, programState, useStore } from "@/hooks/use-workspace";

export default function SubjectPage({ id }: { id: string }) {
  const { workspace, update, notify, generationChoices, setGenerationChoice } = useStore();
  const subject = workspace!.subjects.find(s => s.id === id);
  const [edit, setEdit] = useState(false); const [add, setAdd] = useState(false); const [settings, setSettings] = useState(false);
  const [gen, setGen] = useState(false);
  const [exportCfg, setExportCfg] = useState(false); const [importCfg, setImportCfg] = useState(false);
  const [trashSubject, setTrashSubject] = useState(false); const [trashProg, setTrashProg] = useState<string | null>(null);

  useEffect(() => {
    const applyIntent = () => { if (takeIntent(i => i.openSubjectEdit === id)) setEdit(true); };
    applyIntent();
    window.addEventListener("crm-focus-intent", applyIntent);
    return () => window.removeEventListener("crm-focus-intent", applyIntent);
  }, [id]);

  if (!subject || subject.trashedAt) {
    return <Shell active="subjects" crumb="Subject"><div className="page"><div className="panel">
      <EmptyState mark="?" title={subject ? "This subject is in Trash" : "Subject not found"} action={<a className="btn primary" href={href(subject ? "/trash" : "/")}>{subject ? "Open Trash" : "Back to subjects"}</a>}>
        {subject ? "Restore it from Trash to keep editing. Nothing inside it was removed." : "It may have been moved or this link is out of date."}
      </EmptyState></div></div></Shell>;
  }
  const progs = activePrograms(subject);
  const target = progs.find(p => p.id === trashProg);
  const picked = new Set(generationChoices[subject.id]?.programIds ?? []);
  const pickedCount = progs.filter(p => picked.has(p.id)).length;
  const toggle = (pid: string, on: boolean) => { const n = new Set(picked); if (on) n.add(pid); else n.delete(pid); setGenerationChoice(subject.id, { programIds: progs.filter(p => n.has(p.id)).map(p => p.id) }); };
  const ready = progs.filter(p => programState(p, subject).tone === "good").length;

  return (
    <Shell active="subjects" crumb={`Subjects / ${subject.name}`}>
      <div className="page subj-page">
        <a className="back-link" href={href("/")} data-testid="link-all-subjects"><ArrowLeft size={13} /> All subjects</a>
        <div className="subj-head">
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">Semester {subject.semester}{subject.courseCode ? " · " + subject.courseCode : ""}</div>
            <h1 data-testid="text-subject-name">{subject.name}</h1>
            <div className="hint" style={{ margin: 0 }}>{progs.length} program{progs.length === 1 ? "" : "s"} · {ready} ready</div>
          </div>
          <nav className="setup-links" aria-label="Subject setup">
            <a className="setup-link" href={href(`/template/${subject.id}`)} data-testid="link-template"><LayoutTemplate size={15} /><span><b>Template &amp; mapping</b><small>{subject.template ? (subject.template.reviewed ? "Reviewed" : "Needs review") : "Not uploaded"}</small></span></a>
            <a className="setup-link" href={href(`/import/${subject.id}`)} data-testid="link-import"><FileInput size={15} /><span><b>Import</b><small>Questions &amp; code</small></span></a>
            <button className="setup-link" onClick={() => setSettings(true)} data-testid="button-subject-settings"><Settings2 size={15} /><span><b>Subject settings</b><small>Rename, configuration, Trash</small></span></button>
          </nav>
        </div>

        <section className="panel prog-table" aria-labelledby="h-progs">
          <div className="prog-table-head">
            <h2 id="h-progs">Programs</h2>
            <span className="muted" style={{ fontSize: 12 }} data-testid="text-selected-count">{pickedCount} selected for generation</span>
            <span style={{ flex: 1 }} />
            <button className="btn" onClick={() => setAdd(true)} data-testid="button-new-program"><Plus size={14} /> New program</button>
            <button className="btn primary" onClick={() => setGen(true)} disabled={progs.length === 0} data-testid="button-open-generate"><FileText size={14} /> Generate{pickedCount ? ` ${pickedCount} selected` : ""}…</button>
          </div>
          {progs.length === 0 ? (
            <EmptyState mark={pad(1)} title="No programs yet" action={<span style={{ display: "flex", gap: 8 }}><button className="btn primary" onClick={() => setAdd(true)}><Plus size={14} /> Add program 1</button><a className="btn" href={href(`/import/${subject.id}`)}>Import a list</a></span>}>
              Programs are numbered like your record book. Add one, then paste your code and the output screenshot.
            </EmptyState>
          ) : (
            <div className="prog-rows" role="list">
              <label className="prog-row head"><input type="checkbox" className="check" aria-label="Select all programs for generation" checked={pickedCount === progs.length} onChange={e => setGenerationChoice(subject.id, { programIds: e.target.checked ? progs.map(p => p.id) : [] })} data-testid="check-all-subject-programs" /><span>No.</span><span>Title</span><span>Code</span><span>Output</span><span>Status</span><span>Updated</span><span /></label>
              {progs.map(p => { const st = programState(p, subject); return (
                <div key={p.id} className={`prog-row ${picked.has(p.id) ? "picked" : ""}`} role="listitem" data-testid={`row-program-${p.id}`}>
                  <input type="checkbox" className="check" aria-label={`Select program ${pad(p.number)} for generation`} checked={picked.has(p.id)} onChange={e => toggle(p.id, e.target.checked)} data-testid={`check-program-${p.id}`} />
                  <span className="mono list-no">{pad(p.number)}</span>
                  <a className="prog-open" href={href(`/program/${subject.id}/${p.id}`)} data-testid={`link-open-${p.id}`}>{p.title || <span className="muted">Untitled program</span>}</a>
                  <span className="muted">{p.sources.filter(s => s.include).length} file{p.sources.filter(s => s.include).length === 1 ? "" : "s"}</span>
                  <span className="muted">{p.outputs.filter(o => o.include).length} item{p.outputs.filter(o => o.include).length === 1 ? "" : "s"}</span>
                  <span><span className={`badge ${st.tone}`}>{st.label}</span>{st.missing.length > 0 && <small className="miss-line">Needs {st.missing.slice(0, 2).join(", ")}</small>}</span>
                  <span className="muted" style={{ fontSize: 11 }}>{fmtTime(p.updatedAt)}</span>
                  <button className="icon-btn" aria-label={`Move program ${p.number} to Trash`} onClick={() => setTrashProg(p.id)} data-testid={`button-trash-${p.id}`}><Trash2 size={13} /></button>
                </div>); })}
            </div>
          )}
        </section>
      </div>
      <GeneratePanel subject={subject} open={gen} onClose={() => setGen(false)} />
      <Modal open={settings} onClose={() => setSettings(false)} title="Subject settings">
        <p className="hint" style={{ margin: 0 }}>{subject.name} · Semester {subject.semester}{subject.courseCode ? " · " + subject.courseCode : ""}</p>
        <button className="btn" onClick={() => { setSettings(false); setEdit(true); }} data-testid="button-rename-subject"><Pencil size={13} /> Rename or edit details and subject values</button>
        <button className="btn" onClick={() => { setSettings(false); setExportCfg(true); }} data-testid="button-export-config"><Download size={13} /> Export configuration</button>
        <button className="btn" onClick={() => { setSettings(false); setImportCfg(true); }} data-testid="button-import-config"><Upload size={13} /> Import configuration</button>
        <button className="btn danger" onClick={() => { setSettings(false); setTrashSubject(true); }} data-testid="button-trash-subject"><Trash2 size={13} /> Move subject to Trash</button>
      </Modal>
      <ExportConfigDialog open={exportCfg} onClose={() => setExportCfg(false)} subject={subject} />
      <ImportConfigDialog open={importCfg} onClose={() => setImportCfg(false)} subject={subject} />
      <SubjectDialog open={edit} onClose={() => setEdit(false)} subject={subject} />
      <ProgramDialog open={add} onClose={() => setAdd(false)} subject={subject} />
      <ConfirmDialog open={trashSubject} onClose={() => setTrashSubject(false)} title="Move subject to Trash?" confirmLabel="Move to Trash"
        body={`"${subject.name}" and its ${progs.length} program(s) will move to Trash. You can restore everything from Trash at any time; nothing is permanently deleted.`}
        onConfirm={() => { update(w => mapSubject(w, subject.id, s => ({ ...s, trashedAt: nowIso(), updatedAt: nowIso() }))); notify("Subject moved to Trash. Restore it from Trash."); go("/"); }} />
      <ConfirmDialog open={!!target} onClose={() => setTrashProg(null)} title="Move program to Trash?" confirmLabel="Move to Trash"
        body={target ? `Program ${pad(target.number)} "${target.title || "Untitled"}" will move to Trash. Its number becomes free; you can restore it later.` : ""}
        onConfirm={() => { if (!target) return; update(w => mapSubject(w, subject.id, s => ({ ...s, updatedAt: nowIso(), programs: s.programs.map(p => p.id === target.id ? { ...p, trashedAt: nowIso() } : p) }))); notify("Program moved to Trash."); }} />
    </Shell>
  );
}
