@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Sync-Stock.ps1" -DryRun
pause
