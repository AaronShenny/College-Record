# ExecutionPolicy Bypass applies to this launcher process only. No Windows
# policy, app profile, account, record file, or credential is changed.
param([switch] $TraceWindows, [string] $AppPath = '', [switch] $NoExplorer)
$ErrorActionPreference = 'Stop'
$run = 'run-' + [Guid]::NewGuid().ToString()
$base = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'CollegeRecordMaker-StartupChecks'
$directory = Join-Path $base $run
[IO.Directory]::CreateDirectory($directory) | Out-Null
$log = Join-Path $directory 'launcher.jsonl'
$clock = [System.Diagnostics.Stopwatch]::StartNew()
$encoding = [System.Text.UTF8Encoding]::new($false)
function Write-LaunchEvent([string] $event, [hashtable] $details = @{}) {
    $row = [ordered]@{ at = [DateTime]::UtcNow.ToString('o'); event = $event; elapsedMs = $clock.ElapsedMilliseconds }
    foreach ($key in $details.Keys) { $row[$key] = $details[$key] }
    [IO.File]::AppendAllText($log, (($row | ConvertTo-Json -Compress) + [Environment]::NewLine), $encoding)
}
Write-LaunchEvent 'launcher-start'
Write-Host ('Results: ' + $directory)
Write-Host 'Testing only a minimal Electron window. The time limit is two minutes.'
Write-Host 'The test closes automatically. The results folder opens afterwards.'
$exitCode = 2
$traceProcess = $null
$failureStage = 'locating-app'
try {
    $exe = if ($AppPath) { [IO.Path]::GetFullPath($AppPath) } else { Join-Path $PSScriptRoot 'College Record Maker.exe' }
    if ($TraceWindows -and -not [IO.File]::Exists($exe) -and -not $AppPath) {
        Write-Host 'Choose the already installed College Record Maker.exe, not the Setup installer.'
        Add-Type -AssemblyName System.Windows.Forms
        $picker = New-Object System.Windows.Forms.OpenFileDialog
        try {
            $picker.Title = 'Choose installed College Record Maker 0.1.6 or newer'
            $picker.Filter = 'College Record Maker|College Record Maker.exe'
            $picker.CheckFileExists = $true
            if ($picker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
                $failureStage = 'app-selection-cancelled'
                throw 'No app selected'
            }
            $exe = $picker.FileName
        } finally { $picker.Dispose() }
    }
    if (-not [IO.File]::Exists($exe)) { throw 'Missing installed executable' }
    if ([IO.Path]::GetFileName($exe) -ine 'College Record Maker.exe') { throw 'Not the installed application' }
    if ($TraceWindows) {
        $failureStage = 'checking-app-version'
        $versionText = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($exe).ProductVersion
        $match = [regex]::Match($versionText, '^\d+\.\d+\.\d+')
        if (-not $match.Success -or [version]$match.Value -lt [version]'0.1.6') {
            throw 'Installed version does not support isolation'
        }
        Write-LaunchEvent 'windows-trace-requested' @{ installedVersion = $match.Value; maxSeconds = 150 }
        $failureStage = 'starting-counter-collector'
        $collector = Join-Path $PSScriptRoot 'record-maker-startup-trace.exe'
        if (-not [IO.File]::Exists($collector)) { throw 'Missing counter collector' }
        $traceInfo = [System.Diagnostics.ProcessStartInfo]::new()
        $traceInfo.FileName = $collector
        $traceInfo.UseShellExecute = $false
        $traceInfo.CreateNoWindow = $true
        $traceInfo.RedirectStandardOutput = $true
        $traceInfo.RedirectStandardError = $true
        $traceOutput = Join-Path $directory 'windows-counters.jsonl'
        $traceInfo.Arguments = '--output "' + $traceOutput + '" --seconds 150'
        $traceProcess = [System.Diagnostics.Process]::Start($traceInfo)
        Write-LaunchEvent 'windows-trace-process-created'
        # ReadLineAsync keeps the readiness wait bounded even if the native
        # collector is slow to initialize. It writes only a fixed READY signal.
        $signal = $traceProcess.StandardOutput.ReadLineAsync()
        if ($signal.Wait(8000) -and $signal.Result -eq 'READY') {
            Write-LaunchEvent 'windows-trace-ready'
        } else {
            Write-LaunchEvent 'windows-trace-not-ready-before-launch'
            Write-Host 'Counter initialization was slow; any available trace data will still be kept.'
        }
    }
    $failureStage = 'starting-diagnostic'
    $info = [System.Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $exe
    $info.WorkingDirectory = [IO.Path]::GetDirectoryName($exe)
    $info.UseShellExecute = $false
    $info.Arguments = '--record-maker-startup-diagnostic --record-maker-startup-run=' + $run
    Write-LaunchEvent 'process-launch-requested'
    $child = [System.Diagnostics.Process]::Start($info)
    Write-LaunchEvent 'process-created'
    if (-not $child.WaitForExit(120000)) {
        Write-LaunchEvent 'external-deadline' @{ limitMs = 120000 }
        # Only the test process and its children; never kill apps by image name.
        if (-not $child.HasExited) { & taskkill.exe /PID $child.Id /T /F | Out-Null }
        Write-LaunchEvent 'test-process-stop-requested'
    } else {
        $exitCode = $child.ExitCode
        Write-LaunchEvent 'process-exited' @{ exitCode = $exitCode }
    }
} catch {
    # Exception messages can contain private Windows paths. Log no raw message.
    Write-LaunchEvent 'launcher-error' @{ stage = $failureStage }
    Write-Host ('Diagnostic could not complete the stage: ' + $failureStage)
} finally {
    if ($null -ne $traceProcess) {
        try {
            [IO.File]::WriteAllText((Join-Path $directory 'windows-counters.stop'), 'stop', $encoding)
            if (-not $traceProcess.WaitForExit(3000)) {
                # Only this run's collector. Never kill other processes by name.
                $traceProcess.Kill()
                Write-LaunchEvent 'windows-trace-stop-requested'
            } else { Write-LaunchEvent 'windows-trace-exited' @{ exitCode = $traceProcess.ExitCode } }
        } catch { Write-LaunchEvent 'windows-trace-cleanup-unavailable' }
        finally { $traceProcess.Dispose() }
    }
    Write-LaunchEvent 'launcher-finished' @{ exitCode = $exitCode }
    Write-Host 'Share launcher.jsonl, startup-summary.json, and logs\performance.jsonl if present.'
    if ($TraceWindows) { Write-Host 'Also share windows-counters.jsonl. Counter errors are explicit, not zero readings.' }
    Write-Host 'Do not upload the temporary-profile folder.'
    try { if (-not $NoExplorer) { Start-Process explorer.exe -ArgumentList ('"' + $directory + '"') } }
    catch { Write-Host 'Could not open the results folder automatically; use the Results path shown above.' }
}
exit $exitCode
