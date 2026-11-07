import { useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, FileUp, Plus, Trash2 } from "lucide-react";
import { Shell } from "@/components/shell";
import { EmptyState, Modal, PageHead, fmtTime, href } from "@/components/kit";
import { ConfirmDialog } from "@/components/dialogs";
import { FieldValue, setValue } from "@/components/field-values";
import type { FieldDefinition, FieldMapping, Subject, TemplateConfig } from "@/lib/contracts";
import { inspectTemplate } from "@/lib/workflow-api";
import { errMsg, mapSubject, newId, nowIso, useStore } from "@/hooks/use-workspace";

const BUILT_IN: [string, string][] = [
  ["number", "Program number"], ["title", "Program title"], ["question", "Question"], ["output", "Output sequence"],
  ["subject.name", "Subject name"], ["semester", "Semester"], ["courseCode", "Course code"],
];
const isImageField = (f: string, s: Subject) => f === "output" || (f.startsWith("custom:") && s.fields?.find(d => d.id === f.slice(7))?.type === "image");

export default function TemplatePage({ sid }: { sid: string }) {
  const { workspace, update, notify } = useStore();
  const subject = workspace!.subjects.find(s => s.id === sid);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fieldOpen, setFieldOpen] = useState(false);
  const [removeTpl, setRemoveTpl] = useState(false);
  const [removeField, setRemoveField] = useState<FieldDefinition | null>(null);
  const [extraRoles, setExtraRoles] = useState<string[]>([]);
  const [roleText, setRoleText] = useState("");

  const roles = useMemo(() => {
    const r = new Set<string>(extraRoles);
    subject?.programs.forEach(p => p.sources.forEach(s => s.role.trim() && r.add(s.role.trim())));
    Object.values(subject?.template?.mappings ?? {}).forEach(m => m.field.startsWith("source:") && r.add(m.field.slice(7)));
    return [...r].sort();
  }, [subject, extraRoles]);

  if (!subject || subject.trashedAt) {
    return <Shell active="subjects" crumb="Template"><div className="page"><div className="panel"><EmptyState mark="?" title="Subject not available" action={<a className="btn primary" href={href("/subjects")}>Back to subjects</a>}>Restore it from Trash or pick another subject.</EmptyState></div></div></Shell>;
  }
  const tpl = subject.template ?? null;
  const fields = subject.fields ?? [];
  const setSubject = (fn: (s: Subject) => Subject) => update(w => mapSubject(w, sid, s => ({ ...fn(s), updatedAt: nowIso() })));
  const setTpl = (fn: (t: TemplateConfig) => TemplateConfig) => setSubject(s => s.template ? { ...s, template: fn(s.template) } : s);
  const setMapping = (ph: string, m: FieldMapping | null) => setTpl(t => {
    const mappings = { ...t.mappings };
    if (m) mappings[ph] = m; else delete mappings[ph];
    return { ...t, mappings, reviewed: false };
  });
  const unmapped = tpl ? tpl.placeholders.filter(p => !tpl.mappings[p]) : [];

  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError(null); setWarnings([]);
    try {
      const { template, warnings: w } = await inspectTemplate(file);
      const prev = subject.template?.mappings ?? {};
      const carried: Record<string, FieldMapping> = {};
      for (const p of template.placeholders) if (prev[p]) carried[p] = prev[p];
      setSubject(s => ({ ...s, template: { ...template, mappings: carried, reviewed: false } }));
      setWarnings(w);
      notify(subject.template ? "Template replaced. Review every mapping again before generating; programs were not changed." : `Template read: ${template.placeholders.length} placeholder(s) found.`);
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  };

  const fieldOptions = (ph: string) => {
    const cur = tpl?.mappings[ph]?.field ?? "";
    return <select value={cur} aria-label={`Map ${ph}`} data-testid={`select-map-${ph}`} onChange={e => {
      const f = e.target.value;
      if (!f) return setMapping(ph, null);
      const old = tpl?.mappings[ph];
      const m: FieldMapping = { field: f, required: f === "skip" ? false : old?.required ?? false };
      if (isImageField(f, subject)) { m.imageFit = old?.imageFit ?? "width"; if (old?.widthCm) m.widthCm = old.widthCm; if (old?.heightCm) m.heightCm = old.heightCm; }
      setMapping(ph, m);
    }}>
      <option value="">Unmapped, choose a field</option>
      <optgroup label="Built-in">{BUILT_IN.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>
      <optgroup label="Source file role">{roles.map(r => <option key={r} value={`source:${r}`}>Source: {r}</option>)}</optgroup>
      {fields.length > 0 && <optgroup label="Custom fields">{fields.map(f => <option key={f.id} value={`custom:${f.id}`}>{f.label} ({f.type}, {f.scope})</option>)}</optgroup>}
      <option value="skip">Skip, leave empty (optional)</option>
      {cur && !["skip", ...BUILT_IN.map(b => b[0])].includes(cur) && !cur.startsWith("source:") && !fields.some(f => `custom:${f.id}` === cur) && <option value={cur}>Missing field ({cur})</option>}
    </select>;
  };

  return (
    <Shell active="subjects" crumb={<><a href={href(`/subject/${subject.id}`)} className="crumb-link" data-testid="link-crumb-subject">{subject.name}</a> / <strong>Template & mapping</strong></>}>
      <div className="page">
        <a className="btn small ghost" href={href(`/subject/${sid}`)} style={{ marginBottom: 12, paddingLeft: 0 }} data-testid="link-back-subject"><ArrowLeft size={13} /> {subject.name}</a>
        <PageHead eyebrow={`${subject.name} · subject setup`} title="Template & field mapping"
          description="One Word template and one mapping set are reused for every program in this subject. Formatting comes only from the template."
          actions={<>
            <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy} data-testid="button-upload-template"><FileUp size={13} /> {busy ? "Reading template…" : tpl ? "Replace template" : "Upload .docx"}</button>
            {tpl && <button className="btn primary" disabled={unmapped.length > 0 || tpl.reviewed || tpl.placeholders.length === 0} data-testid="button-save-reviewed"
              onClick={() => { setTpl(t => ({ ...t, reviewed: true })); notify("Mapping saved as reviewed."); }}>
              <Check size={13} /> {tpl.reviewed ? "Reviewed" : "Save reviewed mapping"}</button>}
          </>} />
        <input ref={fileRef} type="file" hidden accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} data-testid="input-template-file" />
        {error && <div className="notice red" role="alert" style={{ marginBottom: 14 }}><AlertTriangle size={14} /><span><b>Template not read.</b> {error}</span></div>}
        {warnings.length > 0 && <div className="notice" role="status" style={{ marginBottom: 14 }}><AlertTriangle size={14} /><span>{warnings.map((w, i) => <span key={i} style={{ display: "block" }}>{w}</span>)}</span></div>}

        {!tpl ? (
          <section className="panel">
            <EmptyState mark="DOCX" title="No template yet" action={<button className="btn primary" onClick={() => fileRef.current?.click()} disabled={busy} data-testid="button-upload-first"><FileUp size={13} /> {busy ? "Reading…" : "Choose your college .docx"}</button>}>
              Upload the Word record format your department gave you, with placeholders such as [TITLE] or {"{{QUESTION}}"}. It is read, never run, and stays inside this subject.
            </EmptyState>
          </section>
        ) : <>
          <div className="mapping-top">
            <div className="panel upload-panel">
              <div className="upload-doc">DOC</div>
              <div className="upload-info"><div className="kicker">Active .docx template</div><b data-testid="text-template-name">{tpl.name}</b><small>Uploaded {fmtTime(tpl.uploadedAt)} · {(tpl.dataBase64.length * 0.75 / 1024).toFixed(0)} KB</small></div>
              <div className="template-state">
                <span className={`badge ${tpl.reviewed ? "good" : "warn"}`} data-testid="status-template-review">{tpl.reviewed ? "Mapping reviewed" : "Needs review"}</span>
                <button className="btn small ghost" onClick={() => setRemoveTpl(true)} data-testid="button-remove-template"><Trash2 size={12} /> Remove</button>
              </div>
            </div>
            <div className="panel detect-summary">
              <span className="count-large">{tpl.placeholders.length}</span>
              <div><b>distinct placeholders</b><small>{unmapped.length === 0 ? "All mapped or skipped" : `${unmapped.length} still unmapped`}</small></div>
            </div>
          </div>
          {!tpl.reviewed && <div className="notice blue" style={{ marginBottom: 14 }}><AlertTriangle size={14} /><span>Map every placeholder, or mark it as an explicit optional skip, then save the reviewed mapping. Changing any row returns the mapping to review.</span></div>}

          <div className="mapping-columns">
            <section className="panel mapping-table-panel">
              <div className="section-title"><div><h2>Detected placeholders</h2><p className="hint">The placeholder name does not decide the mapping. You do.</p></div></div>
              {tpl.placeholders.length === 0 ? <p className="hint" style={{ padding: "0 17px 17px" }}>No placeholders were found. Add markers to the Word file and replace the template.</p> :
              <div style={{ overflowX: "auto" }}><table className="table">
                <thead><tr><th>Word placeholder</th><th>Mapped to</th><th>Required</th><th>Image fit</th></tr></thead>
                <tbody>{tpl.placeholders.map(ph => { const m = tpl.mappings[ph]; const img = m && isImageField(m.field, subject); return (
                  <tr key={ph} className={m ? "" : "row-unmapped"} data-testid={`row-placeholder-${ph}`}>
                    <td><span className="variable">{ph}</span>{!m && <small className="placement" style={{ color: "#93472f" }}>Unmapped</small>}</td>
                    <td style={{ minWidth: 200 }}>{fieldOptions(ph)}</td>
                    <td><label className="required-toggle"><input type="checkbox" className="check" disabled={!m || m.field === "skip"} checked={!!m?.required}
                      onChange={e => m && setMapping(ph, { ...m, required: e.target.checked })} data-testid={`check-required-${ph}`} />{m?.required ? "Required" : "Optional"}</label></td>
                    <td>{img ? <div className="fit-row">
                      <select value={m.imageFit ?? "width"} aria-label={`Image fit for ${ph}`} onChange={e => setMapping(ph, { ...m, imageFit: e.target.value as "width" | "box" })}><option value="width">Fit width</option><option value="box">Fit box</option></select>
                      <input type="number" min={0.5} max={50} step={0.1} placeholder="W cm" aria-label="Width cm" value={m.widthCm ?? ""} onChange={e => { const v = Number(e.target.value); const n = { ...m }; if (e.target.value && v > 0 && v <= 50) n.widthCm = v; else delete n.widthCm; setMapping(ph, n); }} />
                      {m.imageFit === "box" && <input type="number" min={0.5} max={50} step={0.1} placeholder="H cm" aria-label="Height cm" value={m.heightCm ?? ""} onChange={e => { const v = Number(e.target.value); const n = { ...m }; if (e.target.value && v > 0 && v <= 50) n.heightCm = v; else delete n.heightCm; setMapping(ph, n); }} />}
                    </div> : <span className="muted" style={{ fontSize: 11 }}>Not an image</span>}</td>
                  </tr>); })}</tbody>
              </table></div>}
              <div className="mapping-foot"><span>Repeated markers share one mapping.</span><span>Images keep proportions and shrink to fit.</span></div>
            </section>

            <aside className="mapping-aside">
              <section className="panel panel-pad">
                <div className="section-title"><h2>Source roles</h2></div>
                <p className="hint" style={{ marginTop: 0 }}>Each role maps separately, e.g. Main code and Helper code.</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>{roles.length === 0 ? <span className="hint">No roles yet.</span> : roles.map(r => <span key={r} className="badge blue">{r}</span>)}</div>
                <form style={{ display: "flex", gap: 6 }} onSubmit={e => { e.preventDefault(); const r = roleText.trim().slice(0, 80); if (r && !roles.includes(r)) setExtraRoles(x => [...x, r]); setRoleText(""); }}>
                  <input type="text" value={roleText} onChange={e => setRoleText(e.target.value)} placeholder="Add role name" maxLength={80} data-testid="input-new-role" />
                  <button className="btn small" type="submit" data-testid="button-add-role">Add</button>
                </form>
              </section>
              <section className="panel panel-pad">
                <div className="section-title"><h2>Custom fields</h2><button className="btn small" onClick={() => setFieldOpen(true)} data-testid="button-add-field"><Plus size={12} /> Field</button></div>
                {fields.length === 0 && <p className="hint" style={{ margin: 0 }}>Add text or image fields like Lab in-charge or a college crest.</p>}
                {fields.map(f => <div key={f.id} className="catalog-row">
                  <div><b>{f.label}</b><small>{f.type} · {f.scope === "subject" ? "whole record" : "per program"}{f.required ? " · required" : ""}</small></div>
                  <button className="icon-btn" aria-label={`Delete field ${f.label}`} onClick={() => setRemoveField(f)} data-testid={`button-delete-field-${f.id}`}><Trash2 size={13} /></button>
                </div>)}
              </section>
            </aside>
          </div>
        </>}

        <section className="panel panel-pad" style={{ marginTop: 16 }}>
          <div className="section-title"><div><h2>Whole-record values</h2><p className="hint">Entered once here, shown read-only in every program.</p></div></div>
          {fields.filter(f => f.scope === "subject").length === 0 ? <p className="hint" style={{ margin: 0 }}>No whole-record custom fields. Subject name, semester and course code come from the subject itself.</p> :
            <div className="fv-grid">{fields.filter(f => f.scope === "subject").map(f => <FieldValue key={f.id} def={f} value={subject.values?.[f.id]} onChange={v => setSubject(s => ({ ...s, values: setValue(s.values, f.id, v) }))} />)}</div>}
        </section>
      </div>

      <FieldDialog open={fieldOpen} onClose={() => setFieldOpen(false)} onAdd={f => setSubject(s => ({ ...s, fields: [...(s.fields ?? []), f] }))} />
      <ConfirmDialog open={removeTpl} onClose={() => setRemoveTpl(false)} title="Remove template?" confirmLabel="Remove template"
        body="The template and its mappings are removed from this subject. Programs, custom fields and earlier generated documents stay as they are."
        onConfirm={() => { setSubject(s => ({ ...s, template: null })); notify("Template removed."); }} />
      <ConfirmDialog open={!!removeField} onClose={() => setRemoveField(null)} title="Delete custom field?" confirmLabel="Delete field"
        body={removeField ? `"${removeField.label}" and its saved values are removed. Placeholders mapped to it become unmapped and need review.` : ""}
        onConfirm={() => {
          if (!removeField) return; const key = `custom:${removeField.id}`; const fid = removeField.id;
          setSubject(s => {
            const tplN = s.template ? { ...s.template, mappings: Object.fromEntries(Object.entries(s.template.mappings).filter(([, m]) => m.field !== key)), reviewed: Object.values(s.template.mappings).some(m => m.field === key) ? false : s.template.reviewed } : s.template;
            return { ...s, template: tplN, fields: (s.fields ?? []).filter(f => f.id !== fid), values: setValue(s.values, fid, undefined),
              programs: s.programs.map(p => p.values?.[fid] !== undefined ? { ...p, values: setValue(p.values, fid, undefined) } : p) };
          });
        }} />
    </Shell>
  );
}

