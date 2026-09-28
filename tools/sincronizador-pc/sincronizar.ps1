# Sincronizador TODO PACK
# Lee el stock y los precios del sistema de gestión del local (Gestion.mdb, SÓLO LECTURA)
# y los manda a la tienda online. Lo corre la tarea programada "TodoPack Sincronizar" cada 10 minutos.
#
#   sincronizar.ps1           sincroniza (lo que hace la tarea programada)
#   sincronizar.ps1 -Prueba   lee la base y prueba la conexión SIN cambiar nada en la tienda
#
# Configuración: config.txt en esta misma carpeta (se descarga desde el panel de la tienda:
# Sistema del local > Clave de la PC del local). Registro de cada corrida: sincronizador.log.

param([switch]$Prueba)

$ErrorActionPreference = 'Stop'
$carpeta = Split-Path -Parent $MyInvocation.MyCommand.Path
$archivoLog = Join-Path $carpeta 'sincronizador.log'

function Escribir-Log([string]$texto) {
    $linea = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $texto
    try {
        Add-Content -LiteralPath $archivoLog -Value $linea -Encoding UTF8
        # El registro guarda sólo las últimas 2000 líneas (unas dos semanas).
        if ((Get-Item -LiteralPath $archivoLog).Length -gt 400KB) {
            $ultimas = Get-Content -LiteralPath $archivoLog -Encoding UTF8 -Tail 2000
            Set-Content -LiteralPath $archivoLog -Value $ultimas -Encoding UTF8
        }
    } catch { }
    if ($Prueba) { Write-Host $texto }
}

# El motor de bases Access que trae Windows (Jet 4.0) sólo existe en 32 bits:
# si esta PowerShell es de 64 bits, se vuelve a lanzar con la de 32.
if ([Environment]::Is64BitProcess) {
    $ps32 = Join-Path $env:WINDIR 'SysWOW64\WindowsPowerShell\v1.0\powershell.exe'
    $argumentos = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $MyInvocation.MyCommand.Path)
    if ($Prueba) { $argumentos += '-Prueba' }
    & $ps32 @argumentos
    exit $LASTEXITCODE
}

function Leer-Config {
    $ruta = Join-Path $carpeta 'config.txt'
    if (-not (Test-Path -LiteralPath $ruta)) {
        throw "Falta config.txt en $carpeta. Descargalo desde el panel de la tienda: Sistema del local > Clave de la PC del local."
    }
    $cfg = @{}
    foreach ($linea in Get-Content -LiteralPath $ruta -Encoding UTF8) {
        $l = $linea.Trim()
        if ($l -eq '' -or $l.StartsWith('#')) { continue }
        $i = $l.IndexOf('=')
        if ($i -gt 0) { $cfg[$l.Substring(0, $i).Trim().ToUpper()] = $l.Substring($i + 1).Trim() }
    }
    if (-not $cfg['URL']) { throw 'Falta la línea URL= en config.txt' }
    if (-not $cfg['CLAVE']) { throw 'Falta la línea CLAVE= en config.txt' }
    return $cfg
}

function Buscar-Base($cfg) {
    if ($cfg['BASE']) {
        if (Test-Path -LiteralPath $cfg['BASE']) { return $cfg['BASE'] }
        throw "No existe la base indicada en config.txt: $($cfg['BASE'])"
    }
    # Si el sistema está abierto, la base está en su misma carpeta.
    $proceso = Get-Process -Name 'Gestion' -ErrorAction SilentlyContinue | Where-Object { $_.Path } | Select-Object -First 1
    if ($proceso) {
        $junto = Join-Path (Split-Path -Parent $proceso.Path) 'Gestion.mdb'
        if (Test-Path -LiteralPath $junto) { return $junto }
    }
    $candidatas = @(
        'C:\Gestion\Gestion.mdb',
        'D:\Gestion\Gestion.mdb',
        (Join-Path $env:USERPROFILE 'Desktop\Gestion\Gestion.mdb'),
        (Join-Path $env:USERPROFILE 'Documents\Gestion\Gestion.mdb'),
        (Join-Path $env:PUBLIC 'Gestion\Gestion.mdb'),
        (Join-Path ${env:ProgramFiles(x86)} 'Gestion\Gestion.mdb'),
        (Join-Path $env:ProgramFiles 'Gestion\Gestion.mdb')
    )
    foreach ($c in $candidatas) {
        if ($c -and (Test-Path -LiteralPath $c)) { return $c }
    }
    throw 'No encontré Gestion.mdb. Poné la ruta completa en config.txt, por ejemplo: BASE=C:\Gestion\Gestion.mdb'
}

function Como-Texto($valor) {
    if ($valor -is [DBNull] -or $null -eq $valor) { return '' }
    return ([string]$valor).Trim()
}

