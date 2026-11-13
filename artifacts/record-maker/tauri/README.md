# Tauri desktop application

This tree hosts the actual app, separately from `startup-test` and the preserved
Electron reference in `legacy/electron`.

## Connected application

- Existing React screens and full Workspace contracts, not a diagnostic fixture.
- Rust-owned local window, restricted fixed commands and no browser-storage fallback.
- Native Windows DPAPI, clipboard PNG paste, dialogs, approved OAuth browser
  opening and app-managed DOCX/PDF file opening.
- Private bundled Node service, bounded IPC and an owned Windows process tree.
- Unchanged Drive commits and directory-packaged Python document/extraction engine.
- Account-bound read-only summary before Node startup, full-detail load before
  editing, metadata backfill for older caches, serialized revision-guarded saves.
- Verified legacy-cache staging after consent; originals untouched; encrypted
  credential recovery rather than assumed Electron cipher compatibility.
- Native close/edit guards, signed-update verification and explicit restart.
- Windows NSIS trial installer with the offline WebView2 prerequisite.

## Build and verify

Run **Tauri desktop Windows trial installer** in GitHub Actions. It builds the
native application/installer and uploads **College-Record-Maker-Tauri-Trial** plus
**Tauri-Desktop-Build-Evidence**. It uses the existing Google desktop build secret.

For local portable checks:

```sh
pnpm --filter @workspace/record-maker run typecheck
pnpm --filter @workspace/record-maker run tauri:build
pnpm --filter @workspace/record-maker run test:desktop
pnpm --filter @workspace/record-maker run test:native-service
cargo test --locked --manifest-path artifacts/record-maker/tauri/src-tauri/Cargo.toml
```

The portable Rust core remains compatible with the workspace's Rust 1.88.
Windows desktop dependencies require a current stable Rust toolchain (at least
1.92 for the selected native dialog library); the Windows CI installs stable.

**Do not treat this as an approved production cutover.** Follow
[WINDOWS-VERIFICATION.md](WINDOWS-VERIFICATION.md) for real-account, Office,
installation, data recovery and affected 4 GB/HDD performance gates. Signing/feed
configuration is owner-managed. A trial with no feed explicitly disables updates.

The old `desktop:*` commands deliberately remain Electron aliases until native
acceptance. No working installation or old cache is automatically replaced.
