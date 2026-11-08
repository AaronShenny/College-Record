// Static identifiers only. Never collect textContent, labels, field values, URLs,
// clipboard data, filenames, subject/program IDs, or arbitrary data attributes.
const controls = new Set(`
button-add-field button-add-image button-add-program button-add-role button-add-text
button-browser-folder button-build-rows button-cancel-subject button-check-python button-check-updates
button-choose-import button-clear-search button-close-dialog button-configure-google button-confirm
button-confirm-import button-confirm-logout button-connect-drive button-copy-sources button-create-program
button-drive-folder button-export-diagnostics button-extract button-gen-change button-gen-close
button-generate button-generate-start button-import-source button-inspect-snapshot button-logout-delete
button-mark-current button-native-folder button-new-program button-new-source button-new-source-empty
button-new-subject button-open-generate button-paste-image button-reconnect-drive button-refresh-docs
button-remove-template button-rename-subject button-restart-update button-retry-initial-sync button-retry-load
button-retry-save button-save-field button-save-now button-save-reviewed button-save-subject
button-signin-configure button-signin-google button-signin-retry button-subject-settings button-sync-drive
button-toggle-details button-trash-subject button-upload-first button-upload-template
check-all-programs check-all-subject-programs check-logout-ack check-pdf check-reviewed-assign
details-settings form-generate input-drive-folder input-field-label input-import-file input-new-role
input-number input-page-range input-program-number input-program-title input-question input-search-subjects
input-subject-code input-subject-name input-subject-semester input-template-file input-title
link-all-subjects link-back-subject link-brand link-cloud-settings link-crumb-subject link-generation-status
link-gen-history link-import link-next-program link-prev-program link-resume link-saved-versions link-template
radio-combined radio-docs-all radio-docs-subject radio-individual select-doc-subject select-field-scope
select-snapshot-subject
`.trim().split(/\s+/));
const pages = new Set(["subjects", "subject", "program", "settings", "trash", "documents", "template", "import"]);
const tags = new Set(["button", "a", "input", "textarea", "select", "summary", "form"]);
const kinds = new Set(["click", "change", "edit", "paste", "submit", "navigate", "error", "unhandled-rejection",
  "heartbeat", "event-loop-delay", "long-task", "focus", "blur", "visibility", "save-shortcut", "escape"]);
export const diagnosticPage = (hash: string) => {
  const first = hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  return !first ? "dashboard" : pages.has(first) ? first : "other";
};
export const diagnosticControl = (testId: string | null, tag: string) => controls.has(testId || "") ? testId! : tags.has(tag) ? tag : "other";
export function parseRendererEvent(input: unknown): Record<string, string | number | boolean> | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  if (typeof value.kind !== "string" || !kinds.has(value.kind)) return null;
  if (typeof value.page !== "string" || !["dashboard", "other", ...pages].includes(value.page)) return null;
  const result: Record<string, string | number | boolean> = { kind: value.kind, page: value.page };
  if (typeof value.control === "string") result.control = diagnosticControl(value.control, value.control);
  if (typeof value.durationMs === "number" && Number.isFinite(value.durationMs)) result.durationMs = Math.max(0, Math.min(3_600_000, Math.round(value.durationMs)));
  if (typeof value.visible === "boolean") result.visible = value.visible;
  return result;
}
