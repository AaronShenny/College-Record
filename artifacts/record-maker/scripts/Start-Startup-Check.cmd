@echo off
setlocal
echo College Record Maker - isolated startup diagnostic
echo This test does not open your account, Drive, Python, or records.
echo Close the normal app before running this test.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Startup-Check.ps1"
if errorlevel 1 (
  echo.
  echo The diagnostic reported a timeout or error. Its results folder may contain useful logs.
  echo If PowerShell is blocked by your organisation, use the manual command in DESKTOP.md.
  pause
)