function FieldDialog({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (f: FieldDefinition) => void }) {
  const [label, setLabel] = useState(""); const [type, setType] = useState<"text" | "image">("text");
  const [scope, setScope] = useState<"subject" | "program">("program"); const [required, setRequired] = useState(false);
  const [tried, setTried] = useState(false);
  const err = !label.trim() ? "Give the field a name." : label.trim().length > 120 ? "Keep it under 120 characters." : "";
  const submit = () => {
    setTried(true); if (err) return;
    onAdd({ id: newId(), label: label.trim(), type, scope, required });
    setLabel(""); setType("text"); setScope("program"); setRequired(false); setTried(false); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Add a custom field"
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={submit} data-testid="button-save-field">Add field</button></>}>
      <form onSubmit={e => { e.preventDefault(); submit(); }} style={{ display: "grid", gap: 12 }}>
        <label><span className="field-label">Field name <span className="required-star">*</span></span>
          <input type="text" autoFocus value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Faculty in charge" data-testid="input-field-label" />
          {tried && err && <div className="err">{err}</div>}</label>
        <div className="seg-row" role="radiogroup" aria-label="Field type">
          <label><input type="radio" checked={type === "text"} onChange={() => setType("text")} /> Text</label>
          <label><input type="radio" checked={type === "image"} onChange={() => setType("image")} /> Image</label>
        </div>
        <label><span className="field-label">Value scope</span>
          <select value={scope} onChange={e => setScope(e.target.value as "subject" | "program")} data-testid="select-field-scope"><option value="program">Per program</option><option value="subject">Whole record (subject)</option></select></label>
        <label className="required-toggle"><input type="checkbox" className="check" checked={required} onChange={e => setRequired(e.target.checked)} /> Required for generation</label>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
