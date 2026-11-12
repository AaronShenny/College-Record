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
