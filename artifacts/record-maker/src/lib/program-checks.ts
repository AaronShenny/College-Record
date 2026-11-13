import type { Program, Subject } from "./contracts";

export type ProgramCheck = { label: string; ok: boolean; field: string };
export function programState(p: Program, s?: Subject): { tone: "good" | "warn" | "alert"; label: string; missing: string[] } {
  const checks = programChecks(p, s);
  const missing = checks.filter(c => !c.ok).map(c => c.label.toLowerCase());
  if (missing.length === 0) return p.outputMayBeStale ? { tone: "warn", label: "Output may be outdated", missing } : { tone: "good", label: "Ready", missing };
  if (missing.length === checks.length) return { tone: "alert", label: "Just started", missing };
  return { tone: "warn", label: "Incomplete", missing };
}
export function requiredMappings(subject?: Subject): string[] {
  return activeMappings(subject)
    .filter(mapping => mapping.required && mapping.field !== "skip")
    .map(mapping => mapping.field);
}
export function activeMappings(subject?: Subject) {
  const template = subject?.template;
  return template ? template.placeholders.flatMap(p => template.mappings[p] ? [template.mappings[p]!] : []) : [];
}
const filled = (value?: string) => !!value?.trim();

/** Match the Python renderer's content rules; this is guidance, not a replacement
 * for the authoritative template validation performed when generating. */
export function programChecks(program: Program, subject?: Subject): ProgramCheck[] {
  const checks: ProgramCheck[] = [];
  const seen = new Set<string>();
  const add = (field: string, label: string, ok: boolean) => {
    if (!seen.has(field)) { seen.add(field); checks.push({ field, label, ok }); }
  };
  const hasOutput = program.outputs.some(output => output.include &&
    (output.kind === "image" ? filled(output.dataUrl) : filled(output.text)));
  for (const field of requiredMappings(subject)) {
    if (field === "number") add(field, "Program number", program.number >= 1 && program.number <= 9999);
    else if (field === "title") add(field, "Title entered", filled(program.title));
    else if (field === "question") add(field, "Question entered", filled(program.question));
    else if (field === "output") add(field, "Included output", hasOutput);
    else if (field === "subject.name") add(field, "Subject name", filled(subject?.name));
    else if (field === "semester") add(field, "Semester", !!subject?.semester);
    else if (field === "courseCode") add(field, "Course code", filled(subject?.courseCode));
    else if (field.startsWith("source:")) {
      const role = field.slice(7);
      add(field, `Source: ${role}`, program.sources.some(source => source.include && source.role === role && filled(source.code)));
    } else if (field.startsWith("custom:")) {
      const definition = subject?.fields?.find(item => item.id === field.slice(7));
      add(field, definition?.label ?? "Missing custom field", !!definition &&
        filled((definition.scope === "subject" ? subject?.values : program.values)?.[definition.id]));
    } else add(field, `Unknown field: ${field}`, false);
  }
  for (const definition of subject?.fields ?? []) {
    if (definition.required && activeMappings(subject).some(m => m.field === `custom:${definition.id}`)) add(`custom:${definition.id}`, definition.label,
      filled((definition.scope === "subject" ? subject?.values : program.values)?.[definition.id]));
  }
  // Duplicate included roles are rejected even for optional source mappings.
  for (const mapping of activeMappings(subject)) {
    if (!mapping.field.startsWith("source:")) continue;
    const role = mapping.field.slice(7);
    if (program.sources.filter(source => source.include && source.role === role).length > 1) {
      checks.push({ field: mapping.field, label: `Use one included source for ${role}`, ok: false });
    }
  }
  if (subject?.template) return checks;
  return [
    { field: "title", label: "Title or question entered", ok: filled(program.title) || filled(program.question) },
    { field: "source:", label: "Included source with code", ok: program.sources.some(source => source.include && filled(source.code)) },
    { field: "output", label: "Included output", ok: hasOutput },
    ...checks,
  ];
}
