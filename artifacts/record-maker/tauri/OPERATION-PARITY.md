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
