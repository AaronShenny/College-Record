@echo off
setlocal
echo College Record Maker - Windows startup resource trace
echo Close the normal app. This tests only the isolated diagnostic window.
echo No administrator access or security setting changes are needed.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Startup-Check.ps1" -TraceWindows
if errorlevel 1 (
  echo.
  echo The test timed out or encountered an error. Keep the result files.
  pause
)
