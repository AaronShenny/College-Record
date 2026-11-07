import { useEffect, useState } from "react";
import { AlertTriangle, Download, ExternalLink, FileText } from "lucide-react";
import type { Subject } from "@/lib/contracts";
import { openDocument, type DocumentFile } from "@/lib/workflow-api";
import { activePrograms, errMsg, pad, useStore } from "@/hooks/use-workspace";
import { Modal, fmtTime, href } from "./kit";

export function DocRow({ d, numbers, desktop, opening, act }: { d: DocumentFile; numbers?: number[]; desktop: boolean; opening: string | null; act: (d: DocumentFile, a: "open" | "download") => void }) {
  return <div className="doc-row" data-testid={`doc-${d.id}`}>
    <span className={`doc-fmt ${d.format}`}>{d.format.toUpperCase()}</span>
    <div style={{ minWidth: 0, flex: 1 }}><b title={d.name}>{d.name}</b>
      <small>{fmtTime(d.createdAt)} · {(d.byteLength / 1024).toFixed(1)} KB{numbers?.length ? ` · programs ${numbers.map(pad).join(", ")}` : ""}</small></div>
    {desktop && <button className="btn small" disabled={opening === d.id + "open"} onClick={() => act(d, "open")} data-testid={`button-open-doc-${d.id}`}><ExternalLink size={12} /> Open</button>}
    <button className="btn small" disabled={opening === d.id + "download"} onClick={() => act(d, "download")} data-testid={`button-download-doc-${d.id}`}><Download size={12} /> {desktop ? "Save as" : "Download"}</button>
  </div>;
}

export function useDocAction() {
  const { notify } = useStore();
  const [opening, setOpening] = useState<string | null>(null);
  const act = async (d: DocumentFile, action: "open" | "download") => {
    setOpening(d.id + action);
    try { await openDocument(d, action); } catch (e) { notify(errMsg(e), "error"); } finally { setOpening(null); }
  };
  return { opening, act: (d: DocumentFile, a: "open" | "download") => void act(d, a) };
}

/** Generation status/results for one subject. Shared by the dialog and Documents page. */
export function GenResult({ subjectName }: { subjectName: (id: string) => string }) {
  const { gen: job, runtime, workspace } = useStore();
  const { opening, act } = useDocAction();
  const failedSubject = workspace?.subjects.find(s => s.id === job.subjectId);
  if (job.state === "running") return <div className="gen-progress" role="status" data-testid="status-generation"><i className="dot busy" />Generating {job.count} program(s) for {subjectName(job.subjectId ?? "")}. You can keep editing; the record uses the snapshot taken when you started.<span className="gen-bar"><i /></span></div>;
  if (job.state === "error") return <div className="notice red" role="alert"><AlertTriangle size={14} /><span><b>Generation failed for {subjectName(job.subjectId ?? "")}.</b> {job.error} Fix the issue and start again; nothing was overwritten.</span></div>;
  if (job.state === "done" && job.result) return <div style={{ display: "grid", gap: 8 }} data-testid="text-generation-result">
    <div className={`notice ${job.result.documents.length ? "green" : "red"}`}><FileText size={14} /><span><b>{job.result.documents.length} file(s) saved</b> for {subjectName(job.subjectId ?? "")} from snapshot taken {fmtTime(job.result.snapshotAt)}.</span></div>
    {job.result.failures.length > 0 && <div className="notice red" role="alert"><AlertTriangle size={14} /><span><b>{job.result.failures.length} failure(s):</b>{job.result.failures.map((f, i) => {
      const program = failedSubject?.programs.find(p => p.number === f.number && !p.trashedAt);
      return <span key={i} style={{ display: "block" }}>{f.number != null ? `Program ${pad(f.number)}: ` : ""}{f.message}{program && <a className="linkish" style={{ marginLeft: 8 }} href={href(`/program/${failedSubject!.id}/${program.id}`)}>Fix program</a>}</span>;
    })}</span></div>}
    {job.result.documents.map(d => <DocRow key={d.id} d={d} desktop={runtime?.mode === "desktop"} opening={opening} act={act} />)}
  </div>;
  return null;
}

