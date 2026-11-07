import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, Check, ChevronRight, ClipboardPaste, FilePlus, FileText, FileUp, ImagePlus, Plus, RefreshCw, Trash2, Type, X } from "lucide-react";
import { Shell } from "@/components/shell";
import { GenerateDialog } from "@/components/generate-dialog";
import { EmptyState, href } from "@/components/kit";
import { ProgramDialog } from "@/components/dialogs";
import { bridge } from "@/lib/bridge";
import type { OutputItem, Program, SourceFile, Subject } from "@/lib/contracts";
import { FieldValue, setValue } from "@/components/field-values";
import { activePrograms, errMsg, mapProgram, newId, pad, programChecks, programState, useStore } from "@/hooks/use-workspace";

const ROLES = ["Main code", "Helper code", "Header", "Input data", "Unassigned"];
const MAX_CODE = 1_000_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const nameError = (n: string) => !n.trim() ? "File name is required." : n.length > 200 ? "File name is too long." : /[\\/\x00]/.test(n) ? "Use a file name, not a path." : "";

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
      <EmptyState mark="?" title={program?.trashedAt || subject?.trashedAt ? "This program is in Trash" : "Program not found"} action={<a className="btn primary" href={href(program || subject ? "/trash" : "/subjects")}>{program || subject ? "Open Trash" : "Back to subjects"}</a>}>
        Restore it from Trash to continue editing. Nothing was deleted.
      </EmptyState></div></div></Shell>;
  }
  return <EditorBody key={program.id} subject={subject} program={program} />;
}

