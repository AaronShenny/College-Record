param(
    [ValidateSet('minimal','dashboard','dashboard-summary')][string]$Mode,
    [ValidateSet('cold','warm','unknown','ci')][string]$Condition,
    [ValidateSet('fresh','reused')][string]$Profile = 'fresh',
    [switch]$NoExplorer,
    [switch]$SkipCounters
)
$ErrorActionPreference = 'Stop'
if (-not $Mode) {
    $pick = Read-Host 'Choose 1 minimal, 2 original full dashboard, 3 optimized summary-first dashboard'
    if ($pick -eq '1') { $Mode = 'minimal' } elseif ($pick -eq '2') { $Mode = 'dashboard' }
    elseif ($pick -eq '3') { $Mode = 'dashboard-summary' } else { exit 2 }
}
if (-not $Condition) {
    $pick = Read-Host 'First app test after Restart Windows? Enter cold, warm, or unknown'
    if (@('cold','warm','unknown') -notcontains $pick) { exit 2 }
    $Condition = $pick
}
$base = Join-Path $env:LOCALAPPDATA 'CollegeRecordMaker-TauriChecks'
if ($Mode -ne 'minimal' -and -not (Test-Path (Join-Path $base 'fixture-v1\current.json'))) {
    Write-Host 'Run Prepare-Test.cmd once first, then restart Windows before a cold test.'
    exit 2
}
if ($Mode -eq 'dashboard-summary' -and -not (Test-Path (Join-Path $base 'fixture-v1\dashboard-index-v2.json'))) {
    Write-Host 'Run the NEW Prepare-Test.cmd once to create the summary index, then restart Windows.'
    exit 2
}
$app = Join-Path $PSScriptRoot 'record-maker-tauri-startup.exe'
if (-not (Test-Path $app)) { Write-Host 'Extract the complete Tauri-Startup-Test ZIP first.'; exit 2 }
$run = 'run-' + [Guid]::NewGuid().ToString('N')
$directory = Join-Path $base $run
[IO.Directory]::CreateDirectory($directory) | Out-Null
$encoding = New-Object Text.UTF8Encoding($false)
$clock = [Diagnostics.Stopwatch]::StartNew()
$events = Join-Path $directory 'launcher.jsonl'
function Write-Event([string]$event, [hashtable]$details = @{}) {
    $row = @{ at = [DateTime]::UtcNow.ToString('o'); elapsedMs = $clock.ElapsedMilliseconds; event = $event }
    foreach ($key in $details.Keys) { $row[$key] = $details[$key] }
    [IO.File]::AppendAllText($events, (($row | ConvertTo-Json -Compress) + [Environment]::NewLine), $encoding)
}
$child = $null; $counters = $null; $memory = $null; $exitCode = 2
$launchMs = $null; $readyMs = $null
try {
    Write-Event 'launcher-start' @{ mode = $Mode; condition = $Condition; profile = $Profile; traceEnabled = -not $SkipCounters;
        osVersion = [Environment]::OSVersion.Version.ToString() }
    if (-not $SkipCounters) {
        $info = New-Object Diagnostics.ProcessStartInfo
        $info.FileName = Join-Path $PSScriptRoot 'record-maker-startup-trace.exe'
        $info.Arguments = '--output "' + (Join-Path $directory 'windows-counters.jsonl') + '" --seconds 150'
        $info.UseShellExecute = $false; $info.CreateNoWindow = $true
        $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
        $counters = [Diagnostics.Process]::Start($info)
        $line = $counters.StandardOutput.ReadLineAsync()
        if ($line.Wait(8000) -and $line.Result -eq 'READY') { Write-Event 'windows-counters-ready' }
        else { Write-Event 'windows-counters-not-ready' }
    }
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $app
    $info.Arguments = "--run $run --mode $Mode --profile $Profile --condition $Condition"
    $info.UseShellExecute = $false; $info.WorkingDirectory = $PSScriptRoot
    # Explicitly remove inherited WebView2 overrides that would invalidate isolation.
    foreach ($name in @('WEBVIEW2_USER_DATA_FOLDER','WEBVIEW2_BROWSER_EXECUTABLE_FOLDER','WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS','NODE_OPTIONS','NODE_PATH')) {
        $info.EnvironmentVariables.Remove($name)
    }
    $launchMs = $clock.ElapsedMilliseconds
    Write-Event 'launch-requested'
    $child = [Diagnostics.Process]::Start($info)
    Write-Event 'process-handle-returned' @{ sinceLaunchMs = $clock.ElapsedMilliseconds - $launchMs }
    if (-not $child.HasExited) {
        $memInfo = New-Object Diagnostics.ProcessStartInfo
        $memInfo.FileName = Join-Path $PSScriptRoot 'startup-process-memory.exe'
        $memInfo.Arguments = '' + $child.Id + ' ' + $child.StartTime.ToUniversalTime().Ticks + ' "' + (Join-Path $directory 'process-memory.jsonl') + '"'
        $memInfo.UseShellExecute = $false; $memInfo.CreateNoWindow = $true
        $memory = [Diagnostics.Process]::Start($memInfo)
    }
    $summary = Join-Path $directory 'startup-summary.json'
    while (-not $child.WaitForExit(250)) {
        if ($null -eq $readyMs -and (Test-Path $summary)) {
            $native = [IO.File]::ReadAllText($summary) | ConvertFrom-Json
            if ($native.result -eq 'ready') {
                # Monotonic upper bound, with <=250ms polling delay; includes Process.Start.
                $readyMs = $clock.ElapsedMilliseconds - $launchMs
                Write-Event 'ready-observed' @{ sinceLaunchMs = $readyMs; pollResolutionMs = 250 }
            }
        }
        if (($clock.ElapsedMilliseconds - $launchMs) -ge 120000) {
            Write-Event 'external-deadline' @{ limitMs = 120000 }
            & taskkill.exe /PID $child.Id /T /F | Out-Null
            break
        }
    }
    if ($null -eq $readyMs -and (Test-Path $summary)) {
        Write-Event 'ready-observation-unavailable' # Never mislabel exit time as readiness.
    }
    if ($child.HasExited) { $exitCode = $child.ExitCode }
    Write-Event 'process-exited' @{ exitCode = $exitCode }
} catch {
    Write-Event 'launcher-error' # No exception text or private paths.
    Write-Host 'Test launch failed. Share the result logs; do not upload browser-profile files.'
} finally {
    if ($null -ne $child) {
        try { if (-not $child.HasExited) { & taskkill.exe /PID $child.Id /T /F | Out-Null } } catch {}
    }
    foreach ($sensor in @(@{ process = $counters; stop = 'windows-counters.stop' }, @{ process = $memory; stop = 'process-memory.stop' })) {
        if ($null -ne $sensor.process) {
            [IO.File]::WriteAllText((Join-Path $directory $sensor.stop), 'stop', $encoding)
            try { if (-not $sensor.process.WaitForExit(3000)) { $sensor.process.Kill() } } catch {}
            $sensor.process.Dispose()
        }
    }
    $result = @{ schemaVersion = 1; host = 'tauri'; mode = $Mode; condition = $Condition; profile = $Profile;
        exitCode = $exitCode; launchToReadyObservedMs = $readyMs; pollResolutionMs = 250;
        externalLimitMs = 120000; traceEnabled = -not $SkipCounters }
    [IO.File]::WriteAllText((Join-Path $directory 'launcher-summary.json'), ($result | ConvertTo-Json), $encoding)
    if (Test-Path (Join-Path $directory 'startup-summary.json')) {
        $report = & (Join-Path $PSScriptRoot 'node.exe') (Join-Path $PSScriptRoot 'Compare-Results.mjs') $directory
        if ($LASTEXITCODE -eq 0) { [IO.File]::WriteAllText((Join-Path $directory 'comparison.json'), ($report -join [Environment]::NewLine), $encoding) }
    }
    Write-Event 'launcher-finished'
    Write-Host ('Results: ' + $directory)
    Write-Host 'Share launcher.jsonl, launcher-summary.json, startup-summary.json, performance.jsonl, windows-counters.jsonl and process-memory.jsonl.'
    Write-Host 'Do not upload webview-profile or synthetic fixture folders.'
    if (-not $NoExplorer) { Start-Process explorer.exe -ArgumentList ('"' + $directory + '"') }
}
exit $exitCode
