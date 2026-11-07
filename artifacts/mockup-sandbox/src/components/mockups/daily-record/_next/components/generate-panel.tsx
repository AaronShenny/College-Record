import { AlertTriangle, Download, ExternalLink, FileText } from "lucide-react";
import { useState } from "react";
import { Modal, fmtTime, href } from "./kit";
import type { Subject } from "../lib/contracts";
import { openDocument, type DocumentFile } from "../lib/workflow-api";
import { activePrograms, errMsg, pad, programChecks, useStore } from "../hooks/use-workspace";
import { fixMissing } from "./focus-intent";

/** One generation form shared by the editor, subject workspace and Documents.
 * Selection lives in the provider (generationChoices) so it survives navigation. */
export function GenerationForm({ subject, onLeave }: { subject: Subject; onLeave?: () => void }) {
  const { gen: job, startGeneration, generationChoices, setGenerationChoice, runtime, drafts, workspace, notify } = useStore();
  const progs = activePrograms(subject);
  const choice = generationChoices[subject.id] ?? { programIds: [], mode: "individual" as const, pdf: false };
  const picked = new Set(choice.programIds);
  const selected = progs.filter(p => picked.has(p.id));
  const stale = selected.filter(p => p.outputMayBeStale);
  const tpl = subject.template;
  const scopeOf = (id: string) => subject.fields?.find(d => d.id === id)?.scope;
  const gaps = selected.flatMap(p => programChecks(p, subject).filter(c => !c.ok).map(c => ({ p, c })));
  const desktop = runtime?.mode === "desktop";
  const running = job.state === "running";
  const mine = job.subjectId === subject.id;
  const [opening, setOpening] = useState<string | null>(null);
  const act = async (d: DocumentFile, a: "open" | "download") => {
    setOpening(d.id + a);
    try { await openDocument(d, a); } catch (e) { notify(errMsg(e), "error"); } finally { setOpening(null); }
  };
  const otherName = workspace!.subjects.find(s => s.id === job.subjectId)?.name ?? "another subject";

  return (
    <div className="gen-form" data-testid="form-generate">
      {!tpl && <div className="notice red"><AlertTriangle size={14} /><span>No Word template for this subject. <a className="inline-link" href={href(`/template/${subject.id}`)}>Open Template &amp; mapping</a> to upload one.</span></div>}
      {tpl && !tpl.reviewed && <div className="notice"><AlertTriangle size={14} /><span>Mapping not reviewed yet. <a className="inline-link" href={href(`/template/${subject.id}`)}>Review Template &amp; mapping</a>.</span></div>}
      <fieldset className="gen-pick">
        <legend className="field-label">Programs · {selected.length} of {progs.length} selected</legend>
        {progs.length === 0 ? <p className="hint">No programs in this subject.</p> : <>
          <label className="inclusion gen-all"><input type="checkbox" className="check" checked={selected.length === progs.length} onChange={e => setGenerationChoice(subject.id, { programIds: e.target.checked ? progs.map(p => p.id) : [] })} data-testid="check-all-programs" /> All programs</label>
          <div className="gen-pick-list">{progs.map(p => <label key={p.id} className="inclusion">
            <input type="checkbox" className="check" checked={picked.has(p.id)} onChange={e => { const n = new Set(picked); if (e.target.checked) n.add(p.id); else n.delete(p.id); setGenerationChoice(subject.id, { programIds: progs.filter(x => n.has(x.id)).map(x => x.id) }); }} data-testid={`check-doc-${p.id}`} />
            <span className="mono list-no">{pad(p.number)}</span><span className="gen-title">{p.title || <span className="muted">Untitled</span>}</span>{p.outputMayBeStale && <span className="badge warn">Output may be outdated</span>}</label>)}</div>
        </>}
      </fieldset>
      <div className="gen-options">
        <div className="seg" role="radiogroup" aria-label="Output mode">
          <label className={choice.mode === "individual" ? "on" : ""}><input type="radio" name={`mode-${subject.id}`} checked={choice.mode === "individual"} onChange={() => setGenerationChoice(subject.id, { mode: "individual" })} data-testid="radio-individual" /> One Word file per program</label>
          <label className={choice.mode === "combined" ? "on" : ""}><input type="radio" name={`mode-${subject.id}`} checked={choice.mode === "combined"} onChange={() => setGenerationChoice(subject.id, { mode: "combined" })} data-testid="radio-combined" /> One combined record</label>
        </div>
        <label className="required-toggle"><input type="checkbox" className="check" checked={choice.pdf} onChange={e => setGenerationChoice(subject.id, { pdf: e.target.checked })} data-testid="check-pdf" /> Also make PDF{!desktop && <span className="muted"> (needs Word in the desktop app)</span>}</label>
      </div>
      {stale.length > 0 && <div className="notice"><AlertTriangle size={14} /><span>Code changed after output for {stale.map(p => pad(p.number)).join(", ")}. Check the screenshots; you can still generate.</span></div>}
      {gaps.length > 0 && <div className="notice red gen-gaps" role="alert" data-testid="list-missing-content"><AlertTriangle size={14} /><div style={{ flex: 1 }}>
        <b>Missing required content.</b> The generator will reject these; fix them first or deselect the program.
        <ul>{gaps.slice(0, 8).map(({ p, c }) => <li key={p.id + c.field + c.label}><span className="mono">{pad(p.number)}</span> {c.label} <button className="inline-link" onClick={() => { onLeave?.(); fixMissing(subject.id, p.id, c.field, scopeOf); }} data-testid={`button-fix-${p.id}-${c.field}`}>Fix</button></li>)}</ul>
        {gaps.length > 8 && <small>and {gaps.length - 8} more</small>}</div></div>}
      {drafts.size > 0 && <div className="notice red" role="alert"><AlertTriangle size={14} /><span>{drafts.size} field{drafts.size > 1 ? "s are" : " is"} not valid yet. Fix the highlighted field before generating.</span></div>}
      <button className="btn primary gen-go" disabled={selected.length === 0 || running || drafts.size > 0} onClick={() => startGeneration(subject.id, selected.map(p => p.id), choice.mode, choice.pdf)} data-testid="button-generate">
        <FileText size={14} /> {running ? "Generating…" : selected.length === 0 ? "Select programs to generate" : choice.mode === "combined" ? `Generate combined record (${selected.length})` : `Generate ${selected.length} Word file${selected.length === 1 ? "" : "s"}`}</button>
      <p className="hint" style={{ margin: 0 }}>Uses a frozen snapshot of your work at the moment you press Generate. Keep editing while it runs.</p>

      {running && <div className="gen-status running" role="status"><i className="dot busy" />Working on {job.count} program(s){mine ? "" : ` · ${otherName}`}…</div>}
      {mine && job.state === "error" && <div className="notice red" role="alert"><AlertTriangle size={14} /><span><b>Generation failed.</b> {job.error}</span></div>}
      {mine && job.state === "done" && job.result && <div className="gen-result" data-testid="text-generation-result">
        <div className={`notice ${job.result.documents.length ? "green" : "red"}`}><FileText size={14} /><span><b>{job.result.documents.length} file(s) saved</b> from snapshot taken {fmtTime(job.result.snapshotAt)}.</span></div>
        {job.result.failures.length > 0 && <div className="notice red" role="alert"><AlertTriangle size={14} /><span><b>{job.result.failures.length} failure(s):</b>{job.result.failures.map((f, i) => <span key={i} style={{ display: "block" }}>{f.number != null ? `Program ${pad(f.number)}: ` : ""}{f.message}</span>)}</span></div>}
        {job.result.documents.map(d => <DocRow key={d.id} d={d} desktop={desktop} opening={opening} act={act} />)}
      </div>}
      <a className="inline-link small" href={href(`/documents/${subject.id}`)} data-testid="link-saved-versions">All saved versions in Documents</a>
    </div>
  );
}

