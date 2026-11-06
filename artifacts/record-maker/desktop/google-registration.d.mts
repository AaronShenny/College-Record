export type DesktopClient = { client_id: string; client_secret: string };
export function desktopRegistration(value: unknown): DesktopClient;
export function parseDesktopRegistration(text: string): { installed: DesktopClient };
