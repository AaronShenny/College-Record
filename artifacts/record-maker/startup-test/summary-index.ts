import type { Workspace } from "../src/lib/contracts";

// Test-only derived index. Never replaces, edits or deletes source records.
export function dashboardIndex(workspace: Workspace, revisionId: string) {
  return {
    schemaVersion: 2, revisionId,
    subjects: workspace.subjects.filter(s => !s.trashedAt).map(s => ({
      id: s.id, name: s.name, semester: s.semester, courseCode: s.courseCode,
      programs: s.programs.filter(p => !p.trashedAt).map(p => ({
        id: p.id, number: p.number, title: p.title, updatedAt: p.updatedAt,
      })),
    })),
  };
}
export type DashboardIndex = ReturnType<typeof dashboardIndex>;
