COLLEGE RECORD MAKER — TAURI STARTUP COMPARISON

This is an isolated diagnostic, NOT a replacement app or a migration.
It never opens your existing records, credentials, Google account, Drive, Python
or Word. Keep the existing College Record Maker installation.
Extract the entire ZIP to a folder on the SAME disk as the Electron installation.
Do not run these files inside the ZIP. No administrator access is required.

BEFORE THE FIRST MEASUREMENT
1. WebView2 Evergreen Runtime is required. If absent, install it once using
   Microsoft's official installer:
   https://developer.microsoft.com/en-us/microsoft-edge/webview2/
   Windows 11 normally includes it; do not assume every Windows 10 PC does.
   This ZIP does not silently download or install prerequisites.
2. Run Prepare-Test.cmd ONCE. This makes 4 synthetic subjects / 80 programs
   using the real local storage engine. It does NOT read your account.
3. Restart Windows AFTER preparation and WebView2 installation. Installation,
   extraction and fixture creation are NOT startup measurements.

FIRST COMPARISON — MINIMAL HOST
4. Close the normal app. Make Start-Tauri-Test.cmd the first app test after
   Windows Restart. Choose 1, then enter cold.
5. The test should show a local page, check native communication and interaction,
   and close eight seconds after readiness. A blank window does NOT count.
6. Run it immediately again, choosing 1 and warm.
7. Share both run folders' six log/summary files listed by the launcher.

SECOND COMPARISON — REAL DASHBOARD
8. Restart Windows again. Run Start-Tauri-Test.cmd, choose 2 and cold.
9. It loads the real React dashboard and retained Node storage service with
   synthetic records, opens/cancels New Subject to verify React responds, then
   closes. No production sign-in, sync, clipboard, editing or generation exists.
10. Run it immediately again, choosing 2 and warm. Share both sets of files.

OPTIMIZED COMPARISON — SUMMARY FIRST (NEW OPTION 3)
11. Run the NEW Prepare-Test.cmd once, even if an older fixture exists.
    It preserves the fixture and writes a small, revision-bound derived index.
12. Restart Windows. Run Start-Tauri-Test.cmd, choose 3 and cold.
13. A read-only React summary screen shows the same 4 subject names and 80
    program summaries. Rust reads the small index directly; no Node startup,
    source-file reads or image hydration is needed for dashboard readiness.
    This is NOT the full production React dashboard; editing is disabled.
14. The test selects/closes a program summary and confirms responsiveness.
    That records dashboard readiness. It THEN automatically starts Node,
    loads ALL full synthetic records through the unchanged storage engine,
    compares them to the index, and displays the first code and screenshot.
    This deferred check has its OWN timing; it is NOT hidden in startup time.
    The run fails if deferred verification fails or exceeds the native deadline.
15. Run option 3 again immediately, choosing warm. Share the two sets of logs.
    Options 1 and 2 are retained; rerunning them is optional, not required.
    No claim is made that option 3 equals the original option 2 workload.

Fresh isolated WebView2 profiles are used by default, matching the earlier
isolated Electron test. A warm launch means OS caches may be warm; its profile
is still fresh. A separate reused-profile mode is available in PowerShell:
  .\Start-Tauri-Test.ps1 -Mode dashboard -Condition warm -Profile reused
Label this separately. Never compare first-profile and reused-profile timings
without stating the difference. No forced reboot, cache flush or AV exclusion.

WHAT THE CLOCKS MEAN
- launcher.jsonl records before Process.Start; launcher-summary.json reports
  launch-to-ready as a monotonic observed upper bound (polling <=250 ms late).
- performance.jsonl records native host/window/page/service milestones.
  summary-read-started/complete measures the Rust index path.
  node-start-requested/spawned measures process startup and isolation.
  node-service-timing separates store loading and JSON encoding; process age
  at request also includes Node initialization and request waiting.
  node-response-received/decoded measures native response parsing.
  detailRequested/detailVerified bounds the deferred full-content check.
- startup-summary.json contains native milestones from Rust entry. Its clock
  starts AFTER Windows begins launching the executable; do not confuse it with
  launch-to-ready. "paintFrames" is two animation frames, NOT a measured
  compositor first-paint timestamp. "ready" also requires interaction and IPC.
- windows-counters.jsonl is aggregate Windows disk/memory/paging pressure.
- process-memory.jsonl sums the owned process tree's working sets and private
  committed bytes. Working-set sums can double-count shared pages; they are
  NOT unique physical RAM. Private bytes are NOT resident RAM.
- Minimal success is NOT proof that a production dashboard meets 15 seconds.
- Option 3 summary readiness is NOT full record-editor or document readiness.
  Both the readiness time and deferred-content time must be reviewed.
- Windows CI is a build/smoke check, NOT a measurement of your 4 GB/HDD PC.

BOUNDS / TROUBLESHOOTING
Native timeout: 60 seconds from Rust entry. External launcher deadline:
120 seconds from launch request, checked once Process.Start returns.
Windows may delay Process.Start itself; the independent launcher logs that gap.
The launcher terminates only its own diagnostic process tree and its collectors.
It does not disable security software, sandboxing or change Windows settings.
Resource tracing itself adds overhead. For a separately labelled repeat:
  .\Start-Tauri-Test.ps1 -Mode minimal -Condition cold -SkipCounters
The process-memory collector still runs; do not mix traced/untraced results.
If WebView2 is missing, or a window stays blank, preserve the result files.
Do not upload browser profiles or any real app data.
Logs and synthetic data live in:
  %LOCALAPPDATA%\CollegeRecordMaker-TauriChecks
Each complete run also creates comparison.json with the historical Electron
baseline and explicit limitations. You can combine runs without uploading them:
  node.exe Compare-Results.mjs "path-to-cold-run" "path-to-warm-run"
To remove this diagnostic, close it and delete the extracted ZIP folder and
that test-only directory. Do NOT delete the normal College Record Maker data.
