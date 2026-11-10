// Keep the window entry independent of the large schema library. Full record
// validation still happens in the isolated service before any durable write.
export function uuid(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw new Error("Invalid record identifier.");
  return value;
}
export function workflowInput(action: unknown, input: unknown): [string, Record<string, unknown>] {
  if (typeof action !== "string" || action.length > 80 || !input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid workflow request.");
  return [action, input as Record<string, unknown>];
}
