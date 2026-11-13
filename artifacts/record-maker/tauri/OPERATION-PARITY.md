# Recordly 0.3.0 additions

The current product name is Recordly, publisher extapano. Display/installer/icon changes preserve the stable application identifier, DPAPI/account hashing, cached-workspace paths, legacy migration candidates and Drive appProperties discovery keys. Existing Drive roots are not renamed or recreated.

- Save Now now commits locally and synchronizes Drive. The shared background coordinator coalesces requests and runs every three minutes after the initial real screen paints.
- Normal native close asks the renderer to finish valid edits and jobs, then fences new operations in the Rust host. A native-only final check independently requires a clean Drive acknowledgment before service shutdown and exit. Failures retain the window and local data with Retry/return-to-editing. Forced termination/power loss remains outside this guarantee.
- Before any service/workspace opens, failed bootstrap cannot trap the window behind a missing renderer listener: native closing fences/drains bootstrap requests and may exit without starting Node or touching cached records. A service that started during that drain disables the shortcut and requires the normal save/Drive-close handshake. Bootstrap-error diagnostics do not start a service later.
- Explicit conflict review is one-use, account/root-bound and expires in five minutes. Both replacement choices are whole-workspace operations, not field merges. Local/extra/remote revision changes invalidate the review; uploads publish immutable references first and conditionally update the root index. Force-Local fails closed if Drive omits conditional-update metadata. Force-Drive stages and validates exact remote inventories before journaled activation.
- Template/index-used editor fields are dynamic; hidden values remain. Index columns are student-defined mapped text, blank or manually entered values; no page-number option is offered. The optional table appears once at the front of a combined record, in selected program-number order, with its own header/footer-free initial section.
- Versioned JSON subject configurations exclude student work/values, credentials and Drive references. Export chooses template inclusion; import re-inspects included DOCX, remaps identities, requires replacement review and supports template-later setup. Templates may contain personal text already present in the file; export warns students.
- New optional schema fields round-trip through existing snapshots and Drive file graphs. Older binaries may reject unfamiliar fields; retain the archived baseline but do not use it to edit upgraded workspaces.

Automated and browser evidence is recorded in the task completion report. Windows installer upgrade behavior, native close/real network error recovery, actual two-laptop Drive handoff and Office pagination/PDF require installed Windows acceptance; do not label these passed from browser mocks or portable tests.

# Native operation inventory

All existing React pages use the same `DesktopBridge`. Tauri maps fixed commands
to the existing `NativeSession`/`HostWorkflows`, not a second domain implementation.

| Existing operation | Tauri path | Evidence / remaining Windows check |
|---|---|---|
| Runtime and full workspace load | Private service `runtime` / `load` | Real subprocess/revision tests; owner confirmed existing Drive records load in installed app |
| Autosave / Save Now | Private service `save` | Full-schema/account/revision guards; owner confirmed editing, saving and reopening; autosave-specific edge cases remain separate |
| Cached record desk | Rust `boot`, read-only summary, real painted-screen signal | Rust metadata tests + bridge gate tests; hardware timings pending |
| Legacy cache onboarding | Native consent, staged copy, hash verification, atomic activation | Portable preservation test; real installed legacy path check pending |
| Source file import / replacement | Service `import-source`, native open dialog | Existing editor/source schema; installed picker check pending |
| Source folder import | `workflow/source-folder`, native folder dialog | Existing background import logic retained; installed check pending |
| Drive folder import | `workflow/drive-sources` | Existing authenticated Drive path retained; live account check pending |
| Clipboard PASTE | Native RGBA-to-PNG, service `paste-image` | Existing output contract + subprocess test; real Windows clipboard pending |
| Template inspection / mapping / fonts | `workflow/inspect-template`, existing pages and Python | Shared contracts/engine tests; installed Word layout check pending |
| PDF/CSV question import / review | `workflow/import-questions`, same supplied extractor | Shared Python engine retained; packaged extractor check in build |
| Generation / history | `workflow/generate`, `list-documents` | Existing immutable snapshot/version logic retained |
| DOCX and Word-only PDF | Same background Python engine | DOCX-before-PDF regression; owner confirmed generating and opening DOCX/PDF; failure/layout edge cases remain separate |
| Open generated document | `workflow/open-document` -> validated native ShellExecute | No COM activation for opening; owner confirmed generated DOCX/PDF open in installed app |
| Save/export generated document | Existing document bytes + native save dialog | Existing document registry preserved; installed picker check pending |
| Google configuration / sign-in | `configure-google`, `connect-drive`, native approved browser URL | College identity/shared OAuth tests; owner confirmed installed Google sign-in; account-switch/recovery edge cases remain separate |
| Secure credentials | Native-only DPAPI reverse callbacks | Passed Windows foundation round-trip; original Electron cipher requires recovery |
| Status / sync / offline queue | Existing `cloud-status` / `sync-drive` | Shared commit/order/failure tests; live download timing pending |
| Sync then logout/cleanup | Existing `logout-cleanup` | Existing no-discard boundary retained; installed shared-PC check pending |
| Trash / restore / custom fields | Existing full Workspace edits and save path | Existing schema/store tests; consolidated UI check pending |
| Python health / snapshot inspection | `python-health` / `inspect` | Existing actual helper tests; packaged executable health required in build |
| Action diagnostics | Sanitized fixed `diagnostic` messages + existing export | Existing privacy tests; native startup log separately retained |
| Updates | Native signed HTTPS manifest + Authenticode publisher | Disabled explicitly in trial; owner signing/feed + update evidence pending |
| Close / restart safety | Monotonic renderer edit state + active native calls + business-job guards | Bridge sequencing tested; real close/update interaction check pending |

No production feature is declared Windows-verified merely because it appears in
this table. The full installer/Office/data/performance gates are tracked in
`WINDOWS-VERIFICATION.md`.

## Audited-defect repairs — 0.2.1 source

- Incoming downloads stage and validate records and generated/import indexes
  before touching live files. The original revision and inventory guard never
  changes. Local saves, document/import publication and activation use the same
  account mutation boundary; network and Python work remain outside it.
- A durable activation journal restores the previous directories, pointer and
  acknowledgment together after a failure/interruption. A committed journal
  completes forward. The startup dashboard rejects caches awaiting this recovery.
- Old contamination is retried automatically only when every unexplained local
  extra is provably the incoming immutable remote content and the editable
  revision is still acknowledged. Unknown or edited content is preserved, not
  discarded or falsely acknowledged.
- Generation reserves a successfully saved full-workspace snapshot before
  dispatching work. One-use account-local reservations freeze selection/options,
  survive later saves and release their pins on completion or unused expiry.
- Decryptable-but-invalid/oversized sessions use the existing explicit recovery
  choice. Recovery retains encrypted originals and restricts subsequent sign-in
  to known cached owners when available. Empty/incomplete onboarding destinations
  are not initialized caches and are never merged into or deleted.

Local verification: 71 shared-service tests, 7 stdio native-service contract
tests, 8 retained Electron regression tests, 9 portable Rust tests and 19 Python
tests passed. TypeScript checking and production renderer/sidecar asset builds
passed. Windows-only Rust startup syntax was parsed locally; **this is not a
Windows desktop compilation or installed-app acceptance run**. CI evidence now
hashes the new activation, inventory, session and generation repair sources.

A focused browser pass using an injected, isolated desktop IPC fixture also
passed: generation waited for a pending autosave; used its acknowledged revision
and captured title/options; allowed later editing/saving during generation; and
made no prepare/generate calls after a prerequisite save failed. This verifies
the renderer contract only, not real native IPC, Drive or Word.
