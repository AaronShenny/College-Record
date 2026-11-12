@echo off
cd /d "%~dp0"
if not exist "%~dp0node.exe" (
  echo Extract the entire Tauri-Startup-Test ZIP first.
  pause
  exit /b 2
)
set "NODE_OPTIONS="
set "NODE_PATH="
"%~dp0node.exe" "%~dp0fixture-service.cjs" --prepare "%LOCALAPPDATA%\CollegeRecordMaker-TauriChecks\fixture-v1"
if errorlevel 1 (
  echo Preparation failed. No real records were accessed.
  pause
  exit /b 2
)
echo Prepared synthetic records. For a cold measurement, restart Windows before running Start-Tauri-Test.cmd.
pause
