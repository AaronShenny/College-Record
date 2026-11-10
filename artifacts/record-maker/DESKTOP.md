# Windows desktop application

## Current working paths

The app now has real DOCX upload/inspection, reviewed placeholder mapping, custom subject/program text and image fields, PDF/CSV import with student review, copied source-file assignments, editable code, screenshot/text outputs, individual and combined DOCX generation, and saved generated versions. It never executes student code. Generation takes a frozen workspace copy and continues while the student edits another program.

The browser development preview uses a stateless local Python processing endpoint. Workspaces, original PDF/CSV imports and generated documents are kept in that browser's IndexedDB. This is a development convenience, **not** the installed app's storage or a production web backend. Native-only actions report their prerequisites instead of returning simulated successes.

The installed Windows app uses its encrypted Google session and account-specific local filesystem cache. It signs in through the system browser with a Google **Desktop app** OAuth client, PKCE/state/nonce, verified Google ID token, verified email, and exact `rajagiri.edu` hosted-domain checks. Packaged builds require this sign-in before record access; verified cached accounts can work offline. Signing in switches to that account's cache, never silently adopts local-development or another account's drafts.

Drive is the remote source of truth. Each student grants `drive.file` for app-created storage and `drive.readonly` to copy a selected existing source folder. There is no central student database. Uploads use immutable hashed asset/metadata names and publish `app.json` last; a failed transfer does not acknowledge unsent work. Generated-file-only changes produce distinct remote commits. Conflict resolution remains deferred to v2: unexpected simultaneous changes block rather than discard local work. Unreferenced remote sync blobs are not automatically pruned without an agreed retention policy.

Logout-and-cleanup explicitly confirms the signed-in account's **app-managed cache only**, requires a successful full sync, and refuses when Word owner-lock files exist. It does not delete Drive files, original imports outside the app, exported copies, unrelated files, or other account/development caches. It does not log Google out of the external browser.

### One-time application registration and release configuration

Before college-wide use, the application owner must create a Google OAuth **Desktop app** client with the Drive API enabled and an appropriate college-approved consent configuration. Supply its downloaded `installed` JSON via `GOOGLE_DESKTOP_CLIENT_JSON` (a secret) or `GOOGLE_DESKTOP_CLIENT_JSON_PATH` (a local file path) **on the Windows packaging machine**. Packaging bundles that registration into app resources; students then use Google consent, not developer credentials or an OAuth JSON file. The in-app JSON picker is available for developer setup. User access/refresh tokens are never bundled, rendered, logged, or synced; Electron safeStorage/Windows protection stores them separately.

The Agent's connected Google Drive integration is not this student-facing OAuth registration and cannot substitute for it. A Replit workspace secret also does not automatically create a GitHub Actions secret: configure the Windows runner separately if using that workflow.

Check registration format without printing it using `node artifacts/record-maker/scripts/check-google-config.mjs`. Native development reads the same environment registration when no encrypted client is already configured; packaged apps read only their bundled registration. Both reject incomplete/non-Desktop credentials with generic, non-echoing errors. Format validation does not verify consent, API enablement or live login.

For signed updates, supply HTTPS `RECORD_MAKER_UPDATE_URL`, exact certificate publisher name(s) in `RECORD_MAKER_PUBLISHER_NAME` (semicolon-separated), and electron-builder's signing credentials (`CSC_LINK`, `CSC_KEY_PASSWORD`) on the packaging runner. Update-enabled builds fail if unsigned. Host the generated installer, `.blockmap` and `latest.yml` on that feed. Downloads are automatic, installation requires Restart Now, and an app/Python update is packaged together. Local saves finish first; active extraction/generation blocks restart; in-flight sync is paused safely and pending uploads remain queued. Without signing/feed configuration the app says updates are unconfigured and does not install unsigned code.

### Verification and release limits

- Run `pnpm --filter @workspace/record-maker run typecheck`, `pnpm --filter @workspace/record-maker run test:desktop`, and `python -m unittest discover -s artifacts/record-maker/python -p "test_*.py" -v`.
- Engine tests exercise the supplied extractor, split-run/body/table/header/footer variables, preserved formatting, images, required-field validation, numeric combined order, distinct document versions, and retained DOCX on unavailable Word/PDF conversion.
- Native tests cover durable snapshots, account claim restrictions, immutable remote references, manifest-last commit, cache download, generated-file-only commits, and transfer-failure preservation using an explicitly simulated Drive service. They are **not live Google integration tests**.
- Linux/browser verification cannot validate Windows COM, OS credential protection, signed installer/update delivery, or Windows 10/11 compatibility. Test these on real Windows with desktop Word and a test college Google account before distribution. The Windows workflow builds an installer; it does not have a licensed Word installation for end-to-end Office testing.
- PDF and opening a generated Word document require installed Windows desktop Microsoft Word; no LibreOffice or browser converter is used. DOCX generation and record editing do not require Word.
- Check third-party distribution obligations (including PyMuPDF licensing) before a college-wide release. Processor/minimum-Windows-build and installer recovery/release policies still need final confirmation.

