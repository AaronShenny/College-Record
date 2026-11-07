export type CloudStatus = { connected: boolean; configured: boolean; state: string; busy?: boolean; pending?: boolean; account?: {name: string; email: string}; lastSyncAt?: string };
export type GenerationResult = { documents: unknown[]; failures: unknown[] };
export const cloudStatus = async (): Promise<CloudStatus> => ({ connected: false, configured: false, state: "offline" });
export const generateDocuments = async (..._args: unknown[]): Promise<GenerationResult> => ({ documents: [], failures: [] });
