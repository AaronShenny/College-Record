import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, Check, ChevronDown, ClipboardPaste, FilePlus, FileText, FileUp, ImagePlus, Plus, RefreshCw, Trash2, Type, X } from "lucide-react";
import { Shell } from "@/components/shell";
import { EmptyState, href } from "@/components/kit";
import { ProgramDialog } from "@/components/dialogs";
import { GeneratePanel } from "@/components/generate-panel";
import { fixMissing, takeIntent } from "@/components/focus-intent";
import { bridge } from "@/lib/bridge";
import { withTimeout } from "@/lib/with-timeout";
import { sourceNameError as nameError } from "@/lib/source-filename";
import type { OutputItem, Program, SourceFile, Subject } from "@/lib/contracts";
import { FieldValue, setValue } from "@/components/field-values";
import { mappingsForTemplate } from "@/lib/subject-configuration";
import { activePrograms, errMsg, mapProgram, newId, pad, programChecks, programState, useStore } from "@/hooks/use-workspace";

const ROLES = ["Main code", "Helper code", "Header", "Input data", "Unassigned"];
const MAX_CODE = 1_000_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

async function readTextFile(file: File): Promise<string> {
  if (file.size > MAX_CODE * 4) throw new Error(`${file.name} is too large. Source files are limited to 1,000,000 characters.`);
  const text = await file.text();
  if (text.includes("\0")) throw new Error(`${file.name} looks like a binary file. Only text source files can be added.`);
  if (text.length > MAX_CODE) throw new Error(`${file.name} has ${text.length.toLocaleString()} characters; the limit is 1,000,000.`);
  return text;
}
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("The image could not be read.")); r.readAsDataURL(blob); });
}
async function imageFromBlob(blob: Blob, name: string): Promise<Extract<OutputItem, { kind: "image" }>> {
  if (!IMAGE_TYPES.includes(blob.type)) throw new Error(`Unsupported image type${blob.type ? " (" + blob.type + ")" : ""}. Use PNG, JPEG or WebP.`);
  if (blob.size > MAX_IMAGE_BYTES) throw new Error(`Image is ${(blob.size / 1048576).toFixed(1)} MB; the limit is 8 MB.`);
  return { id: newId(), kind: "image", name: name.slice(0, 500), dataUrl: await blobToDataUrl(blob), include: true };
}

export default function Editor({ sid, pid }: { sid: string; pid: string }) {
  const { workspace } = useStore();
  const subject = workspace!.subjects.find(s => s.id === sid);
  const program = subject?.programs.find(p => p.id === pid);
  if (!subject || !program || subject.trashedAt || program.trashedAt) {
    return <Shell active="subjects" crumb="Program"><div className="page"><div className="panel">
      <EmptyState mark="?" title={program?.trashedAt || subject?.trashedAt ? "This program is in Trash" : "Program not found"} action={<a className="btn primary" href={href(program || subject ? "/trash" : "/")}>{program || subject ? "Open Trash" : "Back to subjects"}</a>}>
        Restore it from Trash to continue editing. Nothing was deleted.
      </EmptyState></div></div></Shell>;
  }
  return <EditorBody key={program.id} subject={subject} program={program} />;
}