function Como-Numero($valor) {
    if ($valor -is [DBNull] -or $null -eq $valor) { return $null }
    return [double]$valor
}

function Leer-Articulos([string]$base) {
    # Mode=Read: la base se abre sólo para leer y se comparte con el sistema abierto.
    $conexion = New-Object System.Data.OleDb.OleDbConnection ("Provider=Microsoft.Jet.OLEDB.4.0;Data Source=$base;Mode=Read;")
    $conexion.Open()
    try {
        $comando = $conexion.CreateCommand()
        $comando.CommandText = 'SELECT a.IdArticulo, a.CodigoArticulo, a.Nombre, a.PrecioUnitario, a.ExistenciaActual, i.Iva ' +
            'FROM Articulos AS a LEFT JOIN Iva AS i ON a.IdIva = i.IdIva'
        $lector = $comando.ExecuteReader()
        $lista = New-Object System.Collections.Generic.List[object]
        try {
            while ($lector.Read()) {
                $lista.Add([ordered]@{
                    id         = [int]$lector['IdArticulo']
                    codigo     = Como-Texto $lector['CodigoArticulo']
                    nombre     = Como-Texto $lector['Nombre']
                    precioNeto = Como-Numero $lector['PrecioUnitario']
                    iva        = Como-Numero $lector['Iva']
                    stock      = Como-Numero $lector['ExistenciaActual']
                })
            }
        } finally {
            $lector.Close()
        }
        return , $lista
    } finally {
        $conexion.Close()
    }
}

function Mensaje-De-Error($err) {
    # Si la tienda contestó con un error, se muestra su explicación (viene en JSON: {"error": "..."}).
    $respuesta = $err.Exception.Response
    if ($respuesta) {
        try {
            $lector = New-Object System.IO.StreamReader($respuesta.GetResponseStream(), [Text.Encoding]::UTF8)
            $cuerpo = $lector.ReadToEnd()
            $json = $cuerpo | ConvertFrom-Json
            if ($json.error) { return "La tienda respondió $([int]$respuesta.StatusCode): $($json.error)" }
            return "La tienda respondió $([int]$respuesta.StatusCode)"
        } catch { }
    }
    return $err.Exception.Message
}

try {
    if ($Prueba) { Write-Host '=== MODO PRUEBA: no se cambia nada en la tienda ===' -ForegroundColor Yellow; Write-Host '' }

    $cfg = Leer-Config
    $base = Buscar-Base $cfg
    if ($Prueba) { Write-Host "Base del sistema: $base" }

    $articulos = Leer-Articulos $base
    if ($articulos.Count -eq 0) { throw 'La tabla Articulos está vacía: no se manda nada.' }
    if ($Prueba) {
        $conStock = @($articulos | Where-Object { $_.stock -gt 0 }).Count
        Write-Host ("Artículos leídos: {0} ({1} con stock)" -f $articulos.Count, $conStock)
        Write-Host 'Ejemplos:'
        $articulos | Select-Object -First 3 | ForEach-Object {
            Write-Host ("  - {0} | neto {1} + IVA {2}% | stock {3}" -f $_.nombre, $_.precioNeto, $_.iva, $_.stock)
        }
        Write-Host ''
    }

    # Conexión segura (TLS 1.2), necesaria para la tienda.
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

    $cuerpo = @{ equipo = $env:COMPUTERNAME; articulos = $articulos } | ConvertTo-Json -Depth 4 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($cuerpo)
    $url = $cfg['URL']
    if ($Prueba) { $url += $(if ($url.Contains('?')) { '&prueba=1' } else { '?prueba=1' }) }

    $r = Invoke-RestMethod -Uri $url -Method Post -Body $bytes -ContentType 'application/json; charset=utf-8' `
        -Headers @{ Authorization = "Bearer $($cfg['CLAVE'])" } -TimeoutSec 120 -UseBasicParsing

    $resumen = '{0} artículos · {1} vinculados · {2} vinculados nuevos · {3} precios actualizados · {4} productos de la tienda sin vincular' -f `
        $r.articles, $r.linked, $r.newLinks, $r.pricesUpdated, $r.unlinkedProducts
    if ($Prueba) {
        Write-Host 'Conexión con la tienda: OK (la clave es correcta)' -ForegroundColor Green
        Write-Host "Si sincronizara ahora: $resumen"
        Write-Host ''
        Write-Host 'Todo listo. Ahora podés correr instalar.bat.' -ForegroundColor Green
    } else {
        Escribir-Log "OK  $resumen"
    }
    exit 0
} catch {
    $mensaje = Mensaje-De-Error $_
    Escribir-Log "ERROR  $mensaje"
    if ($Prueba) { Write-Host ''; Write-Host "ERROR: $mensaje" -ForegroundColor Red }
    exit 1
}
