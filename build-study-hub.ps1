# Build Study Hub and refresh App\Study Hub.exe
Set-Location $PSScriptRoot
npm install
npm run dist:win
Write-Host ""
Write-Host "Done. Launch: .\App\Study Hub.exe   or   .\Launch Study Hub.bat" -ForegroundColor Green
