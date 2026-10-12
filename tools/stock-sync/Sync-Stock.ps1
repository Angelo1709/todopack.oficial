[CmdletBinding()]
param(
    [string]$ConfigPath,
    [switch]$DryRun,
    [string]$ExportPath
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if (-not $ConfigPath) { $ConfigPath = Join-Path $PSScriptRoot 'config.json' }

# Jet 4.0 existe sólo en 32 bits. Windows incluye este PowerShell también en equipos x64.
if ([Environment]::Is64BitProcess) {
    $arguments = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-ConfigPath', $ConfigPath)
    if ($DryRun) { $arguments += '-DryRun' }
    if ($ExportPath) { $arguments += @('-ExportPath', $ExportPath) }
    & "$env:WINDIR\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" @arguments
    exit $LASTEXITCODE
}

function Write-SyncLog([string]$Message) {
    $line = '{0} {1}' -f [DateTime]::UtcNow.ToString('o'), $Message
    Write-Output $line
    if ($script:LogPath) { Add-Content -LiteralPath $script:LogPath -Value $line -Encoding UTF8 }
}

$lock = $null
$connection = $null
try {
    $ConfigPath = [IO.Path]::GetFullPath($ConfigPath)
    $configDirectory = Split-Path -Parent $ConfigPath
    $config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $logDirectory = Join-Path $configDirectory 'logs'
    [void][IO.Directory]::CreateDirectory($logDirectory)
    $script:LogPath = Join-Path $logDirectory 'sync.log'
    try {
        $lock = [IO.File]::Open((Join-Path $configDirectory 'sync.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    } catch [IO.IOException] {
        Write-Output 'Ya hay una sincronizacion en curso.'
        exit 0
    }
    if ((Test-Path -LiteralPath $script:LogPath) -and (Get-Item -LiteralPath $script:LogPath).Length -gt 2000000) {
        Move-Item -LiteralPath $script:LogPath -Destination ($script:LogPath + '.1') -Force
    }
    if (-not $config.sourceId -or $config.sourceId -notmatch '^[a-zA-Z0-9_-]{1,64}$') { throw 'sourceId invalido.' }
    $databasePath = [IO.Path]::GetFullPath([string]$config.databasePath)
    if (-not (Test-Path -LiteralPath $databasePath -PathType Leaf)) { throw 'No existe el archivo MDB configurado.' }
    $stockColumn = [string]$config.stockColumn
    if ($stockColumn -notmatch '^ExistenciaActual(?:[1-9]|10)?$') { throw 'Columna de stock invalida.' }
    $capturedAt = [DateTime]::UtcNow.ToString('o')
    $builder = New-Object System.Data.OleDb.OleDbConnectionStringBuilder
    $builder.Provider = 'Microsoft.Jet.OLEDB.4.0'
    $builder['Data Source'] = $databasePath
    $builder['Mode'] = 'Read'
    $connection = New-Object System.Data.OleDb.OleDbConnection($builder.ConnectionString)
    $connection.Open()
    $command = $connection.CreateCommand()
    $command.CommandTimeout = 30
    $command.CommandText = "SELECT [IdArticulo], [CodigoArticulo], [Nombre], [$stockColumn] AS [Quantity] FROM [Articulos] ORDER BY [IdArticulo]"
    $reader = $command.ExecuteReader()
    $items = New-Object 'System.Collections.Generic.List[object]'
    $ids = New-Object 'System.Collections.Generic.HashSet[int]'
    try {
        while ($reader.Read()) {
            if ($reader.IsDBNull(0) -or $reader.IsDBNull(2) -or $reader.IsDBNull(3)) { throw 'Hay un articulo sin ID, nombre o stock. No se enviara un inventario incompleto.' }
            $id = [int]$reader.GetValue(0)
            $name = ([string]$reader.GetValue(2)).Trim()
            $quantity = [double]$reader.GetValue(3)
            if ($id -lt 1 -or -not $ids.Add($id) -or -not $name -or [double]::IsNaN($quantity) -or [double]::IsInfinity($quantity) -or [Math]::Abs($quantity) -gt 1000000000) {
                throw 'Articulo o cantidad invalida. No se enviara un inventario incompleto.'
            }
            $code = if ($reader.IsDBNull(1)) { '' } else { ([string]$reader.GetValue(1)).Trim() }
            $items.Add([ordered]@{ articleId = $id; code = $code; name = $name; quantity = $quantity })
        }
    } finally { $reader.Dispose(); $command.Dispose(); $connection.Dispose(); $connection = $null }
    if ($items.Count -lt 1 -or $items.Count -gt 10000) { throw 'Inventario vacio o demasiado grande. No se enviara.' }
    $snapshotId = [Guid]::NewGuid().ToString()
    $snapshot = [ordered]@{ version = 1; sourceId = $config.sourceId; snapshotId = $snapshotId; capturedAt = $capturedAt; rowCount = $items.Count; items = $items.ToArray() }
    $json = ConvertTo-Json -InputObject $snapshot -Depth 5 -Compress
    $body = [Text.Encoding]::UTF8.GetBytes($json)
    if ($body.Length -gt 4000000) { throw 'El inventario supera el limite de 4 MB.' }
    $positive = @($items | Where-Object { $_.quantity -gt 0 }).Count
    if ($ExportPath) { [IO.File]::WriteAllText([IO.Path]::GetFullPath($ExportPath), $json, (New-Object Text.UTF8Encoding($false))) }
    if ($DryRun) { Write-SyncLog "PRUEBA: $($items.Count) articulos; $positive con stock positivo. Sin enviar a la nube."; exit 0 }

    $endpoint = [Uri]$config.endpoint
    if (-not $endpoint.IsAbsoluteUri -or $endpoint.UserInfo -or $endpoint.Query -or $endpoint.Fragment) { throw 'URL de API invalida.' }
    $loopbackAllowed = $config.allowLoopbackHttp -eq $true -and $endpoint.IsLoopback
    if ($endpoint.Scheme -ne 'https' -and -not ($endpoint.Scheme -eq 'http' -and $loopbackAllowed)) { throw 'La API debe usar HTTPS.' }
    $secretPath = Join-Path $configDirectory 'secret.txt'
    $secureToken = ConvertTo-SecureString -String ((Get-Content -LiteralPath $secretPath -Raw).Trim())
    $credential = New-Object Management.Automation.PSCredential('stock', $secureToken)
    $token = $credential.GetNetworkCredential().Password
    if ($token.Length -lt 32) { throw 'La clave de sincronizacion debe tener al menos 32 caracteres.' }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ack = $null
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            # Sin redirecciones: nunca reenviar el secreto a otro host.
            $response = Invoke-WebRequest -Uri $endpoint -Method Post -UseBasicParsing -ContentType 'application/json; charset=utf-8' -Body $body -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 30 -MaximumRedirection 0
            $ack = $response.Content | ConvertFrom-Json
            if ($ack.ok -ne $true -or $ack.snapshotId -ne $snapshotId) { throw 'La API no confirmo el inventario enviado.' }
            break
        } catch {
            $status = 0
            if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
            if (($status -ge 400 -and $status -lt 500 -and $status -ne 429) -or $attempt -eq 3) {
                throw "No se pudo confirmar el envio (HTTP $status). Revisar URL, clave, origen, reloj y logs del servidor. Se reintentara con datos nuevos en la siguiente ejecucion."
            }
            Write-SyncLog "Reintento $attempt de 3 (HTTP $status)."
            Start-Sleep -Seconds (2 * $attempt)
        }
    }
    $state = [ordered]@{ lastSuccessUtc = [DateTime]::UtcNow.ToString('o'); snapshotId = $snapshotId; rows = $items.Count; positive = $positive; matched = $ack.matched; unmatched = $ack.unmatched }
    [IO.File]::WriteAllText((Join-Path $configDirectory 'last-success.json'), ($state | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
    Write-SyncLog "OK: $($items.Count) articulos recibidos; $($ack.matched) productos vinculados; $($ack.unmatched) activos sin vinculo."
    exit 0
} catch {
    Write-SyncLog ('ERROR: ' + $_.Exception.Message)
    exit 1
} finally {
    if ($connection) { $connection.Dispose() }
    if ($lock) { $lock.Dispose() }
}
