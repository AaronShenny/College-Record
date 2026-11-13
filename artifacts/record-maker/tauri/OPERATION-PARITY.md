# Native operation inventory

All existing React pages use the same `DesktopBridge`. Tauri maps fixed commands
to the existing `NativeSession`/`HostWorkflows`, not a second domain implementation.

| Existing operation | Tauri path | Evidence / remaining Windows check |
|---|---|---|
| Runtime and full workspace load | Private service `runtime` / `load` | Real subprocess and revision tests; installed account check pending |
| Autosave / Save Now | Private service `save` | Full-schema/account/revision guards; concurrency/reopen tests |
| Cached record desk | Rust `boot`, read-only summary, real painted-screen signal | Rust metadata tests + bridge gate tests; hardware timings pending |
| Legacy cache onboarding | Native consent, staged copy, hash verification, atomic activation | Portable preservation test; real installed legacy path check pending |
| Source file import / replacement | Service `import-source`, native open dialog | Existing editor/source schema; installed picker check pending |
| Source folder import | `workflow/source-folder`, native folder dialog | Existing background import logic retained; installed check pending |
| Drive folder import | `workflow/drive-sources` | Existing authenticated Drive path retained; live account check pending |
| Clipboard PASTE | Native RGBA-to-PNG, service `paste-image` | Existing output contract + subprocess test; real Windows clipboard pending |
| Template inspection / mapping / fonts | `workflow/inspect-template`, existing pages and Python | Shared contracts/engine tests; installed Word layout check pending |
| PDF/CSV question import / review | `workflow/import-questions`, same supplied extractor | Shared Python engine retained; packaged extractor check in build |
| Generation / history | `workflow/generate`, `list-documents` | Existing immutable snapshot/version logic retained |
| DOCX and Word-only PDF | Same background Python engine | DOCX-before-PDF regression; installed Word/PDF check pending |
| Open generated document | `workflow/open-document` -> validated native ShellExecute | No COM activation for opening; Windows file association check pending |
| Save/export generated document | Existing document bytes + native save dialog | Existing document registry preserved; installed picker check pending |
| Google configuration / sign-in | `configure-google`, `connect-drive`, native approved browser URL | College identity/shared OAuth tests; real browser callback check pending |
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
