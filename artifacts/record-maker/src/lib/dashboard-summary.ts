import { z } from "zod";
import type { Workspace } from "./contracts";
import { programState } from "./program-checks";

export const MAX_SUMMARY_BYTES = 2 * 1024 * 1024;
export const DASHBOARD_SUMMARY_FILE = "_local/dashboard-summary.json";
const uuid = z.string().uuid();
export const dashboardSummarySchema = z.object({
  kind: z.literal("dashboard-summary"), schemaVersion: z.literal(1),
  revisionId: uuid, accountKey: z.string().regex(/^[a-f0-9]{32}$/).nullable(),
  subjects: z.array(z.object({
    id: uuid, name: z.string().min(1).max(150), semester: z.number().int().min(1).max(20),
    courseCode: z.string().max(50),
    programs: z.array(z.object({
      id: uuid, number: z.number().int().min(1).max(9999),
      title: z.string().max(500), updatedAt: z.string().datetime(),
      state: z.enum(["ready", "stale", "incomplete", "started"]),
    }).strict()).max(500),
  }).strict()).max(100),
}).strict().superRefine((summary, ctx) => {
  const ids = new Set<string>();
  for (const subject of summary.subjects) {
    const numbers = new Set<number>();
    for (const item of [subject, ...subject.programs]) {
      if (ids.has(item.id)) ctx.addIssue({ code: "custom", message: "Summary identifiers must be unique." });
      ids.add(item.id);
    }
    for (const program of subject.programs) {
      if (numbers.has(program.number)) ctx.addIssue({ code: "custom", message: "Summary program numbers must be unique." });
      numbers.add(program.number);
    }
  }
});
// Not assignable to Workspace. The native save path only accepts Workspace.
export type DashboardSummary = Readonly<z.infer<typeof dashboardSummarySchema>>;

export function deriveDashboardSummary(workspace: Workspace, revisionId: string, accountKey: string | null): DashboardSummary {
  return dashboardSummarySchema.parse({
    kind: "dashboard-summary", schemaVersion: 1, revisionId, accountKey,
    subjects: workspace.subjects.filter(subject => !subject.trashedAt).map(subject => ({
      id: subject.id, name: subject.name, semester: subject.semester, courseCode: subject.courseCode,
      programs: subject.programs.filter(program => !program.trashedAt).map(program => {
        const state = programState(program, subject);
        return {
          id: program.id, number: program.number, title: program.title, updatedAt: program.updatedAt,
          state: state.tone === "good" ? "ready" : state.label === "Output may be outdated" ? "stale" : state.tone === "alert" ? "started" : "incomplete",
        };
      }).sort((a, b) => a.number - b.number),
    })),
  });
}
