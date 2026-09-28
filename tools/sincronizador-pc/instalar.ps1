# Instala la tarea programada "TodoPack Sincronizar": corre sincronizar.ps1 cada 10 minutos y al prender
# la PC, oculta (sin ventanas en la pantalla de la caja). Lo llama instalar.bat, que pide permiso de administrador.

$ErrorActionPreference = 'Stop'
$carpeta = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $carpeta 'sincronizar.ps1'
$ps32 = Join-Path $env:WINDIR 'SysWOW64\WindowsPowerShell\v1.0\powershell.exe'
$nombre = 'TodoPack Sincronizar'
$usuario = [Security.Principal.WindowsIdentity]::GetCurrent().Name

Write-Host "Instalando la tarea '$nombre' para el usuario $usuario..."
if (-not (Test-Path -LiteralPath (Join-Path $carpeta 'config.txt'))) {
    Write-Host 'Falta config.txt en esta carpeta. Descargalo desde el panel de la tienda y volvé a correr instalar.bat.' -ForegroundColor Red
    exit 1
}

$accion = New-ScheduledTaskAction -Execute $ps32 -WorkingDirectory $carpeta `
    -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $script)
# Cada 10 minutos para siempre (desde dentro de un minuto) y además al prender la PC.
$cada10 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10)
$alPrender = New-ScheduledTaskTrigger -AtStartup
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
$descripcion = 'Manda el stock y los precios del sistema de gestión a la tienda TODO PACK. Sólo lee la base.'

try {
    # S4U: corre aunque no haya nadie con la sesión iniciada, y sin mostrar ventanas.
    $principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType S4U -RunLevel Limited
    Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger @($cada10, $alPrender) -Settings $ajustes `
        -Principal $principal -Description $descripcion -Force | Out-Null
} catch {
    # Si Windows no permite ese modo, corre sólo con la sesión iniciada (puede aparecer un instante una ventana).
    Write-Host "Aviso: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host 'Se instala en modo "sólo con la sesión iniciada".' -ForegroundColor Yellow
    $principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited
    $alIniciarSesion = New-ScheduledTaskTrigger -AtLogOn -User $usuario
    Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger @($cada10, $alIniciarSesion) -Settings $ajustes `
        -Principal $principal -Description $descripcion -Force | Out-Null
}

Write-Host 'Tarea instalada. Corriendo la primera sincronización...'
Start-ScheduledTask -TaskName $nombre
$log = Join-Path $carpeta 'sincronizador.log'
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    $info = Get-ScheduledTaskInfo -TaskName $nombre
    if ((Get-ScheduledTask -TaskName $nombre).State -ne 'Running' -and $info.LastRunTime -gt (Get-Date).AddMinutes(-2)) { break }
}
Write-Host ''
if (Test-Path -LiteralPath $log) {
    Write-Host 'Última línea del registro (sincronizador.log):'
    Get-Content -LiteralPath $log -Encoding UTF8 -Tail 1 | ForEach-Object {
        if ($_ -match 'ERROR') { Write-Host $_ -ForegroundColor Red } else { Write-Host $_ -ForegroundColor Green }
    }
} else {
    Write-Host 'Todavía no hay registro. Revisá en unos minutos el panel de la tienda (Sistema del local).' -ForegroundColor Yellow
}
Write-Host ''
Write-Host 'Listo. La tarea corre sola cada 10 minutos. Para sacarla: desinstalar.bat'