function EditorBody({ subject, program }: { subject: Subject; program: Program }) {
  const { update, runtime, notify, setDraft, drafts, generationChoices, setGenerationChoice } = useStore();
  const [addOpen, setAddOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const progs = activePrograms(subject);
  const idx = progs.findIndex(p => p.id === program.id);
  const prev = progs[idx - 1]; const next = progs[idx + 1];
  const desktop = runtime?.mode === "desktop";
  const st = programState(program, subject);
  const checks = programChecks(program, subject);
  const missing = checks.filter(c => !c.ok);

  const patch = (fn: (p: Program) => Program, stale = false) => update(w => mapProgram(w, subject.id, program.id, fn, stale));

  const [numText, setNumText] = useState(String(program.number));
  const n = Number(numText);
  const numErr = !/^\d+$/.test(numText) || n < 1 || n > 9999 ? "Whole number from 1 to 9999." : progs.some(p => p.id !== program.id && p.number === n) ? `Program ${n} already exists.` : "";
  useEffect(() => { setDraft(`num-${program.id}`, !!numErr); return () => setDraft(`num-${program.id}`, false); }, [numErr, program.id, setDraft]);

  const srcInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
  const imgInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [outErr, setOutErr] = useState<string | null>(null);
  const [srcErr, setSrcErr] = useState<string | null>(null);
  const [activeSrc, setActiveSrc] = useState<string | null>(program.sources[0]?.id ?? null);
  const current = program.sources.find(s => s.id === activeSrc) ?? program.sources[0];

  const uniqueName = (base: string) => { const names = new Set(program.sources.map(s => s.name)); if (!names.has(base)) return base; const [stem, ext] = base.includes(".") ? [base.slice(0, base.lastIndexOf(".")), base.slice(base.lastIndexOf("."))] : [base, ""]; let i = 2; while (names.has(`${stem}-${i}${ext}`)) i++; return `${stem}-${i}${ext}`; };
  const addSource = (src: SourceFile) => {
    if (program.sources.length >= 50) { setSrcErr("A program can hold at most 50 source files."); return; }
    setSrcErr(null);
    const id = newId();
    patch(p => ({ ...p, sources: [...p.sources, { ...src, id, name: uniqueName(src.name) }] }), true);
    setActiveSrc(id);
    requestAnimationFrame(() => document.getElementById(`code-${id}`)?.focus());
  };
  const newBlank = () => addSource({ id: newId(), name: program.sources.length ? "helper.c" : "main.c", role: program.sources.length ? "Helper code" : "Main code", code: "", include: true });
  const importSource = async () => {
    if (!desktop) { srcInput.current?.click(); return; }
    setBusy("import");
    try { const s = await bridge.importSource(); if (s) addSource(s); } catch (e) { setSrcErr(errMsg(e)); } finally { setBusy(null); }
  };
  const onSourceFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      try { const code = await readTextFile(f); addSource({ id: newId(), name: f.name.slice(0, 200), role: program.sources.length ? "Helper code" : "Main code", code, include: true }); }
      catch (e) { setSrcErr(errMsg(e)); }
    }
  };
  const replaceSource = async (id: string) => {
    if (!desktop) { replaceTarget.current = id; replaceInput.current?.click(); return; }
    setBusy("replace-" + id);
    try { const s = await bridge.importSource(); if (s) { patch(p => ({ ...p, sources: p.sources.map(x => x.id === id ? { ...x, name: s.name, code: s.code } : x) }), true); notify(`Replaced with ${s.name}.`); } }
    catch (e) { setSrcErr(errMsg(e)); } finally { setBusy(null); }
  };
  const onReplaceFile = async (files: FileList | null) => {
    const f = files?.[0]; const id = replaceTarget.current; if (!f || !id) return;
    try { const code = await readTextFile(f); patch(p => ({ ...p, sources: p.sources.map(x => x.id === id ? { ...x, name: f.name.slice(0, 200), code } : x) }), true); notify(`Replaced with ${f.name}. The previous copy in this record was overwritten.`); }
    catch (e) { setSrcErr(errMsg(e)); }
  };

  const addOutput = (o: OutputItem) => {
    if (program.outputs.length >= 100) { setOutErr("A program can hold at most 100 output items."); return; }
    setOutErr(null);
    patch(p => ({ ...p, outputs: [...p.outputs, o] }));
  };
  const onImages = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) { try { addOutput(await imageFromBlob(f, f.name)); } catch (e) { setOutErr(`${f.name}: ${errMsg(e)}`); } }
  };
  const pasteImage = async () => {
    setBusy("paste"); setOutErr(null);
    try {
      if (desktop) {
        const img = await withTimeout(bridge.pasteImage(), 8000, "Clipboard reading timed out. Copy a screenshot and retry, or use Add image.");
        if (img) addOutput({ ...img, id: newId() }); else setOutErr("The clipboard has no image. Take a screenshot (Win + Shift + S), then press Paste screenshot.");
        return;
      }
      if (!navigator.clipboard?.read) throw new Error("This browser does not allow reading images from the clipboard. Use Add image instead, or the installed desktop app.");
      const items = await withTimeout(navigator.clipboard.read(), 8000, "Clipboard permission is still waiting. Allow clipboard access and retry, or use Add image.");
      for (const item of items) {
        const type = item.types.find(t => t.startsWith("image/"));
        if (type) { addOutput(await imageFromBlob(await withTimeout(item.getType(type), 8000, "The clipboard image could not be read in time. Retry or use Add image."), `pasted-screenshot-${pad(program.outputs.length + 1)}.png`)); return; }
      }
      setOutErr("The clipboard has no image. Copy a screenshot first, then press Paste screenshot.");
    } catch (e) {
      const m = errMsg(e);
      setOutErr(/denied|permission|NotAllowed/i.test(m) ? "Clipboard access was blocked by the browser. Allow clipboard permission or use Add image." : m);
    } finally { setBusy(null); }
  };
  const moveOutput = (i: number, d: number) => patch(p => { const j = i + d; if (j < 0 || j >= p.outputs.length) return p; const a = [...p.outputs]; [a[i], a[j]] = [a[j]!, a[i]!]; return { ...p, outputs: a }; });
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const openGenerate = () => {
    if (!generationChoices[subject.id]) setGenerationChoice(subject.id, { programIds: [program.id] });
    setGenOpen(true);
  };

  // Validation links: jump to the real input, expanding the details disclosure when needed.
  const focusEl = (sel: string, expand = false) => {
    if (expand) setDetailsOpen(true);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(sel);
      if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); el.focus(); }
    }));
  };
  const subjectLevel = (field: string) => field === "subject.name" || field === "semester" || field === "courseCode" || (field.startsWith("custom:") && subject.fields?.find(d => d.id === field.slice(7))?.scope === "subject");
  const fixCheck = (field: string) => {
    if (field === "number") return focusEl("#input-number");
    if (field === "title") return focusEl("#input-title");
    if (field === "question") return focusEl("#input-question", true);
    if (field === "output") return focusEl("[data-testid=button-paste-image]");
    if (field.startsWith("source:")) {
      const role = field.slice(7);
      const match = program.sources.find(s => !role || s.role === role) ?? null;
      if (match) { setActiveSrc(match.id); return focusEl(`#code-${CSS.escape(match.id)}`); }
      return focusEl("[data-testid=button-new-source]");
    }
    if (field.startsWith("custom:")) return focusEl(`#fv-${CSS.escape(field.slice(7))} :is(input,textarea,select,button)`, true);
  };

  const scopeOf = (id: string) => subject.fields?.find(d => d.id === id)?.scope;
  const fixRef = useRef(fixCheck); fixRef.current = fixCheck;
  useEffect(() => { const i = takeIntent(x => x.programField?.pid === program.id); if (i?.programField) fixRef.current(i.programField.field); }, [program.id, genOpen]);

  // With an active template, only show what its placeholders actually use. Hidden values are never removed.
  const tplFields = subject.template ? new Set(Object.values(mappingsForTemplate(subject.template, subject.template.mappings)).map(m => m.field)) : null;
  if (subject.index?.enabled) subject.index.columns.forEach(c => tplFields?.add(c.field));
  const shows = (field: string) => !tplFields || tplFields.has(field);
  const showQuestion = shows("question");
  const showSources = !tplFields || [...tplFields].some(f => f.startsWith("source:"));
  const showOutput = shows("output");
  const programFields = (subject.fields ?? []).filter(f => f.scope === "program" && shows(`custom:${f.id}`));
  const subjectFields = (subject.fields ?? []).filter(f => f.scope === "subject" && shows(`custom:${f.id}`));
  const manualCols = subject.index?.enabled ? subject.index.columns.filter(c => c.field === "manual") : [];
  const showDetails = showQuestion || programFields.length > 0 || manualCols.length > 0 || subjectFields.length > 0;
  const filledFields = programFields.filter(f => program.values?.[f.id]?.trim()).length;
  const lines = current?.code ? current.code.split("\n").length : 0;

  return (
    <Shell active="subjects" crumb={`${subject.name} / Program ${pad(program.number)}`}>
      <div className="desk">
        <header className="desk-head">
          <a className="btn small ghost" href={href(`/subject/${subject.id}`)} data-testid="link-back-subject"><ArrowLeft size={13} /> {subject.name}</a>
          <div className="desk-id">
            <label className="num-field"><span className="kicker">No.</span>
              <input id="input-number" type="number" min={1} max={9999} value={numText} aria-invalid={!!numErr} aria-label="Program number" data-testid="input-number"
                onChange={e => { const v = e.target.value; setNumText(v); const k = Number(v); if (/^\d+$/.test(v) && k >= 1 && k <= 9999 && !progs.some(p => p.id !== program.id && p.number === k)) patch(p => ({ ...p, number: k })); }} /></label>
            {shows("title") ? <label className="title-field"><span className="sr-only">Program title</span>
              <input id="input-title" type="text" maxLength={500} value={program.title} onChange={e => patch(p => ({ ...p, title: e.target.value }))} placeholder="Program title" data-testid="input-title" /></label> :
              <span className="title-field">{program.title || `Program ${program.number}`}</span>}
            <span className={`badge ${st.tone}`} data-testid="status-program">{st.label}</span>
          </div>
          <nav className="editor-nav" aria-label="Switch program">
            {prev ? <a className="btn small" href={href(`/program/${subject.id}/${prev.id}`)} data-testid="link-prev-program"><ArrowLeft size={12} /> <b>{pad(prev.number)}</b></a> : <button className="btn small" disabled aria-label="No previous program"><ArrowLeft size={12} /></button>}
            <span className="muted">{idx + 1} / {progs.length}</span>
            {next ? <a className="btn small" href={href(`/program/${subject.id}/${next.id}`)} data-testid="link-next-program">Next <b>{pad(next.number)}</b> <ArrowRight size={12} /></a> : <button className="btn small" disabled>Next <ArrowRight size={12} /></button>}
          </nav>
          <button className="btn primary" onClick={openGenerate} data-testid="button-open-generate"><FileText size={14} /> Generate…</button>
        </header>
        {numErr && <div className="err desk-err" role="alert">Program number: {numErr} Not saved until fixed.</div>}

        <div className="desk-body">
          <aside className="program-list-panel" aria-label="Programs in this subject">
            <div className="program-list-title"><div className="kicker">Programs</div><span className="badge neutral">{progs.length}</span></div>
            {progs.map(p => { const t = programState(p, subject).tone; return (
              <a key={p.id} className={`program-list-row ${p.id === program.id ? "selected" : ""}`} href={href(`/program/${subject.id}/${p.id}`)} aria-current={p.id === program.id ? "page" : undefined} data-testid={`link-program-${p.id}`}>
                <span className="list-no">{pad(p.number)}</span><span>{p.title || "Untitled"}</span><i className={`list-status ${t === "good" ? "" : t === "warn" ? "status-warn" : "status-empty"}`} aria-label={programState(p, subject).label} />
              </a>); })}
            <button className="add-program-link" onClick={() => setAddOpen(true)} data-testid="button-add-program"><Plus size={13} /> Add program</button>
          </aside>

          <div className="desk-main">
            <div className={`details-bar ${detailsOpen ? "open" : ""}`}>
              {showDetails && <button className="details-toggle" aria-expanded={detailsOpen} aria-controls="details-body" onClick={() => {
                if (!detailsOpen) focusEl("#input-question", true);
                else setDetailsOpen(false);
              }} data-testid="button-toggle-details">
                <ChevronDown size={14} className="chev" /> {showQuestion ? `Question${programFields.length || manualCols.length ? " & record fields" : ""}` : "Record fields"}
                <span className="muted details-peek">{showQuestion ? (program.question ? program.question.slice(0, 70) + (program.question.length > 70 ? "…" : "") : "No question yet") : ""}{programFields.length ? `${showQuestion ? " · " : ""}${filledFields}/${programFields.length} fields` : ""}</span>
              </button>}
              <div className="check-chips" aria-label="Required content">
                {missing.length === 0 ? <span className="chip ok"><Check size={12} /> Required content present</span> :
                  missing.map(c => (subjectLevel(c.field) || c.field.startsWith("Unknown") || c.label.startsWith("Unknown"))
                    ? <button key={c.field + c.label} className="chip miss" onClick={() => fixMissing(subject.id, program.id, c.field, scopeOf)} data-testid={`link-fix-${c.field}`}><AlertTriangle size={12} /> {c.label} <small>{c.field.startsWith("custom:") ? "Template page" : c.label.startsWith("Unknown") ? "check mapping" : "Subject settings"}</small></button>
                    : <button key={c.field + c.label} className="chip miss" onClick={() => fixCheck(c.field)} data-testid={`button-fix-${c.field}`}><AlertTriangle size={12} /> {c.label}</button>)}
                {program.outputMayBeStale && <span className="chip warn"><RefreshCw size={12} /> Output may be outdated
                  <button className="chip-act" onClick={() => patch(p => ({ ...p, outputMayBeStale: false }))} data-testid="button-mark-current">Still current</button></span>}
              </div>
            </div>
            {detailsOpen && showDetails && <section id="details-body" className="details-body panel" aria-label="Question and record fields">
              {showQuestion && <label className="question-field"><span className="field-label">Question</span>
                <textarea id="input-question" rows={3} maxLength={100000} value={program.question} onChange={e => patch(p => ({ ...p, question: e.target.value }))} placeholder="Paste the question exactly as given in your lab manual" data-testid="input-question" /></label>}
              {programFields.length > 0 && <div className="fv-grid">{programFields.map(f => <div key={f.id} id={`fv-${f.id}`}><FieldValue def={f} value={program.values?.[f.id]} onChange={v => patch(p => ({ ...p, values: setValue(p.values, f.id, v) }))} /></div>)}</div>}
              {manualCols.length > 0 && <div className="fv-grid index-manual">{manualCols.map(c => <label key={c.id}><span className="field-label">Index: {c.label}</span>
                <input type="text" maxLength={2000} value={program.indexValues?.[c.id] ?? ""} data-testid={`input-index-value-${c.id}`} onChange={e => { const v = e.target.value.slice(0, 2000); patch(p => { const iv = { ...p.indexValues }; if (v) iv[c.id] = v; else delete iv[c.id]; return { ...p, indexValues: iv }; }); }} /></label>)}</div>}
              <div className="inherited-line"><span className="kicker">From subject</span>
                <span>Course code <b>{subject.courseCode || "Not set"}</b></span><span>Semester <b>{subject.semester}</b></span>
                {subjectFields.map(f => <span key={f.id}>{f.label} <b>{subject.values?.[f.id]?.trim() ? (f.type === "image" ? "image set" : subject.values[f.id]!.slice(0, 40)) : "Not set"}</b></span>)}
                <a className="inline-link" href={href(`/subject/${subject.id}`)}>Subject settings</a></div>
            </section>}

            <div className="work-split" style={showSources && showOutput ? undefined : { gridTemplateColumns: "minmax(0,1fr)" }}>
              {showSources && <section className="pane code-pane" aria-labelledby="h-sources">
                <div className="pane-head">
                  <h2 id="h-sources">Code</h2>
                  <div className="src-tabs" role="tablist" aria-label="Source files">
                    {program.sources.map((s, index) => <button key={s.id} id={`tab-${s.id}`} role="tab" aria-controls={`source-panel-${s.id}`} aria-selected={current?.id === s.id} tabIndex={current?.id === s.id ? 0 : -1} className={`src-tab ${current?.id === s.id ? "on" : ""} ${s.include ? "" : "off"}`} onClick={() => setActiveSrc(s.id)}
                      onKeyDown={e => {
                        const count = program.sources.length;
                        const target = e.key === "ArrowRight" ? (index + 1) % count : e.key === "ArrowLeft" ? (index + count - 1) % count : e.key === "Home" ? 0 : e.key === "End" ? count - 1 : -1;
                        if (target < 0) return;
                        e.preventDefault();
                        const source = program.sources[target]!;
                        setActiveSrc(source.id);
                        document.getElementById(`tab-${source.id}`)?.focus();
                      }} data-testid={`tab-source-${s.id}`}>{s.name}{drafts.has(`src-${s.id}`) && <span className="tab-bad" aria-label="file name needs fixing"> !</span>}</button>)}
                  </div>
                  <span style={{ flex: 1 }} />
                  <button className="btn small" onClick={newBlank} data-testid="button-new-source"><FilePlus size={13} /> New file</button>
                  <button className="btn small" onClick={importSource} disabled={busy === "import"} data-testid="button-import-source"><FileUp size={13} /> {busy === "import" ? "Opening…" : "Import file"}</button>
                </div>
                <input ref={srcInput} type="file" multiple hidden onChange={e => { void onSourceFiles(e.target.files); e.target.value = ""; }} />
                <input ref={replaceInput} type="file" hidden onChange={e => { void onReplaceFile(e.target.files); e.target.value = ""; }} />
                {srcErr && <div className="notice red pane-notice" role="alert"><AlertTriangle size={14} /><span style={{ flex: 1 }}>{srcErr}</span><button className="icon-btn" aria-label="Dismiss" onClick={() => setSrcErr(null)}><X size={12} /></button></div>}
                {!current ? <div className="pane-empty"><p>No code yet. Paste your program into a new file, or copy one in from your computer.</p>
                  <button className="btn primary" onClick={newBlank} data-testid="button-new-source-empty"><FilePlus size={14} /> New file and paste code</button></div>
                  : program.sources.map(src => <SourceEditor key={src.id} s={src} extraRoles={[...(subject.sourceRoles ?? []), ...[...(tplFields ?? [])].filter(f => f.startsWith("source:")).map(f => f.slice(7))]} hidden={src.id !== current.id} busy={busy === "replace-" + src.id} confirming={confirmRemove === src.id}
                    onChange={(fn, stale) => patch(p => ({ ...p, sources: p.sources.map(x => x.id === src.id ? fn(x) : x) }), stale)}
                    onReplace={() => void replaceSource(src.id)} onAskRemove={() => setConfirmRemove(src.id)} onCancelRemove={() => setConfirmRemove(null)}
                    onRemove={() => { const rest = program.sources.filter(x => x.id !== src.id); patch(p => ({ ...p, sources: p.sources.filter(x => x.id !== src.id) }), true); setActiveSrc(rest[0]?.id ?? null); setConfirmRemove(null); }} />)}
                {current && <div className="code-footer"><span>{lines} line{lines === 1 ? "" : "s"} · {current.code.length.toLocaleString()} / 1,000,000</span><span>{program.sources.filter(s => s.include).length} of {program.sources.length} file{program.sources.length === 1 ? "" : "s"} included</span></div>}
              </section>}

              {showOutput && <section className="pane out-pane" aria-labelledby="h-outputs">
                <div className="pane-head">
                  <h2 id="h-outputs">Output</h2>
                  <span className="muted" style={{ fontSize: 11 }}>{program.outputs.filter(o => o.include).length} of {program.outputs.length} included</span>
                  <span style={{ flex: 1 }} />
                  <button className="btn small primary paste-btn" onClick={pasteImage} disabled={busy === "paste"} data-testid="button-paste-image"><ClipboardPaste size={13} /> {busy === "paste" ? "Reading…" : "Paste screenshot"}</button>
                  <button className="btn small" onClick={() => imgInput.current?.click()} data-testid="button-add-image"><ImagePlus size={13} /> Add image</button>
                  <button className="btn small" onClick={() => addOutput({ id: newId(), kind: "text", name: `Output text ${pad(program.outputs.length + 1)}`, text: "", include: true })} data-testid="button-add-text"><Type size={13} /> Add text</button>
                </div>
                <input ref={imgInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e => { void onImages(e.target.files); e.target.value = ""; }} />
                {outErr && <div className="notice red pane-notice" role="alert"><AlertTriangle size={14} /><span style={{ flex: 1 }}>{outErr}</span><button className="icon-btn" aria-label="Dismiss" onClick={() => setOutErr(null)}><X size={12} /></button></div>}
                <div className="out-scroll">
                  {program.outputs.length === 0 && <div className="pane-empty"><p>Run your program, press <b>Win + Shift + S</b> to capture it, then press <b>Paste screenshot</b>. PNG, JPEG or WebP up to 8 MB, or plain text.</p></div>}
                  {program.outputs.map((o, i) => (
                    <div key={o.id} className={`output-item ${o.include ? "" : "excluded"}`} data-testid={`output-${o.id}`}>
                      <span className="output-order">{pad(i + 1)}</span>
                      <div className="output-meta">
                        <div className="output-row">
                          <label style={{ flex: 1, minWidth: 0 }}><span className="sr-only">Output name</span><input type="text" maxLength={500} value={o.name} onChange={e => patch(p => ({ ...p, outputs: p.outputs.map(x => x.id === o.id ? { ...x, name: e.target.value } : x) }))} data-testid={`input-output-name-${o.id}`} /></label>
                          <label className="inclusion"><input type="checkbox" className="check" checked={o.include} onChange={e => patch(p => ({ ...p, outputs: p.outputs.map(x => x.id === o.id ? { ...x, include: e.target.checked } : x) }))} data-testid={`check-output-${o.id}`} /> Include</label>
                          <div className="output-actions">
                            {confirmRemove === o.id ? <span className="confirm-inline">Remove?
                              <button className="btn small danger" onClick={() => { patch(p => ({ ...p, outputs: p.outputs.filter(x => x.id !== o.id) })); setConfirmRemove(null); }}>Remove</button>
                              <button className="btn small" onClick={() => setConfirmRemove(null)}>Keep</button></span> : <>
                              <button className="icon-btn" aria-label="Move output up" disabled={i === 0} onClick={() => moveOutput(i, -1)}><ArrowDown size={13} style={{ transform: "rotate(180deg)" }} /></button>
                              <button className="icon-btn" aria-label="Move output down" disabled={i === program.outputs.length - 1} onClick={() => moveOutput(i, 1)}><ArrowDown size={13} /></button>
                              <button className="icon-btn" aria-label="Remove output" onClick={() => setConfirmRemove(o.id)}><Trash2 size={13} /></button></>}
                          </div>
                        </div>
                        {o.kind === "image" ? <div className="output-shot"><img src={o.dataUrl} alt={o.name || `Output image ${i + 1}`} /></div>
                          : <label><span className="sr-only">Output text</span><textarea value={o.text} maxLength={500000} spellCheck={false} placeholder="Paste console output here" onChange={e => { const v = e.target.value; patch(p => ({ ...p, outputs: p.outputs.map(x => x.id === o.id && x.kind === "text" ? { ...x, text: v } : x) })); }} /></label>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>}
              {!showSources && !showOutput && <div className="pane-empty"><p>This template does not use code or output. Fill in the record fields above.</p></div>}
            </div>
          </div>
        </div>
      </div>
      <ProgramDialog open={addOpen} onClose={() => setAddOpen(false)} subject={subject} />
      <GeneratePanel subject={subject} open={genOpen} onClose={() => setGenOpen(false)} />
    </Shell>
  );
}

function SourceEditor({ s, extraRoles, hidden, busy, confirming, onChange, onReplace, onAskRemove, onCancelRemove, onRemove }: {
  extraRoles: string[];
  s: SourceFile; hidden: boolean; busy: boolean; confirming: boolean; onChange: (fn: (s: SourceFile) => SourceFile, stale: boolean) => void;
  onReplace: () => void; onAskRemove: () => void; onCancelRemove: () => void; onRemove: () => void;
}) {
  const { setDraft } = useStore();
  const [name, setName] = useState(s.name);
  const err = nameError(name);
  useEffect(() => { setDraft(`src-${s.id}`, !!err); return () => setDraft(`src-${s.id}`, false); }, [err, s.id, setDraft]);
  useEffect(() => { setName(s.name); }, [s.name]);
  const roles = [...new Set([s.role, ...extraRoles, ...ROLES])];
  return (
    <div id={`source-panel-${s.id}`} role="tabpanel" aria-labelledby={`tab-${s.id}`} className="source-editor" hidden={hidden} data-testid={`source-${s.id}`}>
      <div className="source-file-top">
        <label><span className="sr-only">File name</span><input type="text" value={name} aria-invalid={!!err} onChange={e => { const v = e.target.value; setName(v); if (!nameError(v)) onChange(x => ({ ...x, name: v }), false); }} data-testid={`input-source-name-${s.id}`} /></label>
        <label><span className="sr-only">File role</span><select value={s.role} onChange={e => onChange(x => ({ ...x, role: e.target.value }), false)} data-testid={`select-source-role-${s.id}`}>{roles.map(r => <option key={r} value={r}>{r || "Unassigned"}</option>)}</select></label>
        <label className="inclusion"><input type="checkbox" className="check" checked={s.include} onChange={e => onChange(x => ({ ...x, include: e.target.checked }), false)} data-testid={`check-source-${s.id}`} /> Include</label>
        <span style={{ flex: 1 }} />
        <button className="btn small ghost" onClick={onReplace} disabled={busy} data-testid={`button-replace-${s.id}`}><RefreshCw size={12} /> {busy ? "Opening…" : "Replace file"}</button>
        {confirming ? <span className="confirm-inline">Remove file?<button className="btn small danger" onClick={onRemove}>Remove</button><button className="btn small" onClick={onCancelRemove}>Keep</button></span>
          : <button className="icon-btn" aria-label={`Remove ${s.name}`} onClick={onAskRemove} data-testid={`button-remove-source-${s.id}`}><Trash2 size={13} /></button>}
      </div>
      {err && <div className="err" style={{ padding: "0 10px 6px" }}>{err} The previous name is kept until fixed.</div>}
      <textarea id={`code-${s.id}`} className="code-editor" aria-label={`Code for ${s.name}`} spellCheck={false} value={s.code} maxLength={MAX_CODE} data-testid={`textarea-code-${s.id}`}
        onChange={e => { const v = e.target.value; onChange(x => ({ ...x, code: v }), true); }}
        onKeyDown={e => {
          if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault(); const t = e.currentTarget; const a = t.selectionStart, b = t.selectionEnd;
            const v = t.value.slice(0, a) + "    " + t.value.slice(b); onChange(x => ({ ...x, code: v }), true);
            requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = a + 4; });
          }
        }}
        placeholder="Paste or type your code here. Tab indents; press Esc then Tab to leave." onKeyUp={e => { if (e.key === "Escape") (e.currentTarget as HTMLTextAreaElement).blur(); }} />
    </div>
  );
}
