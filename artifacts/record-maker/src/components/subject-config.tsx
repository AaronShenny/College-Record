import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, Upload } from "lucide-react";
import { Modal, go } from "./kit";
import type { Subject } from "@/lib/contracts";
import { feature } from "@/lib/workflow-api";
import { MAX_CONFIGURATION_BYTES, applyConfiguration, exportConfiguration, parseConfiguration, type SubjectConfiguration } from "@/lib/subject-configuration";
import { errMsg, mapSubject, newId, nowIso, useStore } from "@/hooks/use-workspace";

const fileName = (name: string) => `${name.replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-") || "subject"}.recordly.json`;

export function ExportConfigDialog({ open, onClose, subject }: { open: boolean; onClose: () => void; subject: Subject }) {
  const { runtime, notify } = useStore();
  const [include, setInclude] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setInclude(false); setErr(null); } }, [open]);
  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const configuration = exportConfiguration(subject, include && !!subject.template);
      if (runtime?.mode === "desktop") {
        const r = await feature<{ saved?: boolean } | null>("export-configuration", { configuration, suggestedName: fileName(subject.name) });
        if (r && r.saved === false) return;
      } else {
        const url = URL.createObjectURL(new Blob([JSON.stringify(configuration, null, 2)], { type: "application/json" }));
        const a = document.createElement("a"); a.href = url; a.download = fileName(subject.name); a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      notify("Subject configuration exported. Programs and student values were not included."); onClose();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Export subject configuration"
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={() => void run()} data-testid="button-confirm-export-config"><Download size={13} /> {busy ? "Exporting…" : "Export"}</button></>}>
      <p className="hint" style={{ margin: 0 }}>Shares the setup only: custom field definitions, mappings, source roles and index layout. Programs, code, outputs and entered values stay on this computer.</p>
      <label className="required-toggle"><input type="checkbox" className="check" disabled={!subject.template} checked={include && !!subject.template} onChange={e => setInclude(e.target.checked)} data-testid="check-include-template" /> Include Word template{subject.template ? ` (${subject.template.name})` : " (none uploaded)"}</label>
      {include && <p className="hint">Review the template before sharing: text already written inside the Word file is included unchanged and may contain personal information.</p>}
      {err && <div className="notice red" role="alert"><AlertTriangle size={14} /><span>{err}</span></div>}
    </Modal>
  );
}

/** Reads a configuration and re-inspects any included DOCX so its placeholder list is trusted. */
async function verify(config: SubjectConfiguration): Promise<SubjectConfiguration> {
  if (!config.template) return config;
  const r = await feature<{ placeholders: string[] }>("inspect-template", { dataBase64: config.template.dataBase64 });
  return parseConfiguration(JSON.stringify({ ...config, template: { ...config.template, placeholders: r.placeholders } }));
}

