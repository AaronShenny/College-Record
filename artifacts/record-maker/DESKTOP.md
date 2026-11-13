# Windows desktop migration

The complete application is being migrated from Electron to Tauri. The migration
is not yet a verified Windows release. Do not replace an installed student
application or delete its cache based on the isolated startup benchmark.

## Preserved Electron reference

- Source, native adapters, installer recipe and Electron-specific diagnostics:
  `legacy/electron/`
- Previous build/release documentation: `legacy/electron/DESKTOP.md`
- Original dependency/workflow reference: `legacy/electron/baseline/`
- Original-path and pre-relocation content hashes: `legacy/electron/archive-manifest.json`
- Active host-neutral Node/Python orchestration: `services/` and `python/`
- Existing React UI and data contracts: `src/`

Use `legacy:build`, `legacy:dev`, `legacy:package` and `test:legacy` for the archived
host. The `desktop:*` commands remain legacy aliases until a complete native
replacement passes its release gates; no unfinished Tauri application is silently
substituted.

Drive remains the authoritative store. Moving source files does not migrate,
remove or change any installed account, credential, pending edit or generated file.

## Complete Tauri integration and trial installer

The actual React app now has a separate native Tauri entrypoint, restricted
command bridge, Windows credential/dialog/clipboard/file adapters and bundled
Node/Python workflow integration. It is **not yet an accepted replacement release**.

- `pnpm --filter @workspace/record-maker run tauri:build`: portable renderer and service build.
- `pnpm --filter @workspace/record-maker run tauri:package`: Windows x64 installer build using Node 22.
- GitHub Actions: **Tauri desktop Windows trial installer**.
- Build, verification, signing and recovery checklist: `tauri/WINDOWS-VERIFICATION.md`.

The trial installs as **College Record Maker Tauri**, separately from Electron.
Do not run both hosts together. Existing local caches require explicit copying
consent and verification. The originals remain intact. Credentials may require
same-account recovery; an old encrypted credential is never silently discarded.

The cached dashboard uses a separate, read-only account/revision-bound summary.
Source/images and complete editable records load after its real paint. Summary
objects never enter autosave, generation or sync.

Windows installation/Office checks, signed-update owner configuration, and
repeated affected-PC cold/warm measurements remain release gates. Neither a
portable build nor a successful foundation CI run proves those gates passed.
