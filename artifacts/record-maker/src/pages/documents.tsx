import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, ExternalLink, FileText, RefreshCw } from "lucide-react";
import { Shell } from "@/components/shell";
import { EmptyState, PageHead, fmtTime, go, href } from "@/components/kit";
import { listDocuments, openDocument, type DocumentFile } from "@/lib/workflow-api";
import { activePrograms, activeSubjects, errMsg, pad, useStore } from "@/hooks/use-workspace";


export default function DocumentsPage({ sid: initialSid }: { sid?: string }) {
  const { workspace, runtime, notify, gen: job, startGeneration, docsVersion } = useStore();
  const subjects = activeSubjects(workspace!);
  const [sid, setSid] = useState(initialSid && subjects.some(s => s.id === initialSid) ? initialSid : subjects[0]?.id ?? "");
  const subject = subjects.find(s => s.id === sid);
  const progs = subject ? activePrograms(subject) : [];
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"individual" | "combined">("individual");
  const [pdf, setPdf] = useState(false);
  const [docs, setDocs] = useState<DocumentFile[] | null>(null);
  const [docsErr, setDocsErr] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setDocsErr(null);
    try { setDocs(await listDocuments()); } catch (e) { setDocsErr(errMsg(e)); setDocs(d => d ?? []); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh, docsVersion]);
  useEffect(() => { setPicked(new Set()); }, [sid]);

  const selected = progs.filter(p => picked.has(p.id));
  const stale = selected.filter(p => p.outputMayBeStale);
  const tpl = subject?.template;

  const generate = () => {
    if (!subject || selected.length === 0) return;
    startGeneration(subject.id, selected.map(p => p.id), mode, pdf);
  };
  const act = async (d: DocumentFile, action: "open" | "download") => {
    setOpening(d.id + action);
    try { await openDocument(d, action); } catch (e) { notify(errMsg(e), "error"); } finally { setOpening(null); }
  };

  const grouped = useMemo(() => {
    const m = new Map<string, DocumentFile[]>();
    for (const d of [...(docs ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
      if (!m.has(d.subjectId)) m.set(d.subjectId, []); m.get(d.subjectId)!.push(d);
    }
    return [...m.entries()];
  }, [docs]);
  const nameOf = (id: string) => workspace!.subjects.find(s => s.id === id)?.name ?? "Deleted subject";
  const numbersOf = (d: DocumentFile) => { const s = workspace!.subjects.find(x => x.id === d.subjectId); return d.programIds.map(id => s?.programs.find(p => p.id === id)?.number).filter((n): n is number => n != null).sort((a, b) => a - b); };

  return (
    <Shell active="documents" crumb="Documents">
      <div className="page">
        <PageHead eyebrow="Word records" title="Documents" description="Fill your reviewed template with a frozen snapshot of the selected programs. You can keep editing elsewhere while it runs." />
        {subjects.length === 0 ? <div className="panel"><EmptyState mark="01" title="No subjects yet" action={<a className="btn primary" href={href("/subjects")}>Go to subjects</a>}>Create a subject, upload its template and add programs first.</EmptyState></div> : (
        <div className="docs-layout">
          <section className="panel panel-pad" aria-labelledby="h-gen">
            <div className="section-title"><h2 id="h-gen">Generate</h2>{job.state === "running" && <span className="badge blue"><i className="dot busy" />Working on {job.count} program(s) · {nameOf(job.subjectId ?? "")}</span>}</div>
            <label><span className="field-label">Subject</span>
              <select value={sid} onChange={e => setSid(e.target.value)} data-testid="select-doc-subject">{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            {subject && !tpl && <div className="notice red" style={{ marginTop: 10 }}><AlertTriangle size={14} /><span>This subject has no Word template. <a href={href(`/template/${subject.id}`)} style={{ textDecoration: "underline" }}>Upload one</a> before generating.</span></div>}
            {subject && tpl && !tpl.reviewed && <div className="notice" style={{ marginTop: 10 }}><AlertTriangle size={14} /><span>Template mapping is not reviewed yet. <a href={href(`/template/${subject.id}`)} style={{ textDecoration: "underline" }}>Review mapping</a>.</span></div>}
            <fieldset className="doc-pick">
              <legend className="field-label">Programs · {picked.size} of {progs.length} selected</legend>
              {progs.length === 0 ? <p className="hint">No programs in this subject.</p> : <>
                <label className="inclusion" style={{ fontWeight: 700 }}><input type="checkbox" className="check" checked={picked.size === progs.length} onChange={e => setPicked(e.target.checked ? new Set(progs.map(p => p.id)) : new Set())} data-testid="check-all-programs" /> All programs</label>
                <div className="doc-pick-list">{progs.map(p => <label key={p.id} className="inclusion"><input type="checkbox" className="check" checked={picked.has(p.id)} onChange={e => { const n = new Set(picked); if (e.target.checked) n.add(p.id); else n.delete(p.id); setPicked(n); }} data-testid={`check-doc-${p.id}`} />
                  <span className="mono">{pad(p.number)}</span> {p.title || <span className="muted">Untitled</span>}{p.outputMayBeStale && <span className="badge warn" style={{ marginLeft: "auto" }}>Output may be outdated</span>}</label>)}</div>
              </>}
            </fieldset>
            <div className="seg-row" role="radiogroup" aria-label="Output mode" style={{ marginTop: 10 }}>
              <label><input type="radio" checked={mode === "individual"} onChange={() => setMode("individual")} data-testid="radio-individual" /> One file per program</label>
              <label><input type="radio" checked={mode === "combined"} onChange={() => setMode("combined")} data-testid="radio-combined" /> One combined record</label>
            </div>
            <label className="required-toggle" style={{ marginTop: 6 }}><input type="checkbox" className="check" checked={pdf} onChange={e => setPdf(e.target.checked)} data-testid="check-pdf" /> Also make PDF{runtime?.mode !== "desktop" && <span className="muted"> (needs Microsoft Word in the desktop app)</span>}</label>
            {stale.length > 0 && <div className="notice" style={{ marginTop: 10 }}><AlertTriangle size={14} /><span>Code changed after output for {stale.map(p => pad(p.number)).join(", ")}. You can still generate; check the screenshots first.</span></div>}
            <button className="btn primary" style={{ marginTop: 12, width: "100%", justifyContent: "center" }} disabled={!subject || selected.length === 0 || job.state === "running"} onClick={generate} data-testid="button-generate">
              <FileText size={14} /> {job.state === "running" ? "Generating…" : `Generate ${mode === "combined" ? "combined record" : `${selected.length} file(s)`}`}</button>
            <p className="hint" style={{ marginBottom: 0 }}>Required fields are checked by the generator. Nothing you wrote is executed.</p>

            {job.state === "running" && <div className="skel" style={{ height: 50, marginTop: 10 }} role="status" aria-label="Generating" />}
            {job.state === "error" && <div className="notice red" role="alert" style={{ marginTop: 10 }}><AlertTriangle size={14} /><span><b>Generation failed for {nameOf(job.subjectId ?? "")}.</b> {job.error}</span></div>}
            {job.state === "done" && job.result && <div style={{ display: "grid", gap: 8, marginTop: 10 }} data-testid="text-generation-result">
              <div className={`notice ${job.result.documents.length ? "green" : "red"}`}><FileText size={14} /><span><b>{job.result.documents.length} file(s) saved</b> for {nameOf(job.subjectId ?? "")} from snapshot taken {fmtTime(job.result.snapshotAt)}.</span></div>
              {job.result.failures.length > 0 && <div className="notice red" role="alert"><AlertTriangle size={14} /><span><b>{job.result.failures.length} failure(s):</b>{job.result.failures.map((f, i) => <span key={i} style={{ display: "block" }}>{f.number != null ? `Program ${pad(f.number)}: ` : ""}{f.message}</span>)}</span></div>}
              {job.result.documents.map(d => <DocRow key={d.id} d={d} desktop={runtime?.mode === "desktop"} opening={opening} act={act} />)}
            </div>}
          </section>

          <section className="panel panel-pad" aria-labelledby="h-saved">
            <div className="section-title"><h2 id="h-saved">Saved versions</h2><button className="btn small" onClick={() => void refresh()} data-testid="button-refresh-docs"><RefreshCw size={12} /> Refresh</button></div>
            {docsErr && <div className="notice red" role="alert"><AlertTriangle size={14} /><span>{docsErr}</span><button className="btn small" onClick={() => void refresh()}>Retry</button></div>}
            {docs === null ? <div style={{ display: "grid", gap: 8 }}><div className="skel" style={{ height: 44 }} /><div className="skel" style={{ height: 44 }} /></div> :
              docs.length === 0 ? <EmptyState mark="DOCX" title="No documents yet">Generated files are kept here as versions. Older versions are never replaced.</EmptyState> :
              grouped.map(([gid, list]) => <div key={gid} className="doc-group">
                <div className="kicker" style={{ display: "flex", justifyContent: "space-between" }}><span>{nameOf(gid)}</span><span>{list.length}</span></div>
                {list.map(d => <DocRow key={d.id} d={d} numbers={numbersOf(d)} desktop={runtime?.mode === "desktop"} opening={opening} act={act} />)}
              </div>)}
            {subject && <button className="btn small ghost" style={{ marginTop: 8 }} onClick={() => go(`/subject/${subject.id}`)}>Back to {subject.name}</button>}
          </section>
        </div>)}
      </div>
    </Shell>
  );
}

function DocRow({ d, numbers, desktop, opening, act }: { d: DocumentFile; numbers?: number[]; desktop: boolean; opening: string | null; act: (d: DocumentFile, a: "open" | "download") => void }) {
  return <div className="doc-row" data-testid={`doc-${d.id}`}>
    <span className={`doc-fmt ${d.format}`}>{d.format.toUpperCase()}</span>
    <div style={{ minWidth: 0, flex: 1 }}><b title={d.name}>{d.name}</b>
      <small>{fmtTime(d.createdAt)} · {(d.byteLength / 1024).toFixed(1)} KB{numbers?.length ? ` · programs ${numbers.map(pad).join(", ")}` : ""}</small></div>
    {desktop && <button className="btn small" disabled={opening === d.id + "open"} onClick={() => act(d, "open")} data-testid={`button-open-doc-${d.id}`}><ExternalLink size={12} /> Open</button>}
    <button className="btn small" disabled={opening === d.id + "download"} onClick={() => act(d, "download")} data-testid={`button-download-doc-${d.id}`}><Download size={12} /> {desktop ? "Save as" : "Download"}</button>
  </div>;
}
