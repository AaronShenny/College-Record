import { z } from "zod";
import { fieldSchema, indexSchema, mappingSchema, templateSchema, workspaceSchema, type Subject, type TemplateConfig } from "./contracts";

export const configurationSchema = z.object({
  format: z.literal("recordly-subject-configuration"), version: z.literal(1),
  name: z.string().trim().min(1).max(150), courseCode: z.string().max(50),
  fields: z.array(fieldSchema).max(100),
  mappings: z.record(mappingSchema).refine(m => Object.keys(m).length <= 300, "Too many mappings."),
  sourceRoles: z.array(z.string().trim().min(1).max(80)).max(50),
  index: indexSchema.optional(),
  template: templateSchema.nullable(),
}).strict();
export type SubjectConfiguration = z.infer<typeof configurationSchema>;
export const MAX_CONFIGURATION_BYTES = 24 * 1024 * 1024;
const allowed = new Set(["number", "title", "question", "output", "subject.name", "semester", "courseCode", "skip"]);
export function parseConfiguration(text: string): SubjectConfiguration {
  if (new TextEncoder().encode(text).length > MAX_CONFIGURATION_BYTES) throw new Error("Configuration exceeds 24 MB.");
  const config = configurationSchema.parse(JSON.parse(text));
  const fields = new Map(config.fields.map(f => [f.id, f]));
  if (fields.size !== config.fields.length) throw new Error("Configuration contains duplicate field IDs.");
  const check = (field: string, index = false) => {
    if (index && ["blank", "manual"].includes(field)) return;
    if (allowed.has(field) && (!index || !["skip", "output"].includes(field))) return;
    if (field.startsWith("custom:") && fields.has(field.slice(7)) && (!index || fields.get(field.slice(7))!.type === "text")) return;
    if (!index && field.startsWith("source:") && field.slice(7).trim().length > 0 && field.slice(7).length <= 80) return;
    throw new Error(`Configuration references an unsupported or missing field: ${field}`);
  };
  Object.values(config.mappings).forEach(m => check(m.field));
  config.index?.columns.forEach(c => check(c.field, true));
  if (config.template) {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(config.template.dataBase64) || !config.template.name.toLowerCase().endsWith(".docx")) throw new Error("The included template must be a DOCX.");
    // Included mappings have only one source of truth.
    config.template.mappings = config.mappings;
    config.template.reviewed = false;
  }
  return config;
}
export function exportConfiguration(subject: Subject, includeTemplate: boolean): SubjectConfiguration {
  const mappings = { ...subject.setupMappings, ...subject.template?.mappings };
  return parseConfiguration(JSON.stringify({
    format: "recordly-subject-configuration", version: 1, name: subject.name, courseCode: subject.courseCode,
    fields: subject.fields ?? [], mappings, sourceRoles: [...new Set([...(subject.sourceRoles ?? []),
      ...Object.values(mappings).filter(m => m.field.startsWith("source:")).map(m => m.field.slice(7))])],
    ...(subject.index ? { index: subject.index } : {}),
    template: includeTemplate && subject.template ? subject.template : null,
  }));
}
export function mappingsForTemplate(template: TemplateConfig, mappings: SubjectConfiguration["mappings"]) {
  return Object.fromEntries(template.placeholders.filter(p => mappings[p]).map(p => [p, mappings[p]!]));
}
/** Add definitions under new IDs: never orphan existing students' saved values. */
export function applyConfiguration(subject: Subject, config: SubjectConfiguration, templateChoice: "keep" | "included" | "later"): Subject {
  const ids = new Map(config.fields.map(f => [f.id, crypto.randomUUID()]));
  const rewrite = (field: string) => field.startsWith("custom:") ? `custom:${ids.get(field.slice(7)) ?? field.slice(7)}` : field;
  const mappings = Object.fromEntries(Object.entries(config.mappings).map(([p, m]) => [p, { ...m, field: rewrite(m.field) }]));
  let template = templateChoice === "keep" ? subject.template : templateChoice === "included" ? config.template : null;
  if (templateChoice === "included" && !template) throw new Error("This configuration has no included template.");
  if (templateChoice === "later" && subject.template) throw new Error("Keep or explicitly replace the existing template; it cannot be silently removed.");
  if (template) template = { ...template, ...(templateChoice === "included" ? { id: crypto.randomUUID(), uploadedAt: new Date().toISOString() } : {}),
    mappings: mappingsForTemplate(template, mappings), reviewed: false };
  const next: Subject = { ...subject, template, setupMappings: mappings,
    fields: [...subject.fields ?? [], ...config.fields.map(f => ({ ...f, id: ids.get(f.id)! }))],
    sourceRoles: [...new Set([...(subject.sourceRoles ?? []), ...config.sourceRoles])],
    ...(config.index ? { index: { ...config.index, columns: config.index.columns.map(c => ({ ...c, id: crypto.randomUUID(), field: rewrite(c.field) })) } } : {}),
    updatedAt: new Date().toISOString() };
  workspaceSchema.parse({ schemaVersion: 1, subjects: [next] });
  return next;
}
