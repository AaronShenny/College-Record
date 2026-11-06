import { useEffect, useState } from "react";
import type { Subject } from "@/lib/contracts";
import { activePrograms, newId, nowIso, nextNumber, useStore, mapSubject } from "@/hooks/use-workspace";
import { Modal, go } from "./kit";

export function SubjectDialog({ open, onClose, subject }: { open: boolean; onClose: () => void; subject?: Subject }) {
  const { update, notify } = useStore();
  const [name, setName] = useState(""); const [sem, setSem] = useState("1"); const [code, setCode] = useState("");
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setName(subject?.name ?? ""); setSem(String(subject?.semester ?? 1)); setCode(subject?.courseCode ?? ""); setTried(false); } }, [open, subject]);
  const semN = Number(sem);
  const nameErr = !name.trim() ? "Subject name is required." : name.trim().length > 150 ? "Keep it under 150 characters." : "";
  const semErr = !Number.isInteger(semN) || semN < 1 || semN > 20 ? "Semester must be a whole number from 1 to 20." : "";
  const codeErr = code.length > 50 ? "Course code must be 50 characters or fewer." : "";
  const submit = () => {
    setTried(true);
    if (nameErr || semErr || codeErr) return;
    const t = nowIso();
    if (subject) {
      update(w => mapSubject(w, subject.id, s => ({ ...s, name: name.trim(), semester: semN, courseCode: code.trim(), updatedAt: t })));
      notify("Subject updated.");
    } else {
      const id = newId();
      update(w => ({ ...w, subjects: [...w.subjects, { id, name: name.trim(), semester: semN, courseCode: code.trim(), updatedAt: t, trashedAt: null, programs: [] }] }));
      notify("Subject created.");
      go(`/subject/${id}`);
    }
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={subject ? "Rename subject" : "New subject"}
      footer={<><button className="btn" onClick={onClose} data-testid="button-cancel-subject">Cancel</button><button className="btn primary" onClick={submit} data-testid="button-save-subject">{subject ? "Save changes" : "Create subject"}</button></>}>
      <form onSubmit={e => { e.preventDefault(); submit(); }} style={{ display: "grid", gap: 14 }}>
        <label><span className="field-label">Subject name <span className="required-star">*</span></span>
          <input type="text" autoFocus value={name} onChange={e => setName(e.target.value)} aria-invalid={tried && !!nameErr} placeholder="e.g. Data Structures Lab" data-testid="input-subject-name" />
          {tried && nameErr && <div className="err">{nameErr}</div>}</label>
        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12 }}>
          <label><span className="field-label">Semester <span className="required-star">*</span></span>
            <input type="number" min={1} max={20} value={sem} onChange={e => setSem(e.target.value)} aria-invalid={tried && !!semErr} data-testid="input-subject-semester" /></label>
          <label><span className="field-label">Course code</span>
            <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="Optional, e.g. CSL 201" data-testid="input-subject-code" /></label>
        </div>
        {tried && (semErr || codeErr) && <div className="err">{semErr || codeErr}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function ProgramDialog({ open, onClose, subject }: { open: boolean; onClose: () => void; subject: Subject }) {
  const { update, notify } = useStore();
  const [num, setNum] = useState(""); const [title, setTitle] = useState(""); const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setNum(String(nextNumber(subject))); setTitle(""); setTried(false); } }, [open, subject]);
  const n = Number(num);
  const used = activePrograms(subject).some(p => p.number === n);
  const err = !/^\d+$/.test(num) || n < 1 || n > 9999 ? "Program number must be a whole number from 1 to 9999." : used ? `Program ${n} already exists in this subject.` : "";
  const submit = () => {
    setTried(true); if (err) return;
    if (activePrograms(subject).length >= 500) { notify("A subject can hold at most 500 programs.", "error"); return; }
    const id = newId(); const t = nowIso();
    update(w => mapSubject(w, subject.id, s => ({ ...s, updatedAt: t, programs: [...s.programs, { id, number: n, title: title.trim().slice(0, 500), question: "", createdAt: t, updatedAt: t, trashedAt: null, sources: [], outputs: [], outputMayBeStale: false }] })));
    onClose(); go(`/program/${subject.id}/${id}`);
  };
  return (
    <Modal open={open} onClose={onClose} title="New program"
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={submit} data-testid="button-create-program">Create and open</button></>}>
      <form onSubmit={e => { e.preventDefault(); submit(); }} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12 }}>
        <label><span className="field-label">Number <span className="required-star">*</span></span>
          <input type="number" min={1} max={9999} autoFocus value={num} onChange={e => setNum(e.target.value)} aria-invalid={tried && !!err} data-testid="input-program-number" /></label>
        <label><span className="field-label">Title</span>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Can be filled in later" data-testid="input-program-title" /></label>
        {tried && err && <div className="err" style={{ gridColumn: "1/3" }}>{err}</div>}
        <p className="hint" style={{ gridColumn: "1/3", margin: 0 }}>Question, source files and output are added in the editor. Incomplete programs are saved as you go.</p>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function ConfirmDialog({ open, onClose, title, body, confirmLabel, onConfirm }: { open: boolean; onClose: () => void; title: string; body: string; confirmLabel: string; onConfirm: () => void }) {
  return <Modal open={open} onClose={onClose} title={title}
    footer={<><button className="btn" onClick={onClose} autoFocus>Cancel</button><button className="btn danger" onClick={() => { onConfirm(); onClose(); }} data-testid="button-confirm">{confirmLabel}</button></>}>
    <p style={{ margin: 0, fontSize: 13 }}>{body}</p>
  </Modal>;
}
