import { test } from "node:test";
import assert from "node:assert/strict";
import { desktopRegistration, parseDesktopRegistration } from "./google-registration.mjs";

const installed = { client_id: "test-client.apps.googleusercontent.com", client_secret: "test-only-placeholder" };
test("Desktop registration accepts only complete installed-client JSON and removes unused properties", () => {
  assert.deepEqual(parseDesktopRegistration(JSON.stringify({ installed: { ...installed, project_id: "unused" } })), { installed });
  assert.throws(() => desktopRegistration({ web: installed }), /Desktop app/);
  assert.throws(() => desktopRegistration({ type: "service_account" }), /Desktop app/);
  assert.throws(() => desktopRegistration({ installed: { client_id: installed.client_id } }), /Desktop app/);
  assert.throws(() => desktopRegistration({ installed: { ...installed, client_id: "wrong" } }), /Desktop app/);
});
test("malformed credential input is never echoed in parser errors", () => {
  const submitted = "PRIVATE_INPUT_MUST_NOT_APPEAR";
  assert.throws(() => parseDesktopRegistration(submitted), error =>
    error instanceof Error && !error.message.includes(submitted) && error.message.includes("Desktop app"));
});
