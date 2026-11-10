import type { FieldMapping } from "@/lib/contracts";

const FONTS = ["Aptos", "Arial", "Calibri", "Cambria", "Consolas", "Courier New", "Georgia", "Times New Roman", "Verdana"];

export function FieldFontControls({ placeholder, mapping, onChange }: {
  placeholder: string; mapping: FieldMapping; onChange: (value: FieldMapping) => void;
}) {
  return <div className="field-font-controls">
    <label>Font
      <input type="text" list="record-field-fonts" maxLength={120} placeholder="Template font"
        value={mapping.fontFamily ?? ""} aria-label={`Font for ${placeholder}`}
        data-testid={`input-font-${placeholder}`}
        onChange={e => {
          const next = { ...mapping };
          const value = e.target.value.replace(/[\x00-\x1f\x7f]/g, "");
          if (value.trim()) next.fontFamily = value;
          else delete next.fontFamily;
          onChange(next);
        }}
        onBlur={e => {
          if (e.target.value !== e.target.value.trim()) onChange({ ...mapping, fontFamily: e.target.value.trim() || undefined });
        }} />
    </label>
    <label>Size (pt)
      <input type="number" min={1} max={400} step={0.5} placeholder="Template size"
        value={mapping.fontSizePt ?? ""} aria-label={`Font size for ${placeholder}`}
        data-testid={`input-font-size-${placeholder}`}
        onChange={e => {
          const next = { ...mapping };
          if (e.target.value === "") delete next.fontSizePt;
          else {
            const value = Number(e.target.value);
            if (!Number.isFinite(value) || value < 1 || value > 400 || value * 2 % 1) return;
            next.fontSizePt = value;
          }
          onChange(next);
        }} />
    </label>
    {(mapping.fontFamily || mapping.fontSizePt) && <button type="button" className="btn small ghost"
      data-testid={`button-reset-font-${placeholder}`} onClick={() => {
        const { fontFamily: _font, fontSizePt: _size, ...next } = mapping;
        onChange(next);
      }}>Use template</button>}
  </div>;
}

export function FieldFontOptions() {
  return <datalist id="record-field-fonts">{FONTS.map(font => <option key={font} value={font} />)}</datalist>;
}
