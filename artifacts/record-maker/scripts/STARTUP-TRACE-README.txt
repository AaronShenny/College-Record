College Record Maker - Windows startup resource trace

This is a diagnostic, NOT a performance fix. It works with the already
installed Windows College Record Maker version 0.1.6 or newer. No reinstall,
Google credentials, Python install, administrator access or security-policy
change is needed.

1. Extract ALL files from the Startup-Trace-Tools download into one folder.
2. Close the normal app. Restart Windows for a cold-start trace.
3. Double-click Start-Windows-Trace.cmd before opening the normal app.
4. If asked, select your installed "College Record Maker.exe" (not its Setup
   installer). Locate it through the installed shortcut's Open file location.
5. Wait for the results folder to open. Share ONLY:
   launcher.jsonl
   startup-summary.json (if present)
   logs\performance.jsonl (if present)
   windows-counters.jsonl (if present)
   Do NOT share temporary-profile.

The collector starts before the test executable, so it can sample during a
slow process launch. It runs for at most 150 seconds of sampling, plus up to
10 seconds of watchdog grace, and normally stops as soon as the test ends.
The app test still has its own timeout. Closing the launcher forcibly is not
a clean stop; the independent collector watchdog still limits its lifetime.

Samples are taken about every two seconds: available/total physical RAM,
system CPU, commit/pagefile usage, aggregate physical-disk read/write latency,
read throughput and queue length, plus disk-backed page-in/out rates.
Counter errors or missing providers are explicitly marked, not reported as
zero. The first rate sample is marked "warming-up".

No record contents, account details, credentials, file paths, disk labels,
process names, command lines, network traffic or screenshots are collected.
The collector logs its own memory/CPU overhead. It does not read or clear
existing app data. Only the test and collector processes started by this
launcher may be stopped; no other app is terminated.

Disk counters combine all physical disks. Page-ins can include executable
and mapped-file reads, not only swapping caused by low RAM. These counters
can support a disk/paging diagnosis but cannot identify which file, program
or antivirus product caused a delay. Instrumentation itself adds overhead;
this trace is not a zero-overhead startup benchmark.

If school policy blocks the scripts or counters, report it; do not disable
antivirus or change Windows policy. Never run the app as administrator just
to make this test work. This tool uses Windows' built-in .NET Framework.
