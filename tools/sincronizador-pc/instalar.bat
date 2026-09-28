@echo off
rem Instala la tarea programada "TodoPack Sincronizar" (cada 10 minutos). Pide permiso de administrador.
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Pidiendo permiso de administrador...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"
echo.
pause
