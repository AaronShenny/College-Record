export type DocumentFile = { id: string; name: string; format: "docx" | "pdf"; subjectId: string; programIds: string[]; createdAt: string; byteLength: number; dataBase64?: string };
export type GenerationResult = { documents: DocumentFile[]; failures: { number?: number; message: string }[]; snapshotAt: string };
export type CloudStatus = { connected: boolean; configured: boolean; state: string; message?: string; busy?: boolean; pending?: boolean; account?: {name: string; email: string}; lastSyncAt?: string; syncedRevision?: string };
export const cloudStatus = async (): Promise<CloudStatus> => ({ connected: false, configured: false, state: "offline" });
const docs: DocumentFile[] = [
  { id: "d1", name: "semester-03_data-structures-lab_program-04.docx", format: "docx", subjectId: "sample-subject", programIds: ["sample-program"], createdAt: "2026-11-07T09:12:00Z", byteLength: 48230 },
  { id: "d2", name: "semester-03_data-structures-lab_programs-01-03.docx", format: "docx", subjectId: "sample-subject", programIds: ["sample-1","sample-2","sample-3"], createdAt: "2026-11-06T16:40:00Z", byteLength: 131872 },
];
export const generateDocuments = async (..._args: unknown[]): Promise<GenerationResult> => ({ documents: [docs[0]!], failures: [{ number: 5, message: "Required field 'Question' is empty." }], snapshotAt: new Date().toISOString() });
export const listDocuments = async (): Promise<DocumentFile[]> => docs;
export const openDocument = async (_d: DocumentFile, _a: "open" | "download" = "download") => {};
