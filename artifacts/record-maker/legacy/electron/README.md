# Electron reference archive

This is the preserved Electron host, not the replacement Tauri application.
`archive-manifest.json` records original paths and SHA-256 hashes before relocation,
plus the Git baseline containing the original source. Imports and build paths have
been adapted so the reference build can continue using the single shared service
implementation under `services/`; do not restore this archive over current data.

From the workspace root:

```sh
pnpm --filter @workspace/record-maker run legacy:build
pnpm --filter @workspace/record-maker run test:legacy
pnpm --filter @workspace/record-maker run legacy:dev
```

On Windows, with the documented Python packaging requirements:

```sh
pnpm --filter @workspace/record-maker run legacy:package
```

The GitHub **Legacy Electron Windows reference build** is manual-only. Its thin
entrypoint must remain in `.github/workflows` for GitHub to recognize it. It does
not run automatically or publish releases.

No credentials, student records, downloaded dependencies, or generated installers
belong in this archive. The Tauri release must not import or package archived
modules. Retain the prior installed application until native migration verification
and the user's cutover approval; moving source code does not migrate installed data.

Electron build dependencies remain in the workspace to support this opt-in
reference build. Their presence in the development checkout does not include them
in the replacement service bundles; its build audit rejects Electron imports.
