# Reuse and startup-cost audit

| Area | Decision | Cost boundary |
| --- | --- | --- |
| React screens and strict data contracts | Reuse the existing UI and schemas | No Electron imports in browser code. Summary data must have a distinct contract, never a fabricated full workspace. |
| Snapshot persistence and Drive commits | Reuse the existing shared services | Filesystem scans, validation, hashing and asset hydration remain in owned Node workers, not the window event loop. |
| Google account flow | Reuse PKCE, identity checks, refresh and serialized token persistence | Inject the native vault/browser adapter. Vault operations may be asynchronous; no repeated encryption of unchanged tokens. |
| Workflow orchestration | One `HostWorkflows` implementation, injected native platform | Native host adapters do not duplicate document, Drive or account business logic. |
| Python document/extraction engine | Reuse unchanged | Lazy subprocess; directory packaging. No Python health scan/import merely to display the dashboard. |
| Electron host/preload/updater/diagnostics | Archive, do not load from replacement | Shared-bundle build audit rejects Electron/archive imports. A manual reference build remains available. |
| Existing startup experiment | Keep separate | Its successful summary benchmark is evidence for the approach, not a production feature-parity or startup acceptance result. |
| Native service bundles | Reuse Node business logic, not an embedded Electron runtime | Bundle transitive npm dependencies. No business HTTP server. The Google callback loopback listener is deliberately retained. |

The native Rust vault and process owner are new host adapters. Existing snapshot
and Drive formats are not rewritten to fit a different desktop framework. Local
Linux tests establish only the portable contracts; Windows/Office and real-machine
timings remain explicit release gates.
