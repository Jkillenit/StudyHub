@echo off
:: Opens the last built app. After code changes, double-click "Rebuild Study Hub.bat" first.
setlocal EnableExtensions
set "ROOT=%~dp0.."
cd /d "%ROOT%"

set "LAUNCH=%ROOT%\App\Study Hub.exe"
if exist "%LAUNCH%" (
  start "" "%LAUNCH%"
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$dir = Join-Path '%ROOT%' 'release'; $exe = Get-ChildItem -Path $dir -Filter '*-Portable.exe' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if ($exe) { Start-Process -FilePath $exe.FullName } else { Write-Host ''; Write-Host '  Study Hub is not built yet.' -ForegroundColor Yellow; Write-Host '  Open a terminal here and run:' -ForegroundColor Gray; Write-Host '    npm install' -ForegroundColor White; Write-Host '    npm run dist:win' -ForegroundColor White; Write-Host ''; pause }"
