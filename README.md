# Recordly

Recordly is an independently developed Windows 10/11 desktop application for
preparing college Word records from student-provided content and Word templates.
It uses Tauri, React, bundled Node services and a lazy Python document worker.
Students sign in with an allowed college Google account and store their records
in their own Google Drive. Microsoft Word is required for PDF export.

**INDEPENDENTLY DEVELOPED AND OPERATED. NOT OFFICIALLY AFFLIATED WITH RAJAGIRI COLLEGE OF SOCIAL SCIENCE**

## Open source

Recordly's original application and release tooling are licensed under
**AGPL-3.0-or-later**. See [LICENSE](LICENSE) and
[third-party obligations](docs/THIRD-PARTY-NOTICES.md). Dependencies retain their
own licences. Uploaded college material, student records, third-party templates,
and third-party branding are not relicensed by this notice.

AGPL is used because the existing PDF engine includes PyMuPDF/MuPDF. Distributors
must provide the applicable corresponding source, licence texts and notices.
Recordly does not bundle Microsoft Word or grant a licence to use it.

## Build and contribute

- Use Node 22, pnpm 10.26.1, Python 3.12 and the current stable Rust toolchain
  (Rust 1.90 or newer for the Windows desktop build).
- Run `pnpm install --frozen-lockfile`.
- Install `artifacts/record-maker/python/build-requirements.txt` on the Windows
  build machine.
- Desktop build and local development instructions:
  [DESKTOP.md](artifacts/record-maker/DESKTOP.md).
- Release procedure: [FREE-RELEASES.md](docs/FREE-RELEASES.md).
- Run `pnpm --filter @workspace/record-maker run test:release`,
  `typecheck`, `test:desktop`, and `test:native-service` before proposing changes.
- Review changes to workflows, build scripts and the native bridge particularly
  carefully. Do not add secrets, student files, account tokens or diagnostic logs.

## Code signing policy

Recordly is **preparing to apply** to SignPath Foundation's free open-source
signing program. It has not been approved merely by adding this documentation.
Until approved and configured, signed automatic updates remain unavailable.

If approved: free code signing provided by [SignPath.io](https://signpath.io/),
certificate by [SignPath Foundation](https://signpath.org/).

- **Committers and reviewers:** repository maintainers granted write access by
  the repository owner.
- **Release/signing approver:** the repository owner, or explicitly designated
  release maintainers. SignPath approval is required for production signing.
- All contributors with write/signing access must enable multi-factor
  authentication. Repository and SignPath roles must be configured to match
  this policy before applying.
- Only Recordly-owned binaries and the Recordly installer may be signed using
  the project's certificate. Do not re-sign Node, WebView2 or other upstream
  binaries.
- Releases are built on GitHub-hosted Windows runners, signed, verified, and
  prepared as **drafts**. Publishing is a separate maintainer action after
  testing. No unverified installer may be advertised by the update manifest.

See [Privacy](docs/PRIVACY.md) and [Security](SECURITY.md).
