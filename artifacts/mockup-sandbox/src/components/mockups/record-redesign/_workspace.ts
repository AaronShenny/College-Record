const stamped = "2025-02-18T15:42:00.000Z";

type ProgramFixture = {
  id: string;
  number: number;
  title: string;
  question: string;
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
  outputMayBeStale: boolean;
  sources: { id: string; name: string; role: string; code: string; include: boolean }[];
  outputs: (
    | { id: string; kind: "image"; name: string; dataUrl: string; include: boolean }
    | { id: string; kind: "text"; name: string; text: string; include: boolean }
  )[];
};
type SubjectFixture = {
  id: string;
  name: string;
  semester: number;
  courseCode: string;
  updatedAt: string;
  trashedAt: string | null;
  template: { id: string; name: string; dataBase64: string; placeholders: string[]; mappings: Record<string, unknown>; reviewed: boolean; uploadedAt: string };
  programs: ProgramFixture[];
};

const subject = {
  id: "subject-data-structures-lab",
  name: "Data Structures Lab",
  semester: 3,
  courseCode: "CSL 301",
  updatedAt: stamped,
  trashedAt: null,
  template: { id: "template-csl-301", name: "CSL 301 Lab Record.docx", dataBase64: "", placeholders: [], mappings: {}, reviewed: true, uploadedAt: stamped },
  programs: [
    {
      id: "program-01", number: 1, title: "Array operations", question: "Write a program to perform insertion and deletion in an array.",
      createdAt: stamped, updatedAt: stamped, trashedAt: null, outputMayBeStale: false,
      sources: [{ id: "source-01", name: "array_ops.c", role: "Main program", code: "#include <stdio.h>\\n\\nint main(void) {\\n    return 0;\\n}", include: true }],
      outputs: [{ id: "output-01", kind: "text", name: "Run output", text: "Array after insertion: 10 20 30 40", include: true }],
    },
    {
      id: "program-02", number: 2, title: "Stack using an array", question: "Implement the push and pop operations for a stack.",
      createdAt: stamped, updatedAt: "2025-02-17T11:18:00.000Z", trashedAt: null, outputMayBeStale: false,
      sources: [{ id: "source-02", name: "stack.c", role: "Main program", code: "#include <stdio.h>\\n\\nint main(void) {\\n    return 0;\\n}", include: true }],
      outputs: [], 
    },
    {
      id: "program-03", number: 3, title: "Circular queue", question: "",
      createdAt: stamped, updatedAt: "2025-02-16T09:05:00.000Z", trashedAt: null, outputMayBeStale: false,
      sources: [], outputs: [],
    },
    {
      id: "program-04", number: 4, title: "Linked list traversal", question: "Create a singly linked list and display its elements.",
      createdAt: stamped, updatedAt: "2025-02-15T14:30:00.000Z", trashedAt: null, outputMayBeStale: true,
      sources: [{ id: "source-04", name: "linked_list.c", role: "Main program", code: "#include <stdio.h>\\n\\nint main(void) {\\n    return 0;\\n}", include: true }],
      outputs: [{ id: "output-04", kind: "text", name: "Run output", text: "List: 10 -> 20 -> 30", include: true }],
    },
  ],
} as SubjectFixture;

const workspace = { schemaVersion: 1, subjects: [subject] };

export function useStore() {
  const save: { kind: "saved" | "idle" | "dirty" | "saving" | "error" | "invalid"; savedAt?: string; message?: string } = { kind: "saved", savedAt: stamped };
  const cloud: any = { connected: false, configured: false };
  return {
    workspace,
    update: (_fn: (w: any) => any) => undefined,
    notify: (_text: string, _tone?: string) => undefined,
    runtime: { mode: "browser-preview" as const },
    save,
    saveNow: () => undefined,
    toasts: [] as { id: number; text: string; tone: string }[],
    dismiss: (_id: number) => undefined,
    cloud,
    cloudError: null,
    drafts: new Set<string>(),
  };
}

export function cloudLabel(cloud: any) {
  if (!cloud) return { tone: "neutral", text: "Checking Drive…" };
  if (!cloud.connected) return { tone: "neutral", text: cloud.configured ? "Drive not signed in" : "Drive not connected" };
  return { tone: "good", text: "Saved to Drive" };
}

export const nowIso = () => new Date().toISOString();
export const activePrograms = (s: SubjectFixture) => s.programs.filter(p => !p.trashedAt).sort((a, b) => a.number - b.number);
export const pad = (n: number) => String(n).padStart(2, "0");
export const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
const filled = (v?: string) => !!v && v.trim().length > 0;
export function programState(p: ProgramFixture, _s?: SubjectFixture) {
  const checks = [
    filled(p.title) || filled(p.question),
    p.sources.some((x: any) => x.include && x.code.trim().length > 0),
    p.outputs.some((o: any) => o.include),
  ];
  const missing = checks.flatMap((ok, i) => ok ? [] : [["title or question entered", "included source with code", "included output"][i]]);
  if (!missing.length) return p.outputMayBeStale ? { tone: "warn", label: "Output may be outdated", missing } : { tone: "good", label: "Ready", missing };
  if (missing.length === checks.length) return { tone: "alert", label: "Just started", missing };
  return { tone: "warn", label: "Incomplete", missing };
}
export function mapSubject(w: any, id: string, fn: (s: SubjectFixture) => SubjectFixture) {
  return { ...w, subjects: w.subjects.map((s: any) => s.id === id ? fn(s) : s) };
}