/** Contextual generation: subject fixed, selection pre-supplied. One click to start. */
export function GenerateDialog({ open, onClose, subject, programIds }: { open: boolean; onClose: () => void; subject: Subject; programIds: string[] }) {
  const { gen: job, startGeneration, runtime, workspace, drafts } = useStore();
  const progs = activePrograms(subject);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"individual" | "combined">("individual");
  const [pdf, setPdf] = useState(false);
  const [editPick, setEditPick] = useState(false);
  const [started, setStarted] = useState(false);
  useEffect(() => { if (open) { setPicked(new Set(programIds)); setEditPick(false); setStarted(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = progs.filter(p => picked.has(p.id));
  const stale = selected.filter(p => p.outputMayBeStale);
  const tpl = subject.template;
  const running = job.state === "running";
  const nameOf = (id: string) => workspace?.subjects.find(s => s.id === id)?.name ?? "Deleted subject";
  const start = () => { if (!selected.length || drafts.size) return; startGeneration(subject.id, selected.map(p => p.id), mode, pdf); setStarted(true); };

  return (
    <Modal open={open} onClose={onClose} title={`Generate · ${subject.name}`}
      footer={<>
        <a className="btn ghost" href={href(`/documents/${subject.id}`)} onClick={onClose} data-testid="link-gen-history">Saved versions</a>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onClose} data-testid="button-gen-close">{started ? "Close" : "Cancel"}</button>
        <button className="btn primary" disabled={!selected.length || running || !!drafts.size} onClick={start} data-testid="button-generate-start">
          <FileText size={14} /> {running ? "Generating…" : mode === "combined" ? "Generate combined record" : `Generate ${selected.length} file${selected.length === 1 ? "" : "s"}`}</button>
      </>}>
      {!!drafts.size && <div className="notice red" role="alert">Fix the highlighted draft fields before generating. Close this dialog to return to your entered values.</div>}
      {!tpl && <div className="notice red"><AlertTriangle size={14} /><span>This subject has no Word template. <a href={href(`/template/${subject.id}`)} onClick={onClose} style={{ textDecoration: "underline" }}>Upload one</a> first.</span></div>}
      {tpl && !tpl.reviewed && <div className="notice"><AlertTriangle size={14} /><span>Template mapping is not reviewed. <a href={href(`/template/${subject.id}`)} onClick={onClose} style={{ textDecoration: "underline" }}>Review mapping</a>.</span></div>}
      <div className="gen-pick">
        <div className="gen-pick-head"><span className="field-label" style={{ margin: 0 }}>Programs · {selected.length} of {progs.length}</span>
          <button className="btn small ghost" onClick={() => setEditPick(v => !v)} aria-expanded={editPick} data-testid="button-gen-change">{editPick ? "Done" : "Change"}</button></div>
        {!editPick ? <div className="gen-chips">{selected.length ? selected.map(p => <span key={p.id} className="chip mono">{pad(p.number)}</span>) : <span className="hint" style={{ margin: 0 }}>None selected. Use Change.</span>}</div> :
          <div className="doc-pick-list">
            <label className="inclusion" style={{ fontWeight: 700 }}><input type="checkbox" className="check" checked={picked.size === progs.length && progs.length > 0} onChange={e => setPicked(e.target.checked ? new Set(progs.map(p => p.id)) : new Set())} data-testid="check-all-programs" /> All programs</label>
            {progs.map(p => <label key={p.id} className="inclusion"><input type="checkbox" className="check" checked={picked.has(p.id)} onChange={e => { const n = new Set(picked); if (e.target.checked) n.add(p.id); else n.delete(p.id); setPicked(n); }} data-testid={`check-doc-${p.id}`} />
              <span className="mono">{pad(p.number)}</span> <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.title || "Untitled"}</span></label>)}
          </div>}
      </div>
      <div className="seg" role="radiogroup" aria-label="Output mode">
        <label className={mode === "individual" ? "on" : ""}><input type="radio" name="gen-mode" checked={mode === "individual"} onChange={() => setMode("individual")} data-testid="radio-individual" /> One file per program</label>
        <label className={mode === "combined" ? "on" : ""}><input type="radio" name="gen-mode" checked={mode === "combined"} onChange={() => setMode("combined")} data-testid="radio-combined" /> One combined record</label>
      </div>
      <label className="required-toggle"><input type="checkbox" className="check" checked={pdf} onChange={e => setPdf(e.target.checked)} data-testid="check-pdf" /> Also make PDF{runtime?.mode !== "desktop" && <span className="muted"> (needs Word in the desktop app)</span>}</label>
      {stale.length > 0 && <div className="notice"><AlertTriangle size={14} /><span>Code changed after output for {stale.map(p => pad(p.number)).join(", ")}. You can still generate.</span></div>}
      <GenResult subjectName={nameOf} />
    </Modal>
  );
}
