import { useRef, useState } from "react";
import { ImagePlus, Lock, X } from "lucide-react";
import type { FieldDefinition } from "@/lib/contracts";
import { errMsg } from "@/hooks/use-workspace";

const IMG = /^data:image\/(?:png|jpeg|webp);base64,/;
function readImage(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return Promise.reject(new Error("Use a PNG, JPEG or WebP image."));
  if (file.size > 8 * 1024 * 1024) return Promise.reject(new Error("Choose an image smaller than 8 MB."));
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("Image could not be read")); r.readAsDataURL(file); });
}

/** Editable value for one custom field. */
export function FieldValue({ def, value, onChange, readOnly, origin }: { def: FieldDefinition; value?: string; onChange?: (v: string | undefined) => void; readOnly?: boolean; origin?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const empty = !value || !value.trim();
  return (
    <div className={`fv ${readOnly ? "fv-ro" : ""}`} data-testid={`field-value-${def.id}`}>
      <div className="fv-head">
        <span className="field-label" style={{ margin: 0 }}>{def.label}{def.required && <span className="required-star"> *</span>}</span>
        <span className="fv-meta">{readOnly && <Lock size={10} />}{origin ?? (def.scope === "subject" ? "Whole record" : "This program")} · {def.type}</span>
      </div>
      {def.type === "text" ? (
        readOnly ? <div className="fv-readonly">{empty ? <span className="muted">Not set</span> : value}</div> :
          <textarea rows={2} value={value ?? ""} maxLength={100000} onChange={e => onChange?.(e.target.value || undefined)} placeholder={def.required ? "Required for generation" : "Optional"} data-testid={`input-field-${def.id}`} />
      ) : (
        <div className="fv-image">
          {value && IMG.test(value) ? <img src={value} alt={def.label} /> : <span className="fv-noimg">No image</span>}
          {!readOnly && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" className="btn small" onClick={() => input.current?.click()} data-testid={`button-image-${def.id}`}><ImagePlus size={12} /> {value ? "Replace" : "Choose image"}</button>
            {value && <button type="button" className="btn small ghost" onClick={() => onChange?.(undefined)} data-testid={`button-clear-${def.id}`}><X size={12} /> Clear</button>}
          </div>}
          <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={async e => {
            const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
            try { setErr(null); onChange?.(await readImage(f)); } catch (x) { setErr(errMsg(x)); }
          }} />
        </div>
      )}
      {err && <div className="err">{err}</div>}
    </div>
  );
}

export function setValue(values: Record<string, string> | undefined, key: string, v: string | undefined) {
  const n = { ...(values ?? {}) };
  if (v === undefined) delete n[key]; else n[key] = v;
  return Object.keys(n).length ? n : undefined;
}
