import { useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, CloudDownload, FileUp, FolderOpen, Link2, Trash2 } from "lucide-react";
import { Shell } from "@/components/shell";
import { EmptyState, PageHead, href } from "@/components/kit";
import type { Program, SourceFile } from "@/lib/contracts";
import { feature, importQuestions, localSourceFolder, type ImportResult } from "@/lib/workflow-api";
import { activePrograms, blankProgram, errMsg, mapProgram, mapSubject, newId, nowIso, pad, slug, useStore } from "@/hooks/use-workspace";

type Row = { key: string; selected: boolean; num: string; title: string; question: string; values: Record<string, string>; pages?: number[]; confidence?: string };
type Assign = { key: string; file: SourceFile; pid: string; role: string; suggested: boolean };

export default function ImportPage({ sid }: { sid: string }) {
  const { workspace, update, notify, runtime } = useStore();
  const subject = workspace!.subjects.find(s => s.id === sid);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [cols, setCols] = useState({ number: "", title: "", question: "" });
  const [customCols, setCustomCols] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<Row[]>([]);
  const tm = subject?.template?.mappings ?? {};
  const [needTitle, setNeedTitle] = useState(() => Object.values(tm).some(m => m.field === "title" && m.required));
  const [needQuestion, setNeedQuestion] = useState(() => Object.values(tm).some(m => m.field === "question" && m.required));
  const [report, setReport] = useState<{ created: number[]; skipped: number[] } | null>(null);
  // Sources
  const [srcBusy, setSrcBusy] = useState<string | null>(null);
  const [srcErr, setSrcErr] = useState<string | null>(null);
  const [assigns, setAssigns] = useState<Assign[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [driveId, setDriveId] = useState("");

  const progs = subject ? activePrograms(subject) : [];
  const existing = useMemo(() => new Set(progs.map(p => p.number)), [progs]);

  if (!subject || subject.trashedAt) {
    return <Shell active="subjects" crumb="Import"><div className="page"><div className="panel"><EmptyState mark="?" title="Subject not available" action={<a className="btn primary" href={href("/subjects")}>Back to subjects</a>}>Restore it from Trash or pick another subject.</EmptyState></div></div></Shell>;
  }
  const isPdf = !!file?.name.toLowerCase().endsWith(".pdf");

  const textFields = (subject?.fields ?? []).filter(f => f.scope === "program" && f.type === "text");
  const validNum = (v: string) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 9999;
  const toRows = (entries: { number: number | string | null; title: string; question: string; values?: Record<string, string>; sourcePages?: number[]; confidence?: string }[]): Row[] =>
    entries.map(e => { const num = e.number == null ? "" : String(e.number).trim(); return { key: newId(), selected: validNum(num) && !existing.has(Number(num)), num, title: e.title ?? "", question: e.question ?? "", values: e.values ?? {}, pages: e.sourcePages, confidence: e.confidence }; });

  const extract = async () => {
    if (!file) return;
    setBusy(true); setError(null); setResult(null); setRows([]); setReport(null);
    try {
      const r = await importQuestions(file, isPdf ? pages.trim() : "", sid);
      setResult(r);
      if (r.entries) setRows(toRows(r.entries));
      else if (r.columns) {
        const find = (re: RegExp) => r.columns!.find(c => re.test(c)) ?? "";
        setCols({ number: find(/^(no|num|number|program|exp|sl)/i), title: find(/title|name|aim/i), question: find(/question|description|problem/i) });
      }
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  };
  const buildCsvRows = () => {
    if (!result?.rows) return;
    setRows(toRows(result.rows.map(r => {
      const values: Record<string, string> = {};
      for (const f of textFields) { const c = customCols[f.id]; const v = c ? (r[c] ?? "").trim() : ""; if (v) values[f.id] = v; }
      return { number: cols.number ? String(r[cols.number] ?? "").trim() : null, title: cols.title ? r[cols.title] ?? "" : "", question: cols.question ? r[cols.question] ?? "" : "", values };
    })));
  };

  const counts = new Map<string, number>();
  rows.forEach(r => { if (validNum(r.num)) { const k = String(Number(r.num)); counts.set(k, (counts.get(k) ?? 0) + 1); } });
  const flag = (r: Row): { tone: string; label: string; ok: boolean } => {
    const n = Number(r.num);
    if (!/^\d+$/.test(r.num) || n < 1 || n > 9999) return { tone: "alert", label: r.num ? "Invalid number" : "Number missing", ok: false };
    if (existing.has(n)) return { tone: "neutral", label: "Existing number, skip", ok: false };
    if ((counts.get(String(n)) ?? 0) > 1) return { tone: "alert", label: "Duplicate number", ok: false };
    if (needTitle && !r.title.trim()) return { tone: "alert", label: "Title needed", ok: false };
    if (needQuestion && !r.question.trim()) return { tone: "alert", label: "Question needed", ok: false };
    return { tone: "good", label: "Ready", ok: true };
  };
  const patch = (key: string, p: Partial<Row>) => setRows(rs => rs.map(r => r.key === key ? { ...r, ...p } : r));
  const join = (i: number) => setRows(rs => {
    const a = rs[i]!, b = rs[i + 1]!; if (!b) return rs;
    const merged = { ...a, values: { ...b.values, ...a.values }, title: a.title || b.title, question: [a.question, b.title && a.title ? b.title : "", b.question].filter(Boolean).join(" ").trim(), pages: [...new Set([...(a.pages ?? []), ...(b.pages ?? [])])] };
    return [...rs.slice(0, i), merged, ...rs.slice(i + 2)];
  });
  const ready = rows.filter(r => r.selected && flag(r).ok);
  const skippedSelected = rows.filter(r => r.selected && existing.has(Number(r.num))).map(r => Number(r.num));

  const confirm = () => {
    const created = ready.map(r => {
      const p = blankProgram(Number(r.num), r.title.trim(), r.question.trim());
      const vals = Object.fromEntries(Object.entries(r.values).filter(([k, v]) => v.trim() && textFields.some(f => f.id === k)));
      return Object.keys(vals).length ? { ...p, values: vals } : p;
    });
    if (subject.programs.length + created.length > 500) { notify(`A subject can hold at most 500 programs, including ones in Trash. ${subject.programs.length} are already used.`, "error"); return; }
    update(w => mapSubject(w, sid, s => {
      const used = new Set(activePrograms(s).map(p => p.number));
      return { ...s, updatedAt: nowIso(), programs: [...s.programs, ...created.filter(p => !used.has(p.number))] };
    }));
    setReport({ created: created.map(p => p.number).sort((a, b) => a - b), skipped: [...new Set([...skippedSelected, ...rows.filter(r => existing.has(Number(r.num)) && !r.selected).map(r => Number(r.num))])].sort((a, b) => a - b) });
    setRows(rs => rs.filter(r => !ready.includes(r)));
    notify(`${created.length} program(s) created as drafts.`);
  };

  // ---- Source assignment ----
  const suggest = (f: SourceFile, list: Program[]): string => {
    const m = f.name.match(/(\d{1,4})/);
    if (m) { const p = list.find(p => p.number === Number(m[1])); if (p) return p.id; }
    const s = slug(f.name.replace(/\.[^.]+$/, ""));
    const p = list.find(p => p.title.trim() && (s.includes(slug(p.title)) || slug(p.title).includes(s)));
    return p?.id ?? "";
  };
  const loadFiles = (files: SourceFile[], origin: string) => {
    const list = activePrograms(workspace!.subjects.find(s => s.id === sid)!);
    if (files.length === 0) { setSrcErr(`No readable source files were found in the ${origin}.`); return; }
    setAssigns(files.map(f => { const pid = suggest(f, list); return { key: newId(), file: f, pid, role: f.role?.trim() || "Main code", suggested: !!pid }; }));
    setReviewed(false); setSrcErr(null);
  };
  const browserFolder = async (fl: FileList | null) => {
    if (!fl) return;
    setSrcBusy("browser"); setSrcErr(null);
    try {
      const out: SourceFile[] = []; let skipped = 0;
      for (const f of Array.from(fl).slice(0, 300)) {
        if (f.size > 1_000_000 || f.name.startsWith(".")) { skipped++; continue; }
        const text = await f.text();
        if (text.includes("\u0000")) { skipped++; continue; }
        out.push({ id: newId(), name: f.name.slice(0, 200), role: "Main code", code: text, include: true });
      }
      loadFiles(out, "folder");
      if (skipped) notify(`${skipped} binary, hidden or oversized file(s) were left out.`);
    } catch (e) { setSrcErr(errMsg(e)); } finally { setSrcBusy(null); }
  };
  const run = async (key: string, origin: string, fn: () => Promise<SourceFile[]>) => {
    setSrcBusy(key); setSrcErr(null);
    try { loadFiles(await fn(), origin); } catch (e) { setSrcErr(errMsg(e)); } finally { setSrcBusy(null); }
  };
  const copySources = () => {
    const chosen = assigns.filter(a => a.pid);
    for (const a of chosen) {
      update(w => mapProgram(w, sid, a.pid, p => p.sources.length >= 50 ? p : ({ ...p, sources: [...p.sources, { id: newId(), name: a.file.name, role: a.role.trim().slice(0, 80) || "Main code", code: a.file.code, include: true }] }), true));
    }
    notify(`${chosen.length} source file(s) copied. The originals were not changed or run.`);
    setAssigns([]); setReviewed(false);
  };
  const desktop = runtime?.mode === "desktop";

  return (
    <Shell active="subjects" crumb={`${subject.name} · Import`}>
      <div className="page">
        <a className="btn small ghost" href={href(`/subject/${sid}`)} style={{ marginBottom: 12, paddingLeft: 0 }} data-testid="link-back-subject"><ArrowLeft size={13} /> {subject.name}</a>
        <PageHead eyebrow={`${subject.name} · reviewed import`} title="Import questions"
          description="Bring in a question list from a selectable-text PDF or a CSV. Review every row before programs are created. Existing numbers are skipped, never overwritten." />

        <div className="import-source">
          <div className="source-file">
            <div className="csv-glyph">{file ? (isPdf ? "PDF" : "CSV") : "..."}</div>
            <div><b data-testid="text-import-file">{file ? file.name : "No file chosen"}</b><small>{file ? `${(file.size / 1024).toFixed(1)} KB · read locally, no OCR` : "PDF with selectable text, or CSV"}</small></div>
            <button className="btn small" onClick={() => fileRef.current?.click()} data-testid="button-choose-import"><FileUp size={12} /> {file ? "Change file" : "Choose file"}</button>
          </div>
          <input ref={fileRef} type="file" hidden accept=".pdf,.csv,application/pdf,text/csv" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setFile(f); setResult(null); setRows([]); setError(null); setReport(null); } }} data-testid="input-import-file" />
          {file && <div className="map-pair">
            {isPdf && <label><span className="field-label">Page range</span><input type="text" value={pages} onChange={e => setPages(e.target.value)} placeholder="All pages, or e.g. 3-7, 9" data-testid="input-page-range" /></label>}
            <label className="required-toggle" style={{ alignSelf: "end" }}><input type="checkbox" className="check" checked={needTitle} onChange={e => setNeedTitle(e.target.checked)} /> Titles required</label>
            <label className="required-toggle" style={{ alignSelf: "end" }}><input type="checkbox" className="check" checked={needQuestion} onChange={e => setNeedQuestion(e.target.checked)} /> Questions required</label>
            <button className="btn primary" style={{ alignSelf: "end" }} onClick={() => void extract()} disabled={busy} data-testid="button-extract">{busy ? "Reading…" : isPdf ? "Extract text" : "Read CSV"}</button>
          </div>}
        </div>
        {busy && <div className="skel" style={{ height: 120, marginBottom: 14 }} aria-busy="true" />}
        {error && <div className="notice red" role="alert" style={{ marginBottom: 14 }}><AlertTriangle size={14} /><span><b>Import failed.</b> {error}</span></div>}
        {result?.warnings?.length ? <div className="notice" style={{ marginBottom: 14 }}><AlertTriangle size={14} /><span>{result.warnings.map((w, i) => <span key={i} style={{ display: "block" }}>{w}</span>)}</span></div> : null}

        {result?.columns && (
          <section className="panel panel-pad" style={{ marginBottom: 14 }}>
            <div className="section-title"><div><h2>Map CSV columns</h2><p className="hint">{result.rows?.length ?? 0} rows · choose which column feeds each field.</p></div></div>
            <div className="map-pair" style={{ paddingTop: 0 }}>
              {(["number", "title", "question"] as const).map(k => <label key={k}><span className="field-label">{k === "number" ? "Program no. column" : k === "title" ? "Title column" : "Question column"}</span>
                <select value={cols[k]} onChange={e => setCols(c => ({ ...c, [k]: e.target.value }))} data-testid={`select-col-${k}`}><option value="">Not used</option>{result.columns!.map(c => <option key={c} value={c}>{c}</option>)}</select></label>)}
              {textFields.map(f => <label key={f.id}><span className="field-label">{f.label} column</span>
                <select value={customCols[f.id] ?? ""} onChange={e => setCustomCols(c => ({ ...c, [f.id]: e.target.value }))} data-testid={`select-col-custom-${f.id}`}><option value="">Not used</option>{result.columns!.map(c => <option key={c} value={c}>{c}</option>)}</select></label>)}
              <button className="btn primary" style={{ alignSelf: "end" }} disabled={!cols.number} onClick={buildCsvRows} data-testid="button-build-rows">Review rows</button>
            </div>
          </section>
        )}

        {report && <div className="notice green" role="status" style={{ marginBottom: 14 }} data-testid="text-import-report"><Check size={14} /><span>
          <b>Created {report.created.length}:</b> {report.created.map(pad).join(", ") || "none"}.{" "}
          {report.skipped.length > 0 && <><b>Skipped existing numbers:</b> {report.skipped.map(pad).join(", ")} (nothing was overwritten).</>}
        </span></div>}

        {rows.length > 0 && <>
          <div className="import-toolbar">
            <div><b>{rows.length} rows for review</b><span className="hint"> · edit, join split rows, remove noise</span></div>
            <div className="flag-summary">
              <span className="badge good">{rows.filter(r => flag(r).ok).length} ready</span>
              <span className="badge alert">{rows.filter(r => flag(r).tone === "alert").length} need correction</span>
              <span className="badge neutral">{rows.filter(r => existing.has(Number(r.num))).length} existing</span>
            </div>
          </div>
          <div className="import-grid-head"><span>Select</span><span>No.</span><span>Title</span><span>Question</span><span>Review</span><span /></div>
          <div className="import-rows">{rows.map((r, i) => { const f = flag(r); return (
            <div className={`import-row ${f.tone === "alert" ? "row-alert" : ""}`} key={r.key} data-testid={`row-import-${i}`}>
              <div className="row-select"><input className="check" type="checkbox" aria-label={`Select row ${i + 1}`} checked={r.selected} onChange={e => patch(r.key, { selected: e.target.checked })} /></div>
              <input aria-label={`Number row ${i + 1}`} type="text" inputMode="numeric" value={r.num} onChange={e => patch(r.key, { num: e.target.value.trim() })} className="row-number" />
              <input aria-label={`Title row ${i + 1}`} type="text" value={r.title} maxLength={500} onChange={e => patch(r.key, { title: e.target.value })} className="row-title" />
              <div style={{ display: "grid", gap: 4 }}>
                <textarea aria-label={`Question row ${i + 1}`} value={r.question} rows={2} onChange={e => patch(r.key, { question: e.target.value })} />
                {textFields.filter(f => r.values[f.id] !== undefined || Object.values(customCols).some(Boolean) && customCols[f.id]).map(f => <input key={f.id} type="text" aria-label={`${f.label} row ${i + 1}`} placeholder={f.label} value={r.values[f.id] ?? ""} onChange={e => patch(r.key, { values: { ...r.values, [f.id]: e.target.value } })} />)}
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                <span className={`badge ${f.tone}`}>{f.label}</span>
                {(r.pages?.length || r.confidence) && <small className="muted" style={{ fontSize: 10 }}>{r.pages?.length ? `p. ${r.pages.join(", ")}` : ""}{r.confidence ? ` · ${r.confidence}` : ""}</small>}
              </div>
              <div style={{ display: "grid", gap: 2 }}>
                <button className="icon-btn" aria-label={`Remove row ${i + 1}`} onClick={() => setRows(v => v.filter(x => x.key !== r.key))}><Trash2 size={13} /></button>
                {i < rows.length - 1 && <button className="icon-btn" title="Join with next row" aria-label={`Join row ${i + 1} with next`} onClick={() => join(i)} data-testid={`button-join-${i}`}><Link2 size={13} /></button>}
              </div>
            </div>); })}</div>
          <div className="import-note"><span><b>{ready.length} selected row(s) will become draft programs.</b> {skippedSelected.length > 0 && `Program(s) ${skippedSelected.map(pad).join(", ")} already exist and will be skipped. `}Code and output can be added later.</span>
            <button className="btn primary" style={{ marginLeft: "auto" }} disabled={ready.length === 0} onClick={confirm} data-testid="button-confirm-import">Create {ready.length} program(s)</button></div>
        </>}
        {result && rows.length === 0 && !result.columns && !report && <div className="notice blue">No question entries were found. If this PDF is scanned, it has no selectable text; OCR is not supported.</div>}

        <section className="folder-section" style={{ marginTop: 18 }}>
          <div className="folder-intro"><div className="folder-icon"><FolderOpen size={17} /></div><div>
            <div className="kicker">Optional · one-time copy</div><h2>Match source files to programs</h2>
            <p>Pick a folder of your code. Suggestions come from numbers and names in the filename; you confirm each one. Files are copied, never run, and no live link is kept.</p></div></div>
          <div style={{ display: "grid", gap: 8, minWidth: 220 }}>
            {desktop ? <button className="btn" disabled={!!srcBusy} onClick={() => void run("native", "folder", localSourceFolder)} data-testid="button-native-folder"><FolderOpen size={13} /> {srcBusy === "native" ? "Reading folder…" : "Choose local folder"}</button>
              : <button className="btn" disabled={!!srcBusy} onClick={() => folderRef.current?.click()} data-testid="button-browser-folder"><FolderOpen size={13} /> {srcBusy === "browser" ? "Reading folder…" : "Choose local folder"}</button>}
            <input ref={folderRef} type="file" hidden multiple {...{ webkitdirectory: "", directory: "" }} onChange={e => { void browserFolder(e.target.files); e.target.value = ""; }} />
            <form style={{ display: "flex", gap: 6 }} onSubmit={e => { e.preventDefault(); if (driveId.trim()) void run("drive", "Drive folder", () => feature<SourceFile[]>("drive-sources", { folderId: driveId.trim() })); }}>
              <input type="text" value={driveId} onChange={e => setDriveId(e.target.value)} placeholder="Drive folder ID or link" aria-label="Drive folder" data-testid="input-drive-folder" />
              <button className="btn small" type="submit" disabled={!driveId.trim() || !!srcBusy} data-testid="button-drive-folder"><CloudDownload size={12} /> {srcBusy === "drive" ? "…" : "Read"}</button>
            </form>
            <small className="hint">Drive folders need the desktop app signed in to Google.</small>
          </div>
        </section>
        {srcErr && <div className="notice red" role="alert" style={{ marginTop: 10 }}><AlertTriangle size={14} /><span>{srcErr}</span></div>}
        {assigns.length > 0 && <section className="panel panel-pad" style={{ marginTop: 12 }}>
          <div className="section-title"><div><h2>Review assignments</h2><p className="hint">{assigns.length} file(s) · {assigns.filter(a => a.pid).length} assigned. Leave a file unassigned to skip it.</p></div>
            <button className="btn small ghost" onClick={() => setAssigns([])}>Clear</button></div>
          <div className="assign-list">{assigns.map(a => <div className="file-suggestion" key={a.key} data-testid={`row-assign-${a.key}`}>
            <span className="mono" title={a.file.name}>{a.file.name}<small className="muted" style={{ display: "block" }}>{a.file.code.split("\n").length} lines</small></span>
            <select aria-label={`Program for ${a.file.name}`} value={a.pid} onChange={e => { setAssigns(v => v.map(x => x.key === a.key ? { ...x, pid: e.target.value, suggested: false } : x)); setReviewed(false); }}>
              <option value="">Unassigned, skip</option>{progs.map(p => <option key={p.id} value={p.id}>{pad(p.number)} {p.title || "Untitled"}</option>)}</select>
            <input type="text" aria-label={`Role for ${a.file.name}`} value={a.role} maxLength={80} onChange={e => { setAssigns(v => v.map(x => x.key === a.key ? { ...x, role: e.target.value } : x)); setReviewed(false); }} />
            <span className={`badge ${a.pid ? (a.suggested ? "warn" : "good") : "neutral"}`}>{a.pid ? (a.suggested ? "Suggested" : "Chosen") : "Skipped"}</span>
          </div>)}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <label className="required-toggle"><input type="checkbox" className="check" checked={reviewed} onChange={e => setReviewed(e.target.checked)} data-testid="check-reviewed-assign" /> I reviewed every program and role assignment</label>
            <button className="btn primary" disabled={!reviewed || !assigns.some(a => a.pid)} onClick={copySources} data-testid="button-copy-sources">Copy {assigns.filter(a => a.pid).length} file(s)</button>
          </div>
        </section>}
      </div>
    </Shell>
  );
}
