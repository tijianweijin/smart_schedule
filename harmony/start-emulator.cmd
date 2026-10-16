@echo off
cd /d "%~dp0"
where pwsh.exe >nul 2>nul
if errorlevel 1 (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0emulator.ps1" -Action Start
) else (
  pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0emulator.ps1" -Action Start
)
if errorlevel 1 pause