### Startup and freeze diagnostics

The target is an **interactive cached dashboard within 15 seconds** on the
supported Windows test computer, not merely the appearance of a loading screen.
First-time Google consent and uncached downloads depend on the network and are
reported separately. Do not label the target achieved based on browser or Linux
tests.

The small Electron entry opens the window before loading Google/updater modules.
Credential unlock still verifies which account owns the cache before records are
exposed. Storage reads, validation, durable saves, file hashing, Drive sync,
document jobs and source-folder reads run in a separate Electron UtilityProcess.
Python starts only for an explicit Python job. Cached records do not wait for
Drive; startup updates are deferred, and the initial sync normally starts only
after the renderer has painted its usable dashboard. A missing/empty cache starts
sync without counting its loading screen as a ready dashboard.

Settings → Details → Export diagnostic log includes startup phases, actual
renderer readiness, secure-vault timings, system free/total memory and process
measurements during stalls. Version 0.1.2 adds `diagnosticsVersion: 3`:

- Each launch has a session ID, ordered sequence numbers and process age.
- Native operations and background requests record start/end, duration, success
  and safe failure categories. Parent operation IDs link UI requests, storage,
  Drive and Python work; simultaneous operations remain distinguishable.
- Clicks, form changes, editing activity (at most once per second), pastes,
  submissions, save shortcuts and navigation record static control/page names.
  Controls without a known static ID record only their element type.
- Renderer heartbeat (30 seconds), visible-page event-loop delays, long tasks
  over 200 ms, unhandled renderer errors, renderer/child-process exits, preload
  failures and close requests help distinguish UI stalls from background jobs.
- Drive HTTP attempts include method/status/retry/timing, not URL or body.
  Python jobs include timing/outcome. Generation summaries include document and
  failure counts/categories, including partial failures returned as normal results.

Diagnostics are local; there is no automatic upload. No typed values, keylogging,
source code, screenshots, clipboard contents, document contents, account details,
Drive IDs, file paths, raw error messages/stacks, credentials or tokens are logged.
Error categories/codes deliberately replace potentially private exception text;
an unrecognized failure is reported as `unclassified`, not guessed.

Writes are buffered asynchronously (normally within 250 ms), with a bounded
queue and two rotating files of roughly 2 MB each. Export includes both files,
not just the latest fragment. Retention is size-based; it is not an unlimited
audit archive. Logging failures cannot block record saves. A crash/forced kill
can lose the last buffered events, and an installer failure before app startup
cannot appear in the app log. Main-process diagnostics begin when Electron is
ready; the log is not a full Windows or installer trace.

Older `window-loaded` events included service initialization; versions 2 and 3
measure the window path separately. A heartbeat is diagnostic evidence only,
not proof that an external Word/Google operation is responsive.

Windows releases disable hardware acceleration before Electron becomes ready.
This compatibility default follows an installed-app comparison where accelerated
launches remained blank, while the same build opened with acceleration disabled.
The successful measured launch still took approximately 52 seconds to reach the
dashboard; this fixes the observed blank-window path, not the 15-second target
or the separately reported slow installation.

Existing `--record-maker-disable-gpu` shortcuts remain valid but are no longer
needed on Windows. Bootstrap diagnostics include `gpuDisabled: true` and
`graphicsPolicy: "windows-compatibility-default"` for normal Windows launches.
The setting does not change records, credentials or Drive data. Non-Windows
development retains its system graphics default unless the explicit flag is used.

Windows acceptance checks: default-graphics cold launches without shortcut flags, repeated
warm launches, a screenshot-heavy cached workspace, offline startup, slow Drive,
editing/saving during sync, and closing/reopening after a save. Record
`renderer-interactive` with `screen: "dashboard"` and its `processAgeMs`; a
sign-in screen or loading skeleton does not satisfy the dashboard target.

### Performance and Office changes

The observed successful graphics-disabled launch still needed 51.6 seconds;
the generation request needed 204 seconds and returned a DOCX plus a Word/PDF
failure. An additional attempt to open it through COM failed after 25 seconds.
Those timings do not establish that the DOCX formatting engine itself was slow.

The performance release reduces the main entry to a small bundle without Zod,
minifies service bundles, excludes source maps and duplicated bundled Node
dependencies from the installer, loads secondary renderer pages on demand, and
initializes services alongside page loading instead of waiting for it to finish.
It keeps account verification before cached records become accessible. Fonts
ship only Latin subsets, with system fallback for other characters.
Status requests are single-flight and less frequent for nonempty workspaces.
Local program hydration and immutable Drive uploads use bounded concurrency;
every upload settles before publishing the manifest or acknowledging sync.

Native DOCX generation is committed to the generated-file index **before** PDF
conversion. Documents refreshes while generation runs, so completed DOCX files
can be opened or saved while Office is still exporting. A failed PDF does not
remove the DOCX. After the first Office failure a batch skips subsequent PDF
attempts rather than multiplying long startup failures. Saved DOCX rows have an
**Export PDF** action to retry without regenerating the Word document.

