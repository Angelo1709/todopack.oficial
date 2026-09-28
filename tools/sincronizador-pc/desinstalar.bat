@echo off
rem Saca la tarea programada "TodoPack Sincronizar". No toca la base del sistema ni la tienda.
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Pidiendo permiso de administrador...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell -NoProfile -Command "Unregister-ScheduledTask -TaskName 'TodoPack Sincronizar' -Confirm:$false; if ($?) { Write-Host 'Tarea desinstalada.' }"
echo.
pause
