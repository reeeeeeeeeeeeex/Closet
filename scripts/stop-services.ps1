param([int[]]$ExtraPorts = @())
$ErrorActionPreference = 'Stop'
$closetRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$nextPath = (Join-Path $closetRoot 'node_modules\next\dist\bin\next').Replace('\', '/')
$processes = @(Get-CimInstance Win32_Process)
$projectServices = @($processes | Where-Object {
  $_.Name -in @('node.exe', 'node', 'bun.exe') -and $_.CommandLine -and $_.CommandLine.Replace('\', '/').IndexOf($nextPath, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and $_.CommandLine -match '\s(start|dev)(\s|$)'
})
$serviceIds = @($projectServices | ForEach-Object { [int]$_.ProcessId })
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue)
$projectPorts = @($listeners | Where-Object { $serviceIds -contains $_.OwningProcess } | ForEach-Object { [int]$_.LocalPort })
foreach ($service in $projectServices) { Stop-Process -Id $service.ProcessId -Force -ErrorAction SilentlyContinue }
$ports = @(4320) + $ExtraPorts + $projectPorts | Sort-Object -Unique
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  $remaining = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort })
  if (!$remaining.Count) { Write-Output ('All Closet service ports are closed: ' + ($ports -join ', ')); exit 0 }
  Start-Sleep -Milliseconds 100
}
throw ('Service ports are still listening: ' + (($remaining | ForEach-Object { $_.LocalPort }) -join ', '))
