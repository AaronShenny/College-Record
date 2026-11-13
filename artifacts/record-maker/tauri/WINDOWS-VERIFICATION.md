# Tauri trial installer: verification and recovery

This is the complete app integration, not the isolated startup test.
It is a **trial build**, not an approved replacement release. An unsigned trial
installer and unconfigured automatic updates are not evidence of release readiness.

## Build

Run **Tauri desktop Windows trial installer** in GitHub Actions. It needs the
existing `GOOGLE_DESKTOP_CLIENT_JSON` build secret. Download
**College-Record-Maker-Tauri-Trial**. The installer is the setup EXE, not the bare
`college-record-maker.exe` included for inventory.

Keep the previous Electron installer. Close Electron before opening Tauri.
Install Tauri for the same Windows user. Do not delete or manually move the old
cache. Tauri uses a separate Windows app-data directory and requests consent
before copying a discovered legacy cache. Copy verification can take time on an
HDD and is **not** an ordinary cached-startup measurement.

The original cache is never overwritten or merged. If several old caches are
found, onboarding stops for investigation. A failed/interrupted copy never
activates partial records. Declining onboarding does not open a fresh, empty
workspace over existing records.

Electron credentials are not assumed compatible. If prompted, select recovery
and sign in with the **same college Google account**. Recovery preserves the old
encrypted files and copied records, including unsynced edits. Do not switch to
a different account to recover another student's cache.

## Functional checks

Use disposable, representative records before your only copy of real work:

- Sign in with `rajagiri.edu`; reject other domains; reconnect the same account.
- Confirm an initial Drive download shows loading, not false empty records.
- Reopen cached subjects offline; inspect actual code, screenshots and mappings.
- Edit, autosave, Save Now, reopen and verify all fields, images and other programs.
- Import a source folder or Drive folder, PDF/CSV questions, and review mappings.
- Upload/replace a DOCX template; map headers/footers, custom fields and fonts.
- Paste a clipboard screenshot, add text output and replace source files.
- Trash/restore programs and subjects; retain history and archived imports.
- Generate selected/individual/combined DOCX, including numeric order/new pages.
- Open DOCX through Windows; export PDF with installed, activated Microsoft Word.
  A PDF failure must retain the successfully created DOCX and support retry.
- Keep editing during generation; verify the generated snapshot stays consistent.
- Confirm closing/restarting is blocked for unsaved drafts or active requests.
- Confirm sync-and-logout refuses cleanup offline or with failed pending uploads.
- Check that no owned Node/Python processes remain after normal app shutdown.
- Never run Electron and Tauri at the same time.

## Installed performance gate

Use the affected 4 GB/HDD PC, representative local records, the same Windows user,
and the installed app, not a developer build or the isolated benchmark.

Measure from shortcut activation to usable cached subjects/navigation on three
separate Windows-restart cold launches and two warm launches. Every required run
must be within 15 seconds without blank screens or Not Responding. Record the
first program-open latency and full-detail completion separately. Native startup
events are in the Tauri app-data `diagnostics/native-startup.jsonl`; normal action,
Drive and document logs remain exportable in Settings.

Measure initial full Drive download separately against the 30-second target;
record workspace size/network conditions. No CI pass guarantees these targets.
Also verify Windows 10/11, installation/reinstallation, missing WebView2 behavior,
and uninstall without deleting user data. The offline WebView2 prerequisite is
bundled, increasing installer size but avoiding a first-install download.

## Updates and signing

Trial builds leave automatic updates disabled with an explicit Settings message.
No fake update success is returned. A release requires owner-managed:

- `RECORD_MAKER_TAURI_UPDATE_URL`: HTTPS Tauri manifest, not Electron `latest.yml`.
- `RECORD_MAKER_TAURI_PUBLIC_KEY`: public Tauri verification key.
- `RECORD_MAKER_PUBLISHER_NAME`: approved Authenticode certificate names.
- Tauri private signing credentials and Windows code-signing configuration through
  the CI secret store; never commit them or paste them into chat.
- `RECORD_MAKER_CERTIFICATE_THUMBPRINT`, referring to the signing certificate
  already installed for the build user. The packaging script refuses to enable
  an update feed without both Tauri signing and this Authenticode configuration.

The updater downloads in the background, verifies the Tauri signature and Windows
publisher, then waits for the student's explicit restart action. Unsafe drafts
and document/account jobs block restart. Test valid/invalid signatures,
publisher mismatch, offline failure and reinstall before enabling the release
feed. UI, Node and Python ship in the same installer.

The first Electron-to-Tauri cutover is manual. Do not point Electron auto-update
at this installer or publish this trial automatically.

## Recovery

If copying or opening fails, keep both app-data folders and the diagnostic logs.
Close Tauri before launching Electron. Since Tauri edits are stored separately,
never restore the old cache on top of newer work or replay its stale upload queue.
Before returning to Electron after Tauri edits, complete and verify Drive sync,
close Tauri, then validate that Electron reloads the authoritative Drive revision.
If offline/unsynced, stop and preserve both caches for inspection.

Do not uninstall the working Electron app or delete its backup until the owner
has accepted functional, data-integrity and hardware-performance evidence.
