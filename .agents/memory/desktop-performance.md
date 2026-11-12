---
name: Desktop startup and packaging performance
description: Why cached startup and Python packaging need separate Windows performance checks.
---
Ship Python as an installed directory rather than a self-extracting single-file helper.

**Why:** The user reported slow installation, startup, and Windows “Not Responding.” Avoiding repeated extraction removes a known source of helper cold-start cost, but does not prove installation or overall Windows responsiveness is fixed.

**How to apply:** Preserve the full Python runtime directory when packaging. Verify the installed resources layout on Windows, not only TypeScript builds or Linux helper tests. Distinguish renderer tests with simulated IPC from real native startup, Drive, and encryption measurements.

The app should load within 15 seconds.

**Why:** The user explicitly set this performance requirement and asked for a solution before implementation.

**How to apply:** Measure launch to an interactive dashboard on Windows, not just the appearance of a loading screen. Distinguish cached startup from first-time Google authorization and network-dependent downloads when reporting results.

The affected Windows computer uses an HDD and has roughly 4 GB of usable RAM.

**Why:** The user confirmed HDD storage; their diagnostic logs showed the memory capacity, and their Task Manager capture showed high system memory use during a blank-window launch.

**How to apply:** Include cold-versus-warm startup measurements on constrained Windows hardware when evaluating fixes. Do not assume an SSD, infer an app memory leak from overall RAM use, or present a hardware upgrade as a proven requirement without disk/paging measurements.

Prefer isolating native workloads and measuring startup phases before migrating storage solely to resolve freezes.

**Why:** Windows cold-start failure was reproduced in a minimal Electron diagnostic with a fresh browser profile and no React, Python, Google, Drive, or record loading. The same diagnostic loaded on a warm launch. Feature-level work or a preexisting profile is therefore not necessary to reproduce the stall. This does not establish whether disk waits, paging, security scanning, shared startup instrumentation, or another native-host problem caused it. The user approved targeted investigation before a database rewrite.

**How to apply:** Preserve the existing data format while investigating native blocking, background work and graphics. Do not present cache deletion or a SQLite migration as a proven cure without connecting it to the slowdown. Measure cold-start disk/paging behavior; benchmark an alternative host before committing to a full migration. A successful warm baseline does not meet the cold-start dashboard requirement.

Record a broad diagnostic action history, not only slow operations.

**Why:** The user requested logging of actions and background activity because timing-only logs could not explain failed sync and document jobs.

**How to apply:** Include correlated starts/outcomes and responsiveness evidence, but never typed content, source, images, account information, credentials or raw exception text. Keep writes asynchronous and retention bounded so diagnostics do not introduce another performance problem.

Use graphics acceleration disabled as the Windows compatibility default.

**Why:** The user confirmed the same installed build opened with `--record-maker-disable-gpu` after accelerated launches stayed blank. A later cold launch still stalled before the page loaded with acceleration already disabled. A successful graphics workaround is not proof that cold-start reliability or the startup performance requirement is met.

**How to apply:** Apply the compatibility policy before Electron is ready. Verify release startup without a special shortcut flag, and do not re-enable acceleration merely because it works on CI or another computer. Distinguish early Electron/page-loading stalls from later data and sync work. Low available RAM suggests resource pressure but does not prove paging, antivirus scanning, or disk contention without Windows measurements. Keep installation speed and remaining cold-start delay as separate investigations.

Treat DOCX creation, Office opening, and Word PDF automation as separate operations.

**Why:** An installed session returned a usable DOCX alongside a slow failed PDF attempt, then failed separately while opening through COM. The user clarified that Word opening and PDF export were problems; a DOCX being produced is not confirmation that the document workflow is correct.

**How to apply:** Preserve the DOCX before invoking Office, make PDF failure recoverable without regenerating it, and do not terminate a student's existing Word session. Do not claim Office activation/installation issues or native Windows performance are fixed based on mocked or Linux checks.
