# Full desktop migration — implementation status

This directory is the replacement native foundation, **not a completed Tauri
release or another claim that the isolated startup benchmark is the full app**.
The existing application and `desktop:*` entrypoints are not switched over yet.

## Implemented and checked locally

- Preserved the Electron-specific source/build reference under `legacy/electron`.
- Moved neutral services into one active `services` tree, retaining existing
  immutable snapshots, Drive commit order, validation, Python and document logic.
- Extracted workflow orchestration behind injected native platform adapters.
  The reference Electron host uses that same implementation.
- Built private Node service bundles with no Electron runtime imports or other
  external npm runtime dependencies.
- Added bounded, multiplexed JSON-line IPC, owner handshake, fixed commands,
  account/revision checks and explicit unknown-write failures.
- Tested real subprocess save/reopen, concurrent revision rejection, incomplete
  summary rejection and the existing clipboard output contract.
- Added the separate account/revision-bound read-only summary writer and bounded
  native reader. They do not read source/image/template files on the summary path.
- Added Windows-user DPAPI and a Windows Job Object owner. They are not browser
  APIs and must pass the Windows checks before they are connected to the UI.

## Windows foundation verification required

After pushing these changes, run GitHub Actions:

1. **Tauri migration foundation checks**
2. **Run workflow**, choosing the branch with these changes
3. Download **Tauri-Migration-Foundation-Evidence**

This workflow produces evidence, **not an installer**. It does not use real
Google accounts, existing student folders, signing secrets or live Drive data.
It exercises the Windows vault, native-owned Node/storage subprocesses, archived
Electron launch/save/reopen smoke and shared regressions using temporary fixtures.
Upload its evidence ZIP if any step fails.

Local commands from the workspace root:

```sh
pnpm --filter @workspace/record-maker run typecheck
pnpm --filter @workspace/record-maker run test:desktop
pnpm --filter @workspace/record-maker run test:legacy
pnpm --filter @workspace/record-maker run test:native-service
pnpm --filter @workspace/record-maker run tauri:service:build
cargo test --locked --manifest-path artifacts/record-maker/tauri/src-tauri/Cargo.toml
```

For the last command on Windows, first build the services and set
`RECORD_MAKER_TEST_NODE` to the absolute path of the installed Node executable.
The workflow does this automatically. Windows-only tests are not silently skipped
when the real service has not been built.

## Still required before a replacement installer

- Tauri WebView command-origin/window policy, dialogs, clipboard and file opening.
- Non-destructive cache migration, legacy-host exclusion and explicit same-account
  credential recovery. Electron ciphertext is **not** assumed DPAPI-compatible.
- Bind the read-only summary contract to native summary-first startup and the real
  dashboard. A summary must never enter the full-workspace save path.
- React bridge integration, detail hydration, safe editing and full feature parity.
- Signed updater/restart handling, prerequisite/installer checks and release CI.
- Windows 10/11 and Office functional evidence; repeated cold/warm installed-app
  measurements on the affected 4 GB/HDD machine.
- Owner-approved cutover and recovery instructions.

Do not run this unfinished foundation against an existing student's cache,
uninstall the working Electron version or publish a replacement installer yet.