export function ImportConfigDialog({ open, onClose, subject }: { open: boolean; onClose: () => void; subject?: Subject }) {
  const { runtime, update, notify } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [config, setConfig] = useState<SubjectConfiguration | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(""); const [sem, setSem] = useState("1"); const [code, setCode] = useState("");
  const [choice, setChoice] = useState<"keep" | "included" | "later" | "">("");
  const [ack, setAck] = useState(false);
  useEffect(() => { if (open) { setConfig(null); setErr(null); setChoice(""); setAck(false); } }, [open]);

  const accept = async (c: SubjectConfiguration | null) => {
    if (!c) return;
    const v = await verify(c);
    setConfig(v); setName(v.name); setCode(v.courseCode); setSem(String(subject?.semester ?? 1));
    setChoice(subject?.template ? "" : v.template ? "included" : "later");
  };
  const choose = async () => {
    setErr(null);
    if (runtime?.mode !== "desktop") { input.current?.click(); return; }
    setBusy(true);
    try { await accept(await feature<SubjectConfiguration | null>("import-configuration")); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    setBusy(true); setErr(null);
    try {
      if (f.size > MAX_CONFIGURATION_BYTES) throw new Error("Configuration exceeds 24 MB.");
      await accept(parseConfiguration(await f.text()));
    } catch (e) { setErr(e instanceof SyntaxError ? "This is not a valid configuration file." : errMsg(e)); } finally { setBusy(false); }
  };

  const semN = Number(sem);
  const formErr = subject ? "" : !name.trim() ? "Subject name is required." : name.trim().length > 150 ? "Keep the name under 150 characters." : !Number.isInteger(semN) || semN < 1 || semN > 20 ? "Semester must be 1 to 20." : code.length > 50 ? "Course code must be 50 characters or fewer." : "";
  const canApply = !!config && !!choice && !formErr && (!subject || ack);

  const apply = () => {
    if (!config || !choice) return;
    try {
      if (subject) {
        const next = applyConfiguration(subject, config, choice);
        update(w => mapSubject(w, subject.id, () => next));
        notify("Configuration applied. Program content was kept; review the template mapping.");
      } else {
        const blank: Subject = { id: newId(), name: name.trim(), semester: semN, courseCode: code.trim(), updatedAt: nowIso(), trashedAt: null, programs: [] };
        const next = applyConfiguration(blank, config, choice);
        update(w => ({ ...w, subjects: [...w.subjects, next] }));
        notify("Subject created from configuration.");
        go(`/subject/${next.id}`);
      }
      onClose();
    } catch (e) { setErr(errMsg(e)); }
  };

  const textFields = config?.fields.length ?? 0;
  return (
    <Modal open={open} onClose={onClose} title={subject ? "Import configuration into this subject" : "New subject from configuration"}
      footer={<><button className="btn" onClick={onClose} data-testid="button-cancel-import-config">Cancel</button>
        {config && <button className="btn primary" disabled={!canApply} onClick={apply} data-testid="button-apply-config">{subject ? "Apply configuration" : "Create subject"}</button>}</>}>
      <input ref={input} type="file" hidden accept=".json,application/json" onChange={e => { void onFile(e.target.files?.[0]); e.target.value = ""; }} data-testid="input-config-file" />
      {!config ? <>
        <p className="hint" style={{ margin: 0 }}>Choose a Recordly configuration file (.json, up to 24 MB). You can review it before anything changes.</p>
        <button className="btn" disabled={busy} onClick={() => void choose()} data-testid="button-choose-config"><Upload size={13} /> {busy ? "Reading…" : "Choose configuration file"}</button>
      </> : <>
        <div className="config-review" data-testid="text-config-review">
          <span><b>{config.name}</b><span className="muted">{config.courseCode || "No course code"}</span></span>
          <span>Custom fields<b>{textFields}</b></span>
          <span>Mappings<b>{Object.keys(config.mappings).length}</b></span>
          <span>Source roles<b>{config.sourceRoles.length}</b></span>
          <span>Subject index<b>{config.index ? (config.index.enabled ? `${config.index.columns.length} column(s)` : "Off") : "Not set"}</b></span>
          <span>Word template<b>{config.template ? `${config.template.name}, ${config.template.placeholders.length} placeholder(s)` : "Not included"}</b></span>
        </div>
        {!subject && <div style={{ display: "grid", gap: 10 }}>
          <label><span className="field-label">Subject name <span className="required-star">*</span></span><input type="text" value={name} onChange={e => setName(e.target.value)} data-testid="input-config-subject-name" /></label>
          <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12 }}>
            <label><span className="field-label">Semester</span><input type="number" min={1} max={20} value={sem} onChange={e => setSem(e.target.value)} data-testid="input-config-semester" /></label>
            <label><span className="field-label">Course code</span><input type="text" value={code} onChange={e => setCode(e.target.value)} data-testid="input-config-code" /></label>
          </div>
          {formErr && <div className="err">{formErr}</div>}
        </div>}
        <fieldset className="choice-list" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label">Word template</legend>
          {subject?.template && <label><input type="radio" checked={choice === "keep"} onChange={() => setChoice("keep")} data-testid="radio-template-keep" /> Keep the current template ({subject.template.name})</label>}
          {config.template && <label><input type="radio" checked={choice === "included"} onChange={() => setChoice("included")} data-testid="radio-template-included" /> {subject?.template ? "Replace it with" : "Use"} the included template ({config.template.name})</label>}
          {!subject?.template && <label><input type="radio" checked={choice === "later"} onChange={() => setChoice("later")} data-testid="radio-template-later" /> Upload a template later; mappings wait until then</label>}
        </fieldset>
        {subject && <>
          <div className="notice" role="alert"><AlertTriangle size={14} /><span>Template mappings{config.index ? " and the subject index" : ""} will change and need review. Imported fields are added alongside existing ones. Programs, code, outputs and entered values are kept.</span></div>
          <label className="required-toggle"><input type="checkbox" className="check" checked={ack} onChange={e => setAck(e.target.checked)} data-testid="check-config-ack" /> I understand the mappings will change</label>
        </>}
      </>}
      {err && <div className="notice red" role="alert"><AlertTriangle size={14} /><span>{err}</span></div>}
    </Modal>
  );
}
