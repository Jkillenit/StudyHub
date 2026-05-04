@echo off
setlocal EnableExtensions
set "ROOT=%~dp0.."
cd /d "%ROOT%"

where npm >nul 2>&1
if errorlevel 1 (
  echo.
  echo  npm was not found in PATH. Open this folder in a terminal where Node.js works,
  echo  or install Node.js from https://nodejs.org and try again.
  echo.
  pause
  exit /b 1
)

echo.
echo  Building Study Hub ^(vite + installer — may take 1–2 minutes^)...
echo.

call npm run dist:win
if errorlevel 1 (
  echo.
  echo  Build failed. See messages above.
  echo.
  pause
  exit /b 1
)

set "EXE=%ROOT%\App\Study Hub.exe"
if exist "%EXE%" (
  echo.
  echo  Done. Starting Study Hub...
  start "" "%EXE%"
) else (
  echo.
  echo  Build finished but App\Study Hub.exe was not found.
  echo  Check release\ for a *-Portable.exe or run npm run dist:win from a terminal.
  echo.
  pause
  exit /b 1
)

exit /b 0
