# Daily workflow redesign (task 7)

Mockups (canvas): `daily-current` (extracted baseline), `daily-workspace` (Focused.tsx, editor), `daily-generate` (Generate.tsx, subject list + generation panel). Mockup copies live in `artifacts/mockup-sandbox/src/components/mockups/daily-record/_next/` and are built from the same files later rolled into the app.

## Interaction counts (activations = clicks/keys that change state; scrolling noted separately)

| Task | Before | After |
| --- | --- | --- |
| Open a program from the subject page | 1 (title link or Open) | 1 (title link in program list) |
| Focus code of the open program | 1, after scrolling past Program details and Template fields (about 1 to 2 screens at 1366x768) | 1, no scroll: code pane is visible at load at 1366x768 and 1440x900 |
| Paste a screenshot | 1 (PASTE), after scrolling past details, fields and every source file | 1 (Paste screenshot), no scroll: output pane header is visible at load |
| Switch to next program | 1 (Next or list row) | 1 (Next or list row) |
| Editor to started generation | 3 to 4: Documents nav, subject select if not first, program checkbox, Generate. Selection was reset on every visit | 2: Generate... (seeds the current program only if the subject has no explicit choice), Generate N Word files |
| Subject program list to started generation | 3: Generate records card, program checkbox, Generate (subject reselected via URL) | 3 when nothing is selected (checkbox, Generate..., Generate); 2 when a selection already exists (it persists across navigation) |
| Find Template & mapping / Import / Subject settings | Visible cards; rename and Trash in page header | Named links in subject header: "Template & mapping", "Import", "Subject settings" (Rename, Move to Trash = 2 activations, was 1) |

Honest notes: the scroll reduction is the main editor gain; click counts for opening/switching are unchanged. Rename/Trash moved behind "Subject settings" (+1 activation) to keep daily work uncluttered. Generation option changes (mode, PDF) are additional deliberate activations in both versions.

## What moved where
- Home (`#/` and legacy `#/subjects`): one searchable list grouped by semester plus a single "Continue" link. Removed the welcome banner, Next-to-finish, Drive card and last-worked panels; removed duplicate Dashboard/Subjects nav.
- Shell: nav = Subjects, Documents, Settings, Trash. One save area (local save state, Drive state linking to Settings, Save Now). Generation running/failed/ready chip links to Documents for that subject. Save errors and Drive sync/status errors are banners with Retry / Open Settings, never tooltips. Browser preview notice is one line with a Settings link.
- Editor: number + title in the header, Previous/Next, Generate... Question, program custom fields and inherited subject values are in a collapsed "Question & record fields" disclosure whose summary peeks at the question. Required-content chips use `programChecks().field`: program fields focus the real input (expanding the disclosure); subject-level fields (subject name, semester, course code, subject-scope custom fields) link to the subject page (Subject settings) or Template & mapping. Code and Output are side-by-side panes; multiple source files are tabs, each still renamable, role-assignable, includable, replaceable and removable. Outputs keep include, rename, reorder and remove; Paste screenshot, Add image and Add text are always visible.
- Generation: `components/generate-panel.tsx` (`GenerationForm`, `GeneratePanel` modal, `DocRow`) used by editor, subject page and Documents. Calls the existing `startGeneration`; reads/writes provider-owned `generationChoices` via `setGenerationChoice`. No automatic generation; explicit selections, including an empty one, are never overwritten (the editor seeds `[program.id]` only when the subject has no choice). Results show saved files with Open/Download and per-program failures; full history is in Documents (filter This subject / All).

## Safeguards and boundaries
- Invalid local filename drafts remain mounted across source-tab switches. A marked tab identifies the draft; navigation and generation are blocked until it is fixed. Invalid program-number drafts also block navigation rather than disappearing.
- Required-content checks include subject and program custom values, empty text outputs and duplicate mapped source roles. These guide the student to an actual input; Python remains the authoritative generation validator.
- Explicit program selections and generation options live in the workspace provider for the current app session, not in an individual page. They survive navigation; a full app reload starts a fresh generation selection. Saved record content and generated documents retain their existing durable storage.
- Source tabs support Left/Right/Home/End as well as Tab and Enter. Code retains Tab indentation and Escape to leave the editor. Dialogs use native keyboard focus containment.
- Errors remain visible until dismissed, with save retry, Settings or document-result recovery. Drive status remains pending when local changes are unsaved or the local revision is not acknowledged.
- The Electron, Python, storage format, native bridge, Google authorization, Drive synchronization and safe-cleanup implementations were not replaced. No installer was published.

## Verification
- Renderer and Electron TypeScript checks passed.
- Desktop tests: 21 passed, including five focused readiness/selection regressions and existing account, local persistence, synchronization and immutable-snapshot checks. Two additional clipboard-timeout tests also passed.
- Python generation/import tests: 9 passed.
- Browser production bundle built successfully with the service's required PORT/BASE_PATH supplied.
- Mockup type check and laptop-size visual checks passed. Browser-preview checks do not establish that Windows clipboard access, Microsoft Word automation or live Google/Drive authorization works.
- A real browser journey confirmed edited title/code/output persistence through Next/back/reload, explicit nonempty and empty generation selections, required Faculty input focus, actual generated DOCX downloads and immutable snapshot content while editing continued. It exposed clipboard waiting and document-row overflow; clipboard operations now have an actionable timeout and document grid/flex children can shrink around long filenames.
- Existing Python tests cover combined ordering/sections, unique saved versions and retaining the Word file when optional PDF conversion is unavailable. The browser pass did not independently exercise every generation option or all Windows-only controls.
- A targeted browser follow-up confirmed Documents fits 1366px without horizontal overflow, Download controls remain visible, the question textbox receives focus, and clipboard failures recover with an Add image alternative. Its filename probe exposed an older acceptance of Windows-invalid `?` names, not a discarded draft: the name had been committed and persisted. UI filename validation now rejects Windows-invalid characters/reserved names, with an additional passing regression test. The workspace schema remains compatible with saved records; no historic values are silently renamed.
