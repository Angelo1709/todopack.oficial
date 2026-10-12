$ErrorActionPreference = 'Stop'
$task = Get-ScheduledTask -TaskName 'TodoPack-StockSync' -ErrorAction SilentlyContinue
if ($task) {
    Stop-ScheduledTask -TaskName 'TodoPack-StockSync' -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName 'TodoPack-StockSync' -Confirm:$false
}
Write-Output 'Tarea eliminada. Se conservan los archivos y logs.'
