[CmdletBinding()]
param(
    [string]$DatabasePath,
    [string]$SiteUrl,
    [ValidateRange(1, 1440)][int]$IntervalMinutes = 5,
    [string]$InstallDirectory = (Join-Path $env:LOCALAPPDATA 'TodoPack\StockSync'),
    [string]$SourceId = 'gestion-principal',
    [switch]$SkipTask
)
$ErrorActionPreference = 'Stop'
if (-not $DatabasePath) { $DatabasePath = Read-Host 'Ruta completa a Gestion.mdb' }
if (-not $SiteUrl) { $SiteUrl = Read-Host 'URL de la web (https://...)' }
$DatabasePath = (Resolve-Path -LiteralPath $DatabasePath).Path
$url = [Uri]$SiteUrl.TrimEnd('/')
if (-not $url.IsAbsoluteUri -or $url.Scheme -ne 'https' -or $url.UserInfo -or $url.Query -or $url.Fragment -or $url.AbsolutePath -ne '/') { throw 'Indica la URL HTTPS de la web, sin rutas adicionales.' }
if ($SourceId -notmatch '^[a-zA-Z0-9_-]{1,64}$') { throw 'Origen invalido.' }
$token = Read-Host 'Clave STOCK_SYNC_TOKEN configurada en Railway' -AsSecureString
$credential = New-Object Management.Automation.PSCredential('stock', $token)
if ($credential.GetNetworkCredential().Password.Length -lt 32) { throw 'La clave debe tener al menos 32 caracteres.' }
$InstallDirectory = [IO.Path]::GetFullPath($InstallDirectory)
[void][IO.Directory]::CreateDirectory($InstallDirectory)
foreach ($name in @('Sync-Stock.ps1', 'Uninstall-StockSync.ps1', 'Probar-Stock.cmd', 'Sincronizar-Ahora.cmd', 'README.md')) {
    $origin = Join-Path $PSScriptRoot $name
    $destination = Join-Path $InstallDirectory $name
    if ([IO.Path]::GetFullPath($origin) -ne [IO.Path]::GetFullPath($destination)) { Copy-Item -LiteralPath $origin -Destination $destination -Force }
}
$config = [ordered]@{ databasePath = $DatabasePath; endpoint = $url.AbsoluteUri.TrimEnd('/') + '/api/stock/sync'; sourceId = $SourceId; stockColumn = 'ExistenciaActual'; intervalMinutes = $IntervalMinutes; allowLoopbackHttp = $false }
$configPath = Join-Path $InstallDirectory 'config.json'
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
# DPAPI del usuario actual: se vuelve a ingresar la clave en la PC del propietario.
$token | ConvertFrom-SecureString | Set-Content -LiteralPath (Join-Path $InstallDirectory 'secret.txt') -Encoding ASCII
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$installDirectoryInfo = New-Object IO.DirectoryInfo($InstallDirectory)
# Modifica sólo la DACL: al reinstalar, Set-Acl puede intentar escribir también
# información de auditoría y exigir SeSecurityPrivilege (administrador).
$acl = $installDirectoryInfo.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
$acl.SetAccessRuleProtection($true, $false)
$acl.SetAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
$acl.SetAccessRule((New-Object Security.AccessControl.FileSystemAccessRule('SYSTEM', 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
$installDirectoryInfo.SetAccessControl($acl)
$powershell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
& $powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallDirectory 'Sync-Stock.ps1') -ConfigPath $configPath -DryRun
if ($LASTEXITCODE -ne 0) { throw 'No se pudo leer Gestion.mdb. No se registro la tarea.' }
if (-not $SkipTask) {
    # Las rutas son absolutas; no requiere un directorio de trabajo del usuario.
    $action = New-ScheduledTaskAction -Execute $powershell -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -ConfigPath "{1}"' -f (Join-Path $InstallDirectory 'Sync-Stock.ps1'), $configPath)
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)
    $logon = New-ScheduledTaskTrigger -AtLogOn -User $identity
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 4)
    $principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName 'TodoPack-StockSync' -Action $action -Trigger @($trigger, $logon) -Settings $settings -Principal $principal -Description 'Lee Gestion.mdb y envia stock a Todo Pack cada 5 minutos (intervalo configurable).' -Force | Out-Null
    Start-ScheduledTask -TaskName 'TodoPack-StockSync'
    Write-Output "Instalado. Sincroniza cada $IntervalMinutes minutos mientras este usuario tenga sesion iniciada."
}
Write-Output "Carpeta de instalacion: $InstallDirectory"
