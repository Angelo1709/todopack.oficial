@echo off
rem Sincroniza una vez en este momento (lo mismo que hace la tarea programada) y muestra el resultado.
cd /d "%~dp0"
echo Sincronizando...
"%WINDIR%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0sincronizar.ps1"
echo.
echo Ultimas lineas del registro (sincronizador.log):
powershell -NoProfile -Command "Get-Content -LiteralPath '%~dp0sincronizador.log' -Encoding UTF8 -Tail 3"
echo.
pause
