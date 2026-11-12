const FORMAT_ERROR = "Use the complete downloaded Google OAuth Desktop app client JSON. Web clients, service accounts and student login tokens are not supported.";

/** Validates locally, never echoes submitted credentials in an error. */
export function desktopRegistration(value) {
  const client = value?.installed;
  if (!client || typeof client.client_id !== "string" ||
      !/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(client.client_id) ||
      typeof client.client_secret !== "string" || !client.client_secret.trim() ||
      client.client_secret.length > 1000) {
    throw new Error(FORMAT_ERROR);
  }
  return { client_id: client.client_id, client_secret: client.client_secret };
}

export function parseDesktopRegistration(text) {
  if (typeof text !== "string" || text.length > 32_000) throw new Error(FORMAT_ERROR);
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error(FORMAT_ERROR); }
  return { installed: desktopRegistration(parsed) };
}
