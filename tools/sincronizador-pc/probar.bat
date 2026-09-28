@echo off
rem Prueba el sincronizador SIN cambiar nada en la tienda: lee la base y verifica la clave y la conexion.
cd /d "%~dp0"
"%WINDIR%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0sincronizar.ps1" -Prueba
echo.
pause