Open uses the Windows registered file association (normally Microsoft Word for
DOCX), not COM activation. Windows must have a valid default application.
PDF export still requires installed, activated Microsoft Word; it uses a
separate bounded helper with dynamic COM dispatch instead of generated caches.
Automation disables macros and link updates, uses an isolated temporary copy,
and times out after 30 seconds. Cleanup never terminates a pre-existing Word
instance; an owned Word process is terminated on timeout only after rechecking
its creation time to avoid PID-reuse mistakes. Safe Office stage/error codes
are included in failure messages and diagnostics. Office activation, missing
Office, broken registration and user prompts cannot be repaired by this app.

The installer build logs stage durations and installed/Python file counts and
sizes, and writes `generated-artifacts/desktop/packaging-report.json`. These are
build measurements, not a measurement of end-user installation time. They are
also not proof of a 15-second installed Windows launch. Measure the next build
on the affected Windows PC; Linux and mocked Office tests cannot certify that.

---

## Development and packaging

This package contains both the React renderer's browser development preview and
the actual Electron desktop entry, restricted preload bridge, filesystem store,
and Python worker. The existing canvas mockups remain unchanged.

## Local storage and execution boundaries

- Local subject/program editing, source code, screenshot/text output, autosave,
  explicit saves, and recoverable Trash.
- Electron uses JSON metadata with separate source/image/template files in its own
  account-scoped `userData/workspaces` directory. Desktop development uses a separate `local-development` workspace.
- The browser preview uses IndexedDB **only for development** and calls the development server's Python document engine. It does not expose native Windows access and is not a substitute for the desktop application.
- The Python bridge supports real health, saved-snapshot inspection, PDF/CSV extraction, document rendering and Windows Word actions.
- The worker never executes students' imported programs.

Google/Drive and signed-update code require the owner configuration described above.
The interface distinguishes disconnected, pending, failed and actually acknowledged work.

## Development

On a development computer, install Node.js 22+, pnpm 10.26.1, and Python 3.12+.
End users will not need these tools once the installer has been built.

From the repository root:

```sh
pnpm install --frozen-lockfile
python -m pip install -r artifacts/record-maker/python/build-requirements.txt
pnpm --filter @workspace/record-maker run typecheck
pnpm --filter @workspace/record-maker run test:desktop
pnpm --filter @workspace/record-maker run desktop:dev
```

`desktop:dev` builds the desktop entry and starts a loopback-only renderer
development server. The packaged application loads bundled files and does not
need a local web server. Main/preload changes currently require restarting
`desktop:dev`; renderer changes hot-reload.

The development workspace is deliberately named `local-development`, not a
fictional Google identity. Verified Google identities use separate hashed account directories.

## Build the Windows installer

Run on **Windows**, not by cross-compiling the Python worker on Linux:

```sh
python -m pip install -r artifacts/record-maker/python/build-requirements.txt
pnpm --filter @workspace/record-maker run desktop:package
```

The package step builds React and Electron, produces a Windows Python executable
with PyInstaller, then builds a per-user NSIS installer containing both runtimes.
Before packaging it also launches the compiled Electron renderer/preload and
UtilityProcess against a disposable fixture, checks readiness, saves and reopens
the fixture, and closes gracefully. That smoke check verifies the default Windows
graphics policy without a special launch flag and runs
without Google credentials; it is not an installed-app, real-account or
15-second performance certification.
Outputs are in `generated-artifacts/desktop/`, excluded from Git and publishing.
The initial configured target is Windows x64; native ARM64/32-bit targets and
minimum supported Windows builds are not yet specified.

An optional, **manually triggered** GitHub Actions workflow is provided at
`.github/workflows/desktop-windows.yml`. It builds and uploads the installer and update metadata, using configured signing/registration secrets when provided. Merely adding this file does not
run GitHub Actions or produce a verified installer.

No signing identity or updater hosting has been configured. Unsigned builds may
produce Windows trust warnings and are not a college-wide production release.
Actual installer launch, native clipboard/dialog behavior, and Word automation
must be verified on Windows 10 and 11 before distribution.

## Storage safety

Every save writes complete JSON metadata and source/image files into an immutable
local snapshot, then atomically replaces the current-snapshot pointer. Failure
before that commit preserves the last complete save. The pending-upload manifest
is committed in the same snapshot. No sync acknowledgements are fabricated.

Superseded snapshots are reclaimed unless pinned by a running job. This is
temporary crash/job isolation, not Git history or a conflict-copy archive.
Load errors preserve files and fail visibly; they never silently reset to an
empty workspace. Incomplete drafts can be saved; generation validation is separate and blocks incomplete required mappings/content.

No external database or shared HTTP data service is introduced.

Each serialized workspace save is capped at 256 MiB including base64 assets. Assets use a content-addressed pool with hardlinks into immutable snapshots, so unchanged images/templates are not recopied on every edit. Superseded local asset blocks are reclaimed after snapshot pins are released. Exceeding a limit shows an error and preserves the last successful save rather than dropping data. Drive uploads reuse unchanged immutable blobs.