function EditorBody({ subject, program }: { subject: Subject; program: Program }) {
  const { update, runtime, notify, setDraft } = useStore();
  const [addOpen, setAddOpen] = useState(false);
  const progs = activePrograms(subject);
  const idx = progs.findIndex(p => p.id === program.id);
  const prev = progs[idx - 1]; const next = progs[idx + 1];
  const desktop = runtime?.mode === "desktop";
  const st = programState(program, subject);

  const patch = (fn: (p: Program) => Program, stale = false) => update(w => mapProgram(w, subject.id, program.id, fn, stale));

  // Program number: local draft, committed only when valid and unique.
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

  const uniqueName = (base: string) => { const names = new Set(program.sources.map(s => s.name)); if (!names.has(base)) return base; const [stem, ext] = base.includes(".") ? [base.slice(0, base.lastIndexOf(".")), base.slice(base.lastIndexOf("."))] : [base, ""]; let i = 2; while (names.has(`${stem}-${i}${ext}`)) i++; return `${stem}-${i}${ext}`; };
  const addSource = (src: SourceFile) => {
    if (program.sources.length >= 50) { setSrcErr("A program can hold at most 50 source files."); return; }
    setSrcErr(null);
    patch(p => ({ ...p, sources: [...p.sources, { ...src, id: newId(), name: uniqueName(src.name) }] }), true);
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
        const img = await bridge.pasteImage();
        if (img) addOutput({ ...img, id: newId() }); else setOutErr("The clipboard has no image. Take a screenshot (Win + Shift + S), then press PASTE.");
        return;
      }
      if (!navigator.clipboard?.read) throw new Error("This browser does not allow reading images from the clipboard. Use Add Image instead, or the installed desktop app.");
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find(t => t.startsWith("image/"));
        if (type) { addOutput(await imageFromBlob(await item.getType(type), `pasted-screenshot-${pad(program.outputs.length + 1)}.png`)); return; }
      }
      setOutErr("The clipboard has no image. Copy a screenshot first, then press PASTE.");
    } catch (e) {
      const m = errMsg(e);
      setOutErr(/denied|permission|NotAllowed/i.test(m) ? "Clipboard access was blocked by the browser. Allow clipboard permission or use Add Image." : m);
    } finally { setBusy(null); }
  };
  const moveOutput = (i: number, d: number) => patch(p => { const j = i + d; if (j < 0 || j >= p.outputs.length) return p; const a = [...p.outputs]; [a[i], a[j]] = [a[j]!, a[i]!]; return { ...p, outputs: a }; });
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const [genOpen, setGenOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const checks = programChecks(program, subject);
  const missing = checks.filter(c => !c.ok);
  const progFields = (subject.fields ?? []).filter(f => f.scope === "program");
  const subjFields = (subject.fields ?? []).filter(f => f.scope === "subject");
  const jump = (label: string) => {
    const l = label.toLowerCase();
    const custom = progFields.find(f => f.label === label);
    const target = custom ? `field-value-${custom.id}` : l.startsWith("title") ? "input-title" : l.startsWith("question") ? "input-question" : l.includes("output") ? "button-paste-top" : l.includes("source") ? "h-sources" : "sec-more";
    if (custom || target === "input-question" || target === "sec-more") setMoreOpen(true);
    requestAnimationFrame(() => { const el = document.querySelector<HTMLElement>(`[data-testid="${target}"], #${target}`); el?.scrollIntoView({ behavior: "smooth", block: "center" }); const f = el?.matches("input,textarea,button") ? el : el?.querySelector<HTMLElement>("input,textarea,button"); f?.focus({ preventScroll: true }); });
  };

  return (
    <Shell active="subjects" crumb={<><a href={href("/")} className="crumb-link">Subjects</a> / <a href={href(`/subject/${subject.id}`)} className="crumb-link" data-testid="link-back-subject">{subject.name}</a> / <strong>Program {pad(program.number)}</strong></>}>
      <div className="workspace">
        <aside className="program-list-panel" aria-label="Programs in this subject">
          <div className="program-list-title"><a href={href(`/subject/${subject.id}`)} className="kicker" data-testid="link-subject-overview">{subject.name}</a><span className="badge neutral">{progs.length}</span></div>
          {progs.map(p => { const t = programState(p, subject).tone; return (
            <a key={p.id} className={`program-list-row ${p.id === program.id ? "selected" : ""}`} href={href(`/program/${subject.id}/${p.id}`)} aria-current={p.id === program.id ? "page" : undefined} data-testid={`link-program-${p.id}`}>
              <span className="list-no">{pad(p.number)}</span><span>{p.title || "Untitled"}</span><i className={`list-status ${t === "good" ? "" : t === "warn" ? "status-warn" : "status-empty"}`} aria-label={programState(p, subject).label} />
            </a>); })}
          <button className="add-program-link" onClick={() => setAddOpen(true)} data-testid="button-add-program"><Plus size={13} /> Add program</button>
          <div className="list-setup">
            <a href={href(`/template/${subject.id}`)}>Template & mapping</a>
            <a href={href(`/import/${subject.id}`)}>Import</a>
            <a href={href(`/documents/${subject.id}`)}>Saved versions</a>
          </div>
        </aside>

        <div className="editor-center">
          <div className="editor-bar">
            <div className="title-line">
              <label className="num-field"><span className="sr-only">Program number</span><span aria-hidden="true">No.</span>
                <input type="number" min={1} max={9999} value={numText} aria-invalid={!!numErr} data-testid="input-number"
                  onChange={e => { const v = e.target.value; setNumText(v); const k = Number(v); if (/^\d+$/.test(v) && k >= 1 && k <= 9999 && !progs.some(p => p.id !== program.id && p.number === k)) patch(p => ({ ...p, number: k })); }} /></label>
              <label className="title-field"><span className="sr-only">Program title</span>
                <input type="text" maxLength={500} value={program.title} onChange={e => patch(p => ({ ...p, title: e.target.value }))} placeholder="Program title" data-testid="input-title" /></label>
              <h1 className="sr-only" data-testid="text-program-title">{program.title || "Untitled program"}</h1>
            </div>
            <div className="bar-actions">
              <button className="btn paste" onClick={pasteImage} disabled={busy === "paste"} data-testid="button-paste-top"><ClipboardPaste size={14} /> {busy === "paste" ? "Reading…" : "Paste screenshot"}</button>
              <button className="btn" onClick={() => setGenOpen(true)} data-testid="button-generate-program"><FileText size={14} /> Generate</button>
              {next ? <a className="btn primary" href={href(`/program/${subject.id}/${next.id}`)} data-testid="link-next-program">Next {pad(next.number)} <ArrowRight size={13} /></a>
                : <button className="btn primary" onClick={() => setAddOpen(true)} data-testid="button-next-new">New program <Plus size={13} /></button>}
            </div>
          </div>
          {numErr && <div className="err" role="alert">Program number: {numErr} Not saved until fixed.</div>}

          <div className="state-line">
            <span className={`badge ${st.tone}`} data-testid="status-program">{st.label}</span>
            {missing.map(c => <button key={c.label} className="miss-chip" onClick={() => jump(c.label)} data-testid={`button-missing-${c.label.toLowerCase().replace(/\W+/g, "-")}`}><AlertTriangle size={11} /> {c.label}</button>)}
            {program.outputMayBeStale && <span className="stale">Code changed after output. <button className="linkish" onClick={() => patch(p => ({ ...p, outputMayBeStale: false }))} data-testid="button-mark-current"><Check size={11} /> Output is still current</button></span>}
            <span style={{ flex: 1 }} />
            {prev && <a className="btn small ghost" href={href(`/program/${subject.id}/${prev.id}`)} data-testid="link-prev-program"><ArrowLeft size={12} /> {pad(prev.number)}</a>}
            <span className="muted" style={{ fontSize: 11 }}>{idx + 1} of {progs.length}</span>
          </div>

          <details className="more" id="sec-more" open={moreOpen} onToggle={e => setMoreOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary data-testid="toggle-details"><ChevronRight size={14} className="chev" /> Question{progFields.length ? ` & ${progFields.length} field${progFields.length > 1 ? "s" : ""}` : ""}
              <span className="summary-peek">{program.question ? program.question.slice(0, 90) : "No question yet"}</span></summary>
            <div className="more-body">
              <label><span className="field-label">Question</span>
                <textarea rows={3} maxLength={100000} value={program.question} onChange={e => patch(p => ({ ...p, question: e.target.value }))} placeholder="Paste the question from your lab manual" data-testid="input-question" /></label>
              {progFields.length > 0 && <div className="fv-grid">{progFields.map(f => <FieldValue key={f.id} def={f} value={program.values?.[f.id]} onChange={v => patch(p => ({ ...p, values: setValue(p.values, f.id, v) }))} />)}</div>}
              <div className="inherited"><span className="kicker">From subject</span> Course code {subject.courseCode || "not set"} · Semester {subject.semester}
                {subjFields.map(f => <span key={f.id}> · {f.label}: {subject.values?.[f.id] ? (f.type === "image" ? "image set" : subject.values[f.id]!.slice(0, 40)) : "not set"}</span>)}</div>
            </div>
          </details>

          <section className="panel" aria-labelledby="h-sources-title" id="h-sources">
            <div className="block-head">
              <h2 id="h-sources-title">Code</h2>
              <div className="block-actions">
                <button className="btn small" onClick={newBlank} data-testid="button-new-source"><FilePlus size={13} /> New file</button>
                <button className="btn small" onClick={importSource} disabled={busy === "import"} data-testid="button-import-source"><FileUp size={13} /> {busy === "import" ? "Opening…" : "Import file"}</button>
              </div>
            </div>
            <input ref={srcInput} type="file" multiple hidden onChange={e => { void onSourceFiles(e.target.files); e.target.value = ""; }} />
            <input ref={replaceInput} type="file" hidden onChange={e => { void onReplaceFile(e.target.files); e.target.value = ""; }} />
            {srcErr && <div className="notice red" role="alert"><AlertTriangle size={14} /><span style={{ flex: 1 }}>{srcErr}</span><button className="icon-btn" aria-label="Dismiss" onClick={() => setSrcErr(null)}><X size={12} /></button></div>}
            {program.sources.length === 0 && <button className="drop-empty" onClick={newBlank} data-testid="button-start-code"><FilePlus size={16} /> Start main.c and paste your code</button>}
            {program.sources.map(s => <SourceCard key={s.id} s={s} busy={busy === "replace-" + s.id} confirming={confirmRemove === s.id}
              onChange={(fn, stale) => patch(p => ({ ...p, sources: p.sources.map(x => x.id === s.id ? fn(x) : x) }), stale)}
              onReplace={() => void replaceSource(s.id)} onAskRemove={() => setConfirmRemove(s.id)} onCancelRemove={() => setConfirmRemove(null)}
              onRemove={() => { patch(p => ({ ...p, sources: p.sources.filter(x => x.id !== s.id) }), true); setConfirmRemove(null); }} />)}
          </section>

          <section className="panel" aria-labelledby="h-outputs">
            <div className="block-head">
              <h2 id="h-outputs">Output <span className="muted count">{program.outputs.filter(o => o.include).length} of {program.outputs.length} included</span></h2>
              <div className="block-actions">
                <button className="btn small paste" onClick={pasteImage} disabled={busy === "paste"} data-testid="button-paste-image"><ClipboardPaste size={13} /> {busy === "paste" ? "Reading…" : "Paste screenshot"}</button>
                <button className="btn small" onClick={() => imgInput.current?.click()} data-testid="button-add-image"><ImagePlus size={13} /> Image file</button>
                <button className="btn small" onClick={() => addOutput({ id: newId(), kind: "text", name: `Output text ${pad(program.outputs.length + 1)}`, text: "", include: true })} data-testid="button-add-text"><Type size={13} /> Text</button>
              </div>
            </div>
            <input ref={imgInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e => { void onImages(e.target.files); e.target.value = ""; }} />
            {outErr && <div className="notice red" role="alert" style={{ marginBottom: 10 }}><AlertTriangle size={14} /><span style={{ flex: 1 }}>{outErr}</span><button className="icon-btn" aria-label="Dismiss" onClick={() => setOutErr(null)}><X size={12} /></button></div>}
            {program.outputs.length === 0 && <p className="hint">Take a screenshot (Win + Shift + S), then Paste screenshot. PNG, JPEG or WebP up to 8 MB.</p>}
            <div className="output-list">
              {program.outputs.map((o, i) => (
                <div key={o.id} className={`output-item ${o.include ? "" : "excluded"}`} data-testid={`output-${o.id}`}>
                  <span className="output-order">{pad(i + 1)}</span>
                  {o.kind === "image" ? <div className="output-thumb"><img src={o.dataUrl} alt={o.name || `Output image ${i + 1}`} /></div> : <div className="output-thumb text">TEXT</div>}
                  <div className="output-meta">
                    <label><span className="sr-only">Output name</span><input type="text" maxLength={500} value={o.name} onChange={e => patch(p => ({ ...p, outputs: p.outputs.map(x => x.id === o.id ? { ...x, name: e.target.value } : x) }))} data-testid={`input-output-name-${o.id}`} /></label>
                    {o.kind === "text" && <label><span className="sr-only">Output text</span><textarea value={o.text} maxLength={500000} spellCheck={false} placeholder="Paste console output here" onChange={e => { const v = e.target.value; patch(p => ({ ...p, outputs: p.outputs.map(x => x.id === o.id && x.kind === "text" ? { ...x, text: v } : x) })); }} /></label>}
                    <label className="inclusion"><input type="checkbox" className="check" checked={o.include} onChange={e => patch(p => ({ ...p, outputs: p.outputs.map(x => x.id === o.id ? { ...x, include: e.target.checked } : x) }))} /> Include in record</label>
                  </div>
                  <div className="output-actions">
                    {confirmRemove === o.id ? <span className="confirm-inline">Remove?
                      <button className="btn small danger" onClick={() => { patch(p => ({ ...p, outputs: p.outputs.filter(x => x.id !== o.id) })); setConfirmRemove(null); }}>Remove</button>
                      <button className="btn small" onClick={() => setConfirmRemove(null)}>Keep</button></span> : <>
                      <button className="icon-btn" aria-label="Move output up" disabled={i === 0} onClick={() => moveOutput(i, -1)}><ArrowDown size={13} style={{ transform: "rotate(180deg)" }} /></button>
                      <button className="icon-btn" aria-label="Move output down" disabled={i === program.outputs.length - 1} onClick={() => moveOutput(i, 1)}><ArrowDown size={13} /></button>
                      <button className="icon-btn" aria-label="Remove output" onClick={() => setConfirmRemove(o.id)}><Trash2 size={13} /></button></>}
                  </div>
                </div>
              ))}
            </div>
          </section>
          {next && <a className="next-foot" href={href(`/program/${subject.id}/${next.id}`)} data-testid="link-next-program-foot">Next: <b className="mono">{pad(next.number)}</b> {next.title || "Untitled"} <ArrowRight size={14} /></a>}
        </div>
      </div>
      <ProgramDialog open={addOpen} onClose={() => setAddOpen(false)} subject={subject} />
      <GenerateDialog open={genOpen} onClose={() => setGenOpen(false)} subject={subject} programIds={[program.id]} />
    </Shell>
  );
}

function SourceCard({ s, busy, confirming, onChange, onReplace, onAskRemove, onCancelRemove, onRemove }: {
  s: SourceFile; busy: boolean; confirming: boolean; onChange: (fn: (s: SourceFile) => SourceFile, stale: boolean) => void;
  onReplace: () => void; onAskRemove: () => void; onCancelRemove: () => void; onRemove: () => void;
}) {
  const { setDraft } = useStore();
  const [name, setName] = useState(s.name);
  const err = nameError(name);
  useEffect(() => { setDraft(`src-${s.id}`, !!err); return () => setDraft(`src-${s.id}`, false); }, [err, s.id, setDraft]);
  useEffect(() => { setName(s.name); }, [s.name]);
  const lines = s.code ? s.code.split("\n").length : 0;
  const roles = ROLES.includes(s.role) ? ROLES : [s.role, ...ROLES];
  return (
    <div className="source-file-card" data-testid={`source-${s.id}`}>
      <div className="source-file-top">
        <label className="inclusion"><input type="checkbox" className="check" checked={s.include} onChange={e => onChange(x => ({ ...x, include: e.target.checked }), false)} /> Include</label>
        <label><span className="sr-only">File name</span><input type="text" value={name} aria-invalid={!!err} onChange={e => { const v = e.target.value; setName(v); if (!nameError(v)) onChange(x => ({ ...x, name: v }), false); }} /></label>
        <label><span className="sr-only">File role</span><select value={s.role} onChange={e => onChange(x => ({ ...x, role: e.target.value }), false)}>{roles.map(r => <option key={r} value={r}>{r || "Unassigned"}</option>)}</select></label>
        <span style={{ flex: 1 }} />
        <button className="btn small" onClick={onReplace} disabled={busy}><RefreshCw size={12} /> {busy ? "Opening…" : "Replace File"}</button>
        {confirming ? <span className="confirm-inline">Remove file?<button className="btn small danger" onClick={onRemove}>Remove</button><button className="btn small" onClick={onCancelRemove}>Keep</button></span>
          : <button className="icon-btn" aria-label={`Remove ${s.name}`} onClick={onAskRemove}><Trash2 size={13} /></button>}
      </div>
      {err && <div className="err" style={{ padding: "0 10px 6px" }}>{err} The previous name is kept until fixed.</div>}
      <textarea className="code-editor" aria-label={`Code for ${s.name}`} spellCheck={false} value={s.code} maxLength={MAX_CODE}
        onChange={e => { const v = e.target.value; onChange(x => ({ ...x, code: v }), true); }}
        onKeyDown={e => {
          if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault(); const t = e.currentTarget; const a = t.selectionStart, b = t.selectionEnd;
            const v = t.value.slice(0, a) + "    " + t.value.slice(b); onChange(x => ({ ...x, code: v }), true);
            requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = a + 4; });
          }
        }}
        placeholder="Paste or type your code here. Press Tab to indent; Esc then Tab to leave the editor." onKeyUp={e => { if (e.key === "Escape") (e.currentTarget as HTMLTextAreaElement).blur(); }} />
      <div className="code-footer"><span>{lines} line{lines === 1 ? "" : "s"} · {s.code.length.toLocaleString()} / 1,000,000 characters</span><span>{s.include ? "Included in record" : "Excluded from record"}</span></div>
    </div>
  );
}
