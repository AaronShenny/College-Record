import { ArrowDown, Plus, Trash2 } from "lucide-react";
import type { Subject } from "@/lib/contracts";
import { mapSubject, newId, nowIso, useStore } from "@/hooks/use-workspace";

type Index = NonNullable<Subject["index"]>;
const BASE: [string, string][] = [
  ["number", "Program number"], ["title", "Program title"], ["question", "Question"],
  ["subject.name", "Subject name"], ["semester", "Semester"], ["courseCode", "Course code"],
  ["manual", "Typed per program"], ["blank", "Blank column"],
];
const MAX = 12;

export function IndexSetup({ subject }: { subject: Subject }) {
  const { update } = useStore();
  const index: Index = subject.index ?? { enabled: false, title: "Index", columns: [] };
  const textFields = (subject.fields ?? []).filter(f => f.type === "text");
  const options: [string, string][] = [...BASE, ...textFields.map(f => [`custom:${f.id}`, f.label] as [string, string])];
  const labelOf = (field: string) => options.find(o => o[0] === field)?.[1] ?? "Column";
  const set = (fn: (i: Index) => Index) => update(w => mapSubject(w, subject.id, s => {
    const next = fn(s.index ?? { enabled: false, title: "Index", columns: [] });
    return { ...s, index: next.enabled && next.columns.length === 0 ? { ...next, enabled: false } : next, updatedAt: nowIso() };
  }));
  const move = (i: number, d: number) => set(x => { const j = i + d; if (j < 0 || j >= x.columns.length) return x; const c = [...x.columns]; [c[i], c[j]] = [c[j]!, c[i]!]; return { ...x, columns: c }; });
  const add = () => set(x => x.columns.length >= MAX ? x : { ...x, columns: [...x.columns, { id: newId(), label: x.columns.length ? "Title" : "No.", field: x.columns.length ? "title" : "number" }] });

  return (
    <section className="panel panel-pad" style={{ marginTop: 16 }} aria-labelledby="h-index" data-testid="panel-index-setup">
      <div className="section-title"><div><h2 id="h-index">Subject index</h2><p className="hint">An optional table listing every program. Page numbers are not available yet.</p></div>
        <label className="required-toggle"><input type="checkbox" className="check" checked={index.enabled} disabled={index.columns.length === 0}
          onChange={e => set(x => ({ ...x, enabled: e.target.checked }))} data-testid="check-index-enabled" /> {index.enabled ? "On" : "Off"}</label></div>
      <label style={{ display: "block", marginBottom: 12 }}><span className="field-label">Index heading</span>
        <input type="text" maxLength={200} value={index.title} onChange={e => { const v = e.target.value; set(x => ({ ...x, title: v })); }} data-testid="input-index-title" /></label>
      {index.columns.length === 0 && <p className="hint" style={{ marginTop: 0 }}>Add a column to turn the index on.</p>}
      {index.columns.map((c, i) => (
        <div key={c.id} className="index-col-row" data-testid={`row-index-col-${c.id}`}>
          <span className="list-no mono">{String(i + 1).padStart(2, "0")}</span>
          <select aria-label="Column content" value={c.field} onChange={e => { const f = e.target.value; set(x => ({ ...x, columns: x.columns.map(y => y.id === c.id ? { ...y, field: f, label: y.label === labelOf(y.field) ? labelOf(f) : y.label } : y) })); }} data-testid={`select-index-field-${c.id}`}>
            {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            {!options.some(o => o[0] === c.field) && <option value={c.field}>Missing field</option>}
          </select>
          <input type="text" aria-label="Column label" maxLength={120} value={c.label} onChange={e => { const v = e.target.value; if (v.trim()) set(x => ({ ...x, columns: x.columns.map(y => y.id === c.id ? { ...y, label: v } : y) })); }} data-testid={`input-index-label-${c.id}`} />
          <span style={{ display: "flex", gap: 2 }}>
            <button className="icon-btn" aria-label="Move column up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowDown size={13} style={{ transform: "rotate(180deg)" }} /></button>
            <button className="icon-btn" aria-label="Move column down" disabled={i === index.columns.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
            <button className="icon-btn" aria-label={`Remove column ${c.label}`} onClick={() => set(x => ({ ...x, columns: x.columns.filter(y => y.id !== c.id) }))} data-testid={`button-remove-index-${c.id}`}><Trash2 size={13} /></button>
          </span>
        </div>))}
      <button className="btn small" disabled={index.columns.length >= MAX} onClick={add} data-testid="button-add-index-column"><Plus size={12} /> Column{index.columns.length >= MAX ? " (12 max)" : ""}</button>
    </section>
  );
}
