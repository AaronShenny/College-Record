import { readFile } from "node:fs/promises";
import { parseDesktopRegistration } from "../services/google-registration.mjs";

try {
  const text = process.env.GOOGLE_DESKTOP_CLIENT_JSON_PATH
    ? await readFile(process.env.GOOGLE_DESKTOP_CLIENT_JSON_PATH, "utf8")
    : process.env.GOOGLE_DESKTOP_CLIENT_JSON;
  if (!text) throw new Error("No Google Desktop OAuth registration was supplied.");
  parseDesktopRegistration(text);
  console.log("Google Desktop OAuth registration: valid format. No credentials were printed. Live Google sign-in has not been tested.");
} catch {
  console.error("Google Desktop OAuth configuration is missing or invalid. Supply the complete downloaded Desktop app client JSON through Secrets. Credentials were not printed.");
  process.exitCode = 1;
}
