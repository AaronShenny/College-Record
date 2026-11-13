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

Target completing Drive downloads within 30 seconds, separately from application startup.

**Why:** The user requested this target after testing on another PC where the app opened quickly but the initial Drive download remained slow.

**How to apply:** Measure a full initial download separately from cached launches and unchanged sync checks. Do not claim the target is met based on an estimated concurrency speedup or by displaying the dashboard before required files are available; network conditions and workspace size affect completion time.

The affected Windows computer uses an HDD and has roughly 4 GB of usable RAM.

**Why:** The user confirmed HDD storage; their diagnostic logs showed the memory capacity, and their Task Manager capture showed high system memory use during a blank-window launch.

**How to apply:** Include cold-versus-warm startup measurements on constrained Windows hardware when evaluating fixes. Do not assume an SSD, infer an app memory leak from overall RAM use, or present a hardware upgrade as a proven requirement without disk/paging measurements.

Prefer isolating native workloads and measuring startup phases before migrating storage solely to resolve freezes.

**Why:** Windows cold-start failure was reproduced in a minimal Electron diagnostic with a fresh browser profile and no React, Python, Google, Drive, or record loading. The same diagnostic loaded on a warm launch. Feature-level work or a preexisting profile is therefore not necessary to reproduce the stall. Subsequent Windows counters captured critically low available physical RAM, heavy disk-backed page-ins, and substantial disk queueing during native window creation. Resource pressure is an evidence-backed major contributor, but aggregate counters cannot identify a particular process, prove antivirus involvement, or establish a failing disk. The user approved targeted investigation before a database rewrite.

**How to apply:** Preserve the existing data format while investigating native blocking, background work and graphics. Do not present cache deletion or a SQLite migration as a proven cure without connecting it to the slowdown. Measure cold-start disk/paging behavior; benchmark an alternative host before committing to a full migration. A successful warm baseline does not meet the cold-start dashboard requirement.

Compare desktop hosts using external launch timing, labelled profile/cache conditions and both minimal and representative workloads.

**Why:** Windows process creation and browser-profile provisioning can precede application timers. A fast minimal host or warm run can otherwise be mistaken for a working cold dashboard.

**How to apply:** Start timing before launching the executable, separate runtime installation/fixture preparation from startup, and retain explicit caveats when comparing historical clocks or readiness milestones. Count successful interaction, not merely a window background, and distinguish process-tree working-set sums from unique physical RAM.

Keep lightweight dashboard summaries separate from fully loaded, editable workspace data.

**Why:** Summary-first startup omits source and image payloads. Treating that partial view as a complete editable workspace could overwrite stored content with missing data. The user confirmed that the installed full Tauri app opened successfully without noticeable delay, supporting this approach; that qualitative confirmation is not repeated cold-start timing or workflow acceptance.

**How to apply:** Use an explicitly read-only summary contract until details are loaded. Report summary readiness separately from full-content availability, and never present a lighter diagnostic screen as production feature parity.

Record a broad diagnostic action history, not only slow operations.

**Why:** The user requested logging of actions and background activity because timing-only logs could not explain failed sync and document jobs.

**How to apply:** Include correlated starts/outcomes and responsiveness evidence, but never typed content, source, images, account information, credentials or raw exception text. Keep writes asynchronous and retention bounded so diagnostics do not introduce another performance problem.

Use graphics acceleration disabled as the Windows compatibility default.

**Why:** The user confirmed the same installed build opened with `--record-maker-disable-gpu` after accelerated launches stayed blank. A later cold launch still stalled before the page loaded with acceleration already disabled. A successful graphics workaround is not proof that cold-start reliability or the startup performance requirement is met.

**How to apply:** Apply the compatibility policy before Electron is ready. Verify release startup without a special shortcut flag, and do not re-enable acceleration merely because it works on CI or another computer. Distinguish early Electron/page-loading stalls from later data and sync work. Low available RAM suggests resource pressure but does not prove paging, antivirus scanning, or disk contention without Windows measurements. Keep installation speed and remaining cold-start delay as separate investigations.

Treat DOCX creation, Office opening, and Word PDF automation as separate operations.

**Why:** An installed session returned a usable DOCX alongside a slow failed PDF attempt, then failed separately while opening through COM. The user clarified that Word opening and PDF export were problems; a DOCX being produced is not confirmation that the document workflow is correct.

**How to apply:** Preserve the DOCX before invoking Office, make PDF failure recoverable without regenerating it, and do not terminate a student's existing Word session. Do not claim Office activation/installation issues or native Windows performance are fixed based on mocked or Linux checks.
