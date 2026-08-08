$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()
$runtimeRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } elseif ($env:TEMP) { $env:TEMP } else { [System.IO.Path]::GetTempPath() }
$temp = Join-Path $runtimeRoot 'creator-empire-win-test'
New-Item -ItemType Directory -Force -Path $temp | Out-Null
$db = Join-Path $temp 'creator_empire.sqlite'
Remove-Item $db -Force -ErrorAction SilentlyContinue
Remove-Item "$db-wal" -Force -ErrorAction SilentlyContinue
Remove-Item "$db-shm" -Force -ErrorAction SilentlyContinue
$env:CREATOR_EMPIRE_DB = $db
$env:CREATOR_EMPIRE_NO_BROWSER = '1'
$env:CREATOR_EMPIRE_PORT = [string]$port

$process = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'START-HERE-WINDOWS.bat' -WorkingDirectory $repo -PassThru -WindowStyle Hidden
try {
  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 250
    try {
      $response = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/storage" -TimeoutSec 2
      if ($response.ok) { $ready = $true; break }
    } catch { }
  }
  if (-not $ready) { throw 'Windows launcher did not expose /api/storage in time.' }
  if (-not (Test-Path $db)) { throw 'SQLite database was not created at the configured runtime path.' }
  $workspace = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/workspace" -TimeoutSec 2
  if ($null -eq $workspace.storage) { throw 'Storage metadata missing.' }
  Write-Host 'PASS Windows batch launcher starts local server'
  Write-Host "PASS SQLite created at $db"
  Write-Host 'PASS workspace API is reachable'
} finally {
  if ($process -and -not $process.HasExited) {
    taskkill /PID $process.Id /T /F | Out-Null
  }
  Remove-Item Env:CREATOR_EMPIRE_DB -ErrorAction SilentlyContinue
  Remove-Item Env:CREATOR_EMPIRE_NO_BROWSER -ErrorAction SilentlyContinue
  Remove-Item Env:CREATOR_EMPIRE_PORT -ErrorAction SilentlyContinue
}
