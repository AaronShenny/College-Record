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
