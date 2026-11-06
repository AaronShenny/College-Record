# Windows desktop foundation

This package contains both the React renderer's browser development preview and
the actual Electron desktop entry, restricted preload bridge, filesystem store,
and Python worker. The existing canvas mockups remain unchanged.

## Foundation capabilities

- Local subject/program editing, source code, screenshot/text output, autosave,
  explicit saves, and recoverable Trash.
- Electron uses JSON metadata with separate source/image files in its own
  `userData/workspaces/local-development` directory.
- The browser preview uses IndexedDB **only for development**. It does not access
  Windows files or run Python and is not a substitute for the desktop application.
- The Python bridge supports real health and saved-snapshot inspection jobs.
  These are foundation checks, not fake extraction or generation jobs.
- The worker never executes students' imported programs.

**Not connected in this milestone:** Google sign-in, Drive sync, the supplied PDF
extractor, template mapping/document generation, Word/PDF integration, and the
automatic-update release service. These capabilities are not represented as
working. In particular, local changes are not backed up to Drive and
logout-and-delete is unavailable while those changes cannot be synced.

## Development

On a development computer, install Node.js 22+, pnpm 10.26.1, and Python 3.12+.
End users will not need these tools once the installer has been built.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/record-maker run typecheck
pnpm --filter @workspace/record-maker run test:desktop
pnpm --filter @workspace/record-maker run desktop:dev
```

`desktop:dev` builds the desktop entry and starts a loopback-only renderer
development server. The packaged application loads bundled files and does not
need a local web server. Main/preload changes currently require restarting
`desktop:dev`; renderer changes hot-reload.

The development workspace is deliberately named `local-development`, not a
fictional Google identity. Account-scoped directories will be introduced with
real Google authentication. Do not use this foundation for sensitive shared-PC
work before authentication and cleanup are integrated.

## Build the Windows installer

Run on **Windows**, not by cross-compiling the Python worker on Linux:

```sh
python -m pip install -r artifacts/record-maker/python/build-requirements.txt
pnpm --filter @workspace/record-maker run desktop:package
```

The package step builds React and Electron, produces a Windows Python executable
with PyInstaller, then builds a per-user NSIS installer containing both runtimes.
Outputs are in `generated-artifacts/desktop/`, excluded from Git and publishing.
The initial configured target is Windows x64; native ARM64/32-bit targets and
minimum supported Windows builds are not yet specified.

An optional, **manually triggered** GitHub Actions workflow is provided at
`.github/workflows/desktop-windows.yml`. It builds and uploads an unsigned
foundation installer as a workflow artifact. Merely adding this file does not
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
empty workspace. Incomplete drafts can be saved; generation validation is a
separate future step.

No external database or shared HTTP data service is introduced.

The current foundation caps each serialized workspace save at 40 MiB, including
image payloads, and rewrites its snapshot on each save. Exceeding this limit shows
an error and keeps the last successful save; it does not silently drop assets.
Incremental asset transfer and larger-workspace optimization remain future work
before college-wide use.