export function GeneratePanel({ subject, open, onClose }: { subject: Subject; open: boolean; onClose: () => void }) {
  return <Modal open={open} onClose={onClose} title={`Generate · ${subject.name}`}><GenerationForm subject={subject} onLeave={onClose} /></Modal>;
}

export function DocRow({ d, numbers, desktop, opening, act }: { d: DocumentFile; numbers?: number[]; desktop: boolean; opening: string | null; act: (d: DocumentFile, a: "open" | "download") => void }) {
  return <div className="doc-row" data-testid={`doc-${d.id}`}>
    <span className={`doc-fmt ${d.format}`}>{d.format.toUpperCase()}</span>
    <div style={{ minWidth: 0, flex: 1 }}><b title={d.name}>{d.name}</b>
      <small>{fmtTime(d.createdAt)} · {(d.byteLength / 1024).toFixed(1)} KB{numbers?.length ? ` · programs ${numbers.map(pad).join(", ")}` : ""}</small></div>
    {desktop && <button className="btn small" disabled={opening === d.id + "open"} onClick={() => act(d, "open")} data-testid={`button-open-doc-${d.id}`}><ExternalLink size={12} /> Open</button>}
    <button className="btn small" disabled={opening === d.id + "download"} onClick={() => act(d, "download")} data-testid={`button-download-doc-${d.id}`}><Download size={12} /> {desktop ? "Save as" : "Download"}</button>
  </div>;
}
