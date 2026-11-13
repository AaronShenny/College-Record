# Free signing and regular releases

## Status and external prerequisites

This repository prepares a **SignPath Foundation application** and a gated
GitHub workflow. It does not imply acceptance, a live update feed, a purchased
certificate, or verified Windows upgrade behavior. No service is provisioned or
release published by editing these files.

1. Review the source and history before making anything public. Prefer a new,
   clean source repository if history contains private uploads/context. An
   archive excludes internal context, but the original history does not.
2. Complete the dependency licence/source and privacy-contact checklist in
   THIRD-PARTY-NOTICES.md and PRIVACY.md. Recordly uses AGPL-3.0-or-later because
   the existing PyMuPDF engine is AGPL. Populate
   `artifacts/record-maker/legal/third-party/` with the reviewed exact-version
   notices/source materials; the release build requires this bundle.
3. Enable MFA for all maintainers. Assign repository reviewer/release roles and
   private security reporting. Apply at https://signpath.org/ for the free OSS
   program. Ask explicitly about the bundled Node, Python and WebView2 runtimes.
   A factual application draft is in SIGNPATH-APPLICATION.md.
4. After approval, install/link SignPath's GitHub App and configure two artifact
   configurations: a ZIP containing `college-record-maker.exe` and
   `record-maker-worker.exe`, and a ZIP containing only `Recordly-*-setup.exe`.
   Sign only the two Recordly-owned executables/installer. Enforce product name
   Recordly and the release version in the signing metadata restrictions.
5. Require owner approval in SignPath. Configure its production signing policy
   and the `recordly-release` GitHub environment. Restrict tags/workflow changes
   and release secrets to maintainers. Keep every signing job GitHub-hosted.
6. Generate the production Tauri key yourself using the Tauri CLI on a trusted
   machine. Back it up securely. Never paste it in chat or commit it. Installed
   applications trust the matching public key, so preserve the key across
   releases.

## GitHub configuration

In the protected `recordly-release` environment, set:

**Secrets**

- `GOOGLE_DESKTOP_CLIENT_JSON`: the existing registered desktop OAuth client.
- `SIGNPATH_API_TOKEN`: approved SignPath submitter token.
- `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

**Variables**

- `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`,
  `SIGNPATH_SIGNING_POLICY_SLUG`.
- `SIGNPATH_BINARIES_CONFIGURATION` and `SIGNPATH_INSTALLER_CONFIGURATION`.
- `RECORD_MAKER_TAURI_PUBLIC_KEY`: public key content, not a filename.
- `RECORD_MAKER_PUBLISHER_NAME`: exact simple certificate name approved by
  SignPath (normally `SignPath Foundation`; confirm the actual certificate).
- `RECORDLY_LICENSE_REVIEWED=true`: only after completing the licence/source
  distribution checklist.

The workflow derives the HTTPS manifest URL from the current GitHub repository.
Release assets must be publicly downloadable without a token. Do not put a
GitHub token into the app to work around a private feed.

## Each release

1. Set the same version in the app package.json, Tauri tauri.conf.json and
   Cargo.toml. Run `cargo check --manifest-path artifacts/record-maker/tauri/src-tauri/Cargo.toml`
   to refresh Cargo.lock's root package version, and include the reviewed lockfile
   change. Commit, push and create a protected tag `vX.Y.Z`.
2. Run **Recordly signed release draft**, entering `X.Y.Z`. It checks out that
   tag, validates versions/configuration, runs tests and compiles the app.
3. Approve Recordly binaries in SignPath. The build verifies Authenticode and
   timestamps, then bundles the signed binaries without patching/rebuilding
   them (which would invalidate signatures).
4. Approve the installer in SignPath. The build verifies it, creates a separate
   **version-bound Tauri signature**, builds `latest.json` and checksums, and
   uploads them to a new **draft** GitHub Release.
5. Install on Windows, verify sign-in, saving/Drive recovery, DOCX/PDF, and an
   actual older-to-newer update. Confirm invalid signatures/publishers fail,
   offline failures leave work usable, Later does not restart, and unsaved work,
   active documents and failed Drive sync prevent update restart.
6. Review the source and third-party source/notice bundle. Publish the draft
   manually only when everything is satisfactory. The current draft workflow
   refuses to overwrite an existing release.

Previously distributed builds with no feed/public key need a one-time manual
installation of the first update-enabled build. Later versions discover the
published stable `latest.json`; drafts do not become available to students.
Never publish old trials as newer updates or feed a Tauri installer to Electron.

## Safety and startup

The complete app, Node service and Python worker ship together. Automatic checks
start one minute after the first real screen, not in the critical window-startup
path, then run every six hours while the app stays open. The manifest check has a
30-second timeout; the larger installer download has a separate 15-minute limit.
Failed checks do not stop editing. Downloaded updates wait
for the student to choose Restart; app data and Drive identity stay unchanged.
An update restart uses the same account/job and Drive save safeguards as before.

Windows signing and the Tauri update signature solve different problems. Both
are mandatory for this release path. No self-signed workaround is enabled.
SignPath approval, a live update from two Windows versions and low-memory
startup measurements remain external checks, not facts established by CI.
