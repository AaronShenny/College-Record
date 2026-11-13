# SignPath application preparation

Use this as a factual draft after creating a reviewed public source repository.
Do not submit unfinished policies or claim approval before SignPath grants it.

- **Project:** Recordly.
- **Purpose:** Independent Windows college record preparation. Students supply
  questions, source text, screenshots and Word templates; Recordly produces
  individual/combined Word documents and Word-based PDF exports.
- **Licence:** AGPL-3.0-or-later for original application source; dependencies
  retain their own licences. Exact-version dependency/source review must be
  completed before production signing.
- **Platforms/architecture:** Windows 10/11 x64; Tauri, React, bundled Node.js
  and a directory-packaged Python document worker. Microsoft Word is separately
  installed by the user.
- **Privacy:** Student records are cached locally and synchronized to their own
  Google Drive following sign-in. Updates use a public GitHub release feed.
  No automatic upload of student data to the publisher is intended. Link the
  reviewed privacy policy and a monitored privacy/security contact.
- **Repository/downloads:** provide the reviewed public source repository URL
  and its existing release/download page. The program requires an already
  released, maintained project and can reject an application with insufficient
  verifiable reputation.
- **Signing scope:** `college-record-maker.exe`, `record-maker-worker.exe`, and
  the generated Recordly NSIS installer. Preserve upstream signatures; never
  sign Node, Microsoft runtimes or other upstream binaries using this project.
- **Build:** GitHub-hosted Windows runner; unsigned files first uploaded as
  GitHub artifacts so SignPath can validate their origin.
- **Approvals:** owner-designated SignPath signing approver; MFA for all trusted
  maintainers; review of build/workflow changes.
- **Updates:** verify Authenticode and the approved certificate publisher,
  then sign the final installer with the separate version-bound Tauri key.
  Draft-only release creation; a maintainer tests and publishes manually.

Ask SignPath to confirm eligibility of the bundled WebView2 redistributable as a
system runtime, both artifact configurations, metadata restrictions, and the
required signing-policy/approval setup. The free program's Windows publisher
will be its approved certificate identity, not automatically extapano.
