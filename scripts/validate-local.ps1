param(
  [switch]$Browser
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

Write-Host '== Creator Empire v1.3 Local Validation ==' -ForegroundColor Cyan
Write-Host "Repo: $repo"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 20+ is required.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm is required.' }
$python = if (Get-Command py -ErrorAction SilentlyContinue) { 'py' } elseif (Get-Command python -ErrorAction SilentlyContinue) { 'python' } else { throw 'Python 3 is required.' }

Write-Host '[1/6] Runtime versions'
node --version
npm --version
if ($python -eq 'py') { py -3 --version } else { python --version }

Write-Host '[2/6] Install exact npm dependencies'
npm ci

Write-Host '[3/6] TypeScript + domain/UI tests'
npm test

Write-Host '[4/6] SQLite/data-security tests'
if ($python -eq 'py') { py -3 tests/server-v1.3.py } else { python tests/server-v1.3.py }

Write-Host '[5/6] Windows launcher smoke test'
powershell -NoProfile -ExecutionPolicy Bypass -File tests/windows-startup-v1.3.ps1

Write-Host '[6/6] Repository hygiene guard'
$tracked = git ls-files | Select-String -Pattern '(^dist/|^data/|\.sqlite$|\.sqlite-wal$|\.sqlite-shm$|^\.env$)'
if ($tracked) {
  $tracked | ForEach-Object { Write-Host $_ -ForegroundColor Red }
  throw 'Runtime/build/secret artifacts are tracked by Git.'
}

if ($Browser) {
  Write-Host '[Browser] Installing/validating Playwright Chromium'
  if ($python -eq 'py') {
    py -3 -m pip install playwright
    py -3 -m playwright install chromium
  } else {
    python -m pip install playwright
    python -m playwright install chromium
  }

  $runtime = Join-Path $env:TEMP 'creator-empire-local-qa'
  New-Item -ItemType Directory -Force -Path $runtime | Out-Null
  $db = Join-Path $runtime 'creator.sqlite'
  $env:CREATOR_EMPIRE_DB = $db
  $env:CREATOR_EMPIRE_NO_BROWSER = '1'
  $server = Start-Process -FilePath $python -ArgumentList $(if ($python -eq 'py') { @('-3','creator_server.py','--root','dist','--host','127.0.0.1','--port','4173') } else { @('creator_server.py','--root','dist','--host','127.0.0.1','--port','4173') }) -WorkingDirectory $repo -PassThru -WindowStyle Hidden
  try {
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
      Start-Sleep -Milliseconds 250
      try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:4173/api/storage' -TimeoutSec 2
        if ($health.ok) { $ready = $true; break }
      } catch { }
    }
    if (-not $ready) { throw 'Local server did not become ready for browser E2E.' }
    if ($python -eq 'py') { py -3 tests/browser-v1.3.py } else { python tests/browser-v1.3.py }
  } finally {
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
    Remove-Item Env:CREATOR_EMPIRE_DB -ErrorAction SilentlyContinue
    Remove-Item Env:CREATOR_EMPIRE_NO_BROWSER -ErrorAction SilentlyContinue
  }
}

Write-Host 'LOCAL VALIDATION PASS' -ForegroundColor Green
