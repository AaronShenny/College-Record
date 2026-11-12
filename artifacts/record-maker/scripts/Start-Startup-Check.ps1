# ExecutionPolicy Bypass applies to this launcher process only. No Windows
# policy, app profile, account, record file, or credential is changed.
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
try {
    $exe = Join-Path $PSScriptRoot 'College Record Maker.exe'
    if (-not [IO.File]::Exists($exe)) { throw 'Missing installed executable' }
    $info = [System.Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $exe
    $info.WorkingDirectory = $PSScriptRoot
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
    Write-LaunchEvent 'launcher-error'
} finally {
    Write-LaunchEvent 'launcher-finished' @{ exitCode = $exitCode }
    Write-Host 'Share launcher.jsonl, startup-summary.json, and logs\performance.jsonl if present.'
    Write-Host 'Do not upload the temporary-profile folder.'
    try { Start-Process explorer.exe -ArgumentList ('"' + $directory + '"') }
    catch { Write-Host 'Could not open the results folder automatically; use the Results path shown above.' }
}
exit $exitCode
