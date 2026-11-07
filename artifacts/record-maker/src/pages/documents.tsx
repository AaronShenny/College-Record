import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Shell } from "@/components/shell";
import { EmptyState, PageHead, href } from "@/components/kit";
import { DocRow, GenerationForm } from "@/components/generate-panel";
import { listDocuments, openDocument, type DocumentFile } from "@/lib/workflow-api";
import { activeSubjects, errMsg, useStore } from "@/hooks/use-workspace";

export default function DocumentsPage({ sid: initialSid }: { sid?: string }) {
  const { workspace, runtime, notify, gen, docsVersion } = useStore();
  const subjects = activeSubjects(workspace!);
  const fallback = gen.subjectId && subjects.some(s => s.id === gen.subjectId) ? gen.subjectId : subjects[0]?.id ?? "";
  const [sid, setSid] = useState(initialSid && subjects.some(s => s.id === initialSid) ? initialSid : fallback);
  useEffect(() => { if (initialSid && subjects.some(s => s.id === initialSid)) setSid(initialSid); }, [initialSid]); // eslint-disable-line react-hooks/exhaustive-deps
  const subject = subjects.find(s => s.id === sid);
  const [docs, setDocs] = useState<DocumentFile[] | null>(null);
  const [docsErr, setDocsErr] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [scope, setScope] = useState<"subject" | "all">("subject");

  const refresh = useCallback(async () => {
    setDocsErr(null);
    try { setDocs(await listDocuments()); } catch (e) { setDocsErr(errMsg(e)); setDocs(d => d ?? []); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh, docsVersion]);

  const act = async (d: DocumentFile, action: "open" | "download") => {
    setOpening(d.id + action);
    try { await openDocument(d, action); } catch (e) { notify(errMsg(e), "error"); } finally { setOpening(null); }
  };
  const grouped = useMemo(() => {
    const m = new Map<string, DocumentFile[]>();
    for (const d of [...(docs ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
      if (scope === "subject" && d.subjectId !== sid) continue;
      if (!m.has(d.subjectId)) m.set(d.subjectId, []); m.get(d.subjectId)!.push(d);
    }
    return [...m.entries()];
  }, [docs, scope, sid]);
  const nameOf = (id: string) => workspace!.subjects.find(s => s.id === id)?.name ?? "Deleted subject";
  const numbersOf = (d: DocumentFile) => { const s = workspace!.subjects.find(x => x.id === d.subjectId); return d.programIds.map(id => s?.programs.find(p => p.id === id)?.number).filter((n): n is number => n != null).sort((a, b) => a - b); };

  return (
    <Shell active="documents" crumb="Documents">
      <div className="page">
        <PageHead eyebrow="Word records" title="Documents" />
        {subjects.length === 0 ? <div className="panel"><EmptyState mark="01" title="No subjects yet" action={<a className="btn primary" href={href("/")}>Go to subjects</a>}>Create a subject, upload its template and add programs first.</EmptyState></div> : (
        <div className="docs-layout">
          <section className="panel panel-pad" aria-labelledby="h-gen">
            <div className="section-title"><h2 id="h-gen">Generate</h2></div>
            <label style={{ marginBottom: 12, display: "block" }}><span className="field-label">Subject</span>
              <select value={sid} onChange={e => setSid(e.target.value)} data-testid="select-doc-subject">{subjects.map(s => <option key={s.id} value={s.id}>{s.name} · Semester {s.semester}</option>)}</select></label>
            {subject && <GenerationForm key={subject.id} subject={subject} />}
          </section>
          <section className="panel panel-pad" aria-labelledby="h-saved">
            <div className="section-title"><h2 id="h-saved">Saved versions</h2>
              <span style={{ display: "flex", gap: 6 }}>
                <div className="seg small" role="radiogroup" aria-label="Which versions">
                  <label className={scope === "subject" ? "on" : ""}><input type="radio" checked={scope === "subject"} onChange={() => setScope("subject")} data-testid="radio-docs-subject" /> This subject</label>
                  <label className={scope === "all" ? "on" : ""}><input type="radio" checked={scope === "all"} onChange={() => setScope("all")} data-testid="radio-docs-all" /> All</label>
                </div>
                <button className="btn small" onClick={() => void refresh()} data-testid="button-refresh-docs"><RefreshCw size={12} /> Refresh</button></span></div>
            {docsErr && <div className="notice red" role="alert"><AlertTriangle size={14} /><span style={{ flex: 1 }}>{docsErr}</span><button className="btn small" onClick={() => void refresh()}>Retry</button></div>}
            {docs === null ? <div style={{ display: "grid", gap: 8 }}><div className="skel" style={{ height: 44 }} /><div className="skel" style={{ height: 44 }} /></div> :
              grouped.length === 0 ? <EmptyState mark="DOCX" title="No documents yet">Generated files are kept here as versions. Older versions are never replaced.</EmptyState> :
              grouped.map(([gid, list]) => <div key={gid} className="doc-group">
                <div className="kicker" style={{ display: "flex", justifyContent: "space-between" }}><span>{nameOf(gid)}</span><span>{list.length}</span></div>
                {list.map(d => <DocRow key={d.id} d={d} numbers={numbersOf(d)} desktop={runtime?.mode === "desktop"} opening={opening} act={act} />)}
              </div>)}
            {subject && <a className="inline-link small" style={{ marginTop: 8, display: "inline-block" }} href={href(`/subject/${subject.id}`)}>Back to {subject.name}</a>}
          </section>
        </div>)}
      </div>
    </Shell>
  );
}
