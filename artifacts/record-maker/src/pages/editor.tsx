import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, Check, ClipboardPaste, FilePlus, FileUp, ImagePlus, Plus, RefreshCw, Save, Trash2, Type, X } from "lucide-react";
import { Shell, SaveIndicator } from "@/components/shell";
import { EmptyState, href } from "@/components/kit";
import { ProgramDialog } from "@/components/dialogs";
import { bridge } from "@/lib/bridge";
import type { OutputItem, Program, SourceFile, Subject } from "@/lib/contracts";
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
  const { update, saveNow, runtime, notify, setDraft } = useStore();
  const [addOpen, setAddOpen] = useState(false);
  const progs = activePrograms(subject);
  const idx = progs.findIndex(p => p.id === program.id);
  const prev = progs[idx - 1]; const next = progs[idx + 1];
  const desktop = runtime?.mode === "desktop";
  const st = programState(program);

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

  return (
    <Shell active="subjects" crumb={subject.name}>
      <div className="page" style={{ paddingTop: 22 }}>
        <div className="editor-heading">
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">{subject.name} · Program {pad(program.number)}{idx >= 0 ? ` (${idx + 1} of ${progs.length})` : ""}</div>
            <h1 data-testid="text-program-title">{program.title || "Untitled program"}</h1>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className={`badge ${st.tone}`}>{st.label}</span>
              {program.outputMayBeStale && <>
                <span className="hint" style={{ margin: 0 }}>Source changed after output was added. This warning does not block anything.</span>
                <button className="btn small ghost" onClick={() => patch(p => ({ ...p, outputMayBeStale: false }))} data-testid="button-mark-current"><Check size={12} /> Output is still current</button>
              </>}
            </div>
          </div>
        </div>

        <div className="editor-toolbar">
          <a className="btn small" href={href(`/subject/${subject.id}`)} data-testid="link-back-subject"><ArrowLeft size={13} /> Subject programs</a>
          <span className="editor-nav">
            {prev ? <a className="btn small ghost" href={href(`/program/${subject.id}/${prev.id}`)} data-testid="link-prev-program"><ArrowLeft size={12} /> Previous <b>{pad(prev.number)}</b></a> : <button className="btn small ghost" disabled><ArrowLeft size={12} /> Previous</button>}
            {next ? <a className="btn small ghost" href={href(`/program/${subject.id}/${next.id}`)} data-testid="link-next-program">Next <b>{pad(next.number)}</b> <ArrowRight size={12} /></a> : <button className="btn small ghost" disabled>Next <ArrowRight size={12} /></button>}
          </span>
          <div className="save-status">
            <SaveIndicator />
            <span className="muted"><i className="dot" />Drive sync pending</span>
            <button className="btn small primary" onClick={saveNow} data-testid="button-save-now"><Save size={12} /> Save Now</button>
          </div>
        </div>

        <div className="editor-layout">
          <aside className="program-list-panel" aria-label="Programs in this subject">
            <div className="program-list-title"><div className="kicker">Program list</div><span className="badge neutral">{progs.length}</span></div>
            {progs.map(p => { const t = programState(p).tone; return (
              <a key={p.id} className={`program-list-row ${p.id === program.id ? "selected" : ""}`} href={href(`/program/${subject.id}/${p.id}`)} aria-current={p.id === program.id ? "page" : undefined}>
                <span className="list-no">{pad(p.number)}</span><span>{p.title || "Untitled"}</span><i className={`list-status ${t === "good" ? "" : t === "warn" ? "status-warn" : "status-empty"}`} aria-hidden="true" />
              </a>); })}
            <button className="add-program-link" onClick={() => setAddOpen(true)} data-testid="button-add-program"><Plus size={13} /> Add program</button>
            <div className="inherited-card"><span className="kicker">Whole-record values</span><b>Course code</b><small>{subject.courseCode || "Not set"} · from subject</small><b>Semester</b><small>{subject.semester}</small></div>
          </aside>

          <div className="editor-center">
            <section className="panel" aria-labelledby="h-details">
              <div className="block-head"><div><h2 id="h-details">Program details</h2><p className="hint">Title and question can stay incomplete; they are saved as drafts.</p></div></div>
              <div className="detail-fields">
                <label><span className="field-label">Program number <span className="required-star">*</span></span>
                  <input type="number" min={1} max={9999} value={numText} aria-invalid={!!numErr} data-testid="input-number"
                    onChange={e => { const v = e.target.value; setNumText(v); const k = Number(v); if (/^\d+$/.test(v) && k >= 1 && k <= 9999 && !progs.some(p => p.id !== program.id && p.number === k)) patch(p => ({ ...p, number: k })); }} />
                  {numErr && <div className="err">{numErr} Not saved until fixed.</div>}</label>
                <label><span className="field-label">Program title</span>
                  <input type="text" maxLength={500} value={program.title} onChange={e => patch(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Binary search tree traversal" data-testid="input-title" /></label>
                <label className="question-field"><span className="field-label">Question</span>
                  <textarea rows={3} maxLength={100000} value={program.question} onChange={e => patch(p => ({ ...p, question: e.target.value }))} placeholder="Paste the question exactly as given in your lab manual" data-testid="input-question" /></label>
              </div>
            </section>

            <section className="panel" aria-labelledby="h-sources">
              <div className="block-head">
                <div><h2 id="h-sources">Source files</h2><p className="hint">Your own code, stored as independent copies. Nothing is compiled or run.</p></div>
                <div className="block-actions">
                  <button className="btn small" onClick={newBlank} data-testid="button-new-source"><FilePlus size={13} /> Paste code</button>
                  <button className="btn small" onClick={importSource} disabled={busy === "import"} data-testid="button-import-source"><FileUp size={13} /> {busy === "import" ? "Opening…" : "Import file"}</button>
                </div>
              </div>
              <input ref={srcInput} type="file" multiple hidden onChange={e => { void onSourceFiles(e.target.files); e.target.value = ""; }} />
              <input ref={replaceInput} type="file" hidden onChange={e => { void onReplaceFile(e.target.files); e.target.value = ""; }} />
              {srcErr && <div className="notice red" role="alert"><AlertTriangle size={14} /><span style={{ flex: 1 }}>{srcErr}</span><button className="icon-btn" aria-label="Dismiss" onClick={() => setSrcErr(null)}><X size={12} /></button></div>}
              {program.sources.length === 0 && <div className="notice blue">No source files yet. Use <b>Paste code</b> to type or paste into a new file, or <b>Import file</b> to copy one from your computer.</div>}
              {program.sources.map(s => <SourceCard key={s.id} s={s} busy={busy === "replace-" + s.id} confirming={confirmRemove === s.id}
                onChange={(fn, stale) => patch(p => ({ ...p, sources: p.sources.map(x => x.id === s.id ? fn(x) : x) }), stale)}
                onReplace={() => void replaceSource(s.id)} onAskRemove={() => setConfirmRemove(s.id)} onCancelRemove={() => setConfirmRemove(null)}
                onRemove={() => { patch(p => ({ ...p, sources: p.sources.filter(x => x.id !== s.id) }), true); setConfirmRemove(null); }} />)}
            </section>

            <section className="panel" aria-labelledby="h-outputs">
              <div className="block-head">
                <div><h2 id="h-outputs">Supplied output</h2><p className="hint">Your screenshots and text, kept in the order shown.</p></div>
                <div className="block-actions">
                  <button className="btn small paste" onClick={pasteImage} disabled={busy === "paste"} data-testid="button-paste-image"><ClipboardPaste size={13} /> {busy === "paste" ? "Reading…" : "PASTE"}</button>
                  <button className="btn small" onClick={() => imgInput.current?.click()} data-testid="button-add-image"><ImagePlus size={13} /> Add Image</button>
                  <button className="btn small" onClick={() => addOutput({ id: newId(), kind: "text", name: `Output text ${pad(program.outputs.length + 1)}`, text: "", include: true })} data-testid="button-add-text"><Type size={13} /> Add Text</button>
                </div>
              </div>
              <input ref={imgInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e => { void onImages(e.target.files); e.target.value = ""; }} />
              {outErr && <div className="notice red" role="alert" style={{ marginBottom: 10 }}><AlertTriangle size={14} /><span style={{ flex: 1 }}>{outErr}</span><button className="icon-btn" aria-label="Dismiss" onClick={() => setOutErr(null)}><X size={12} /></button></div>}
              {program.outputs.length === 0 && <div className="notice blue">No output yet. Take a screenshot of your program running, then press <b>PASTE</b>, or add an image file (PNG, JPEG, WebP up to 8 MB) or text.</div>}
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
          </div>

          <aside className="editor-right" aria-label="Record checklist">
            <div><div className="kicker">Content summary</div>
              <p style={{ margin: "6px 0 0" }}><b>{subject.name}</b><br />Program {pad(program.number)}</p></div>
            <div><div className="kicker">Sources included</div>
              {program.sources.filter(s => s.include).length === 0 ? <p className="hint">None</p> : program.sources.filter(s => s.include).map(s => <div key={s.id} style={{ marginTop: 4 }}><b>{s.role}</b> <span className="mono muted">{s.name}</span></div>)}</div>
            <div><div className="kicker">Output items included</div><p style={{ margin: "4px 0 0" }}>{program.outputs.filter(o => o.include).length} of {program.outputs.length}</p></div>
            <div className="panel" style={{ padding: 10 }}>
              <div className="kicker">Checklist</div>
              {programChecks(program).map(c => <div key={c.label} className={`check-row ${c.ok ? "ok" : "miss"}`}>{c.ok ? <Check size={13} /> : <AlertTriangle size={13} />}{c.label}</div>)}
              {program.outputMayBeStale && <div className="check-row miss"><RefreshCw size={13} />Output may be outdated <small className="muted">(non-blocking)</small></div>}
            </div>
            <div className="notice blue" style={{ fontSize: 11 }}>This is a content summary, not a Word preview. Document generation is not available in this build.</div>
          </aside>
        </div>
      </div>
      <ProgramDialog open={addOpen} onClose={() => setAddOpen(false)} subject={subject} />
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
