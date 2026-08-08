param(
  [string]$KeyPath = 'D:\FlowBiz\FlowBiz Company\key\google_ai_studio',
  [string]$Model = 'gemini-3.5-flash',
  [string]$Types = '',
  [ValidateSet('contract', 'full')][string]$Mode = 'contract',
  [int]$DelayMs = 15000,
  [int]$Port = 4174
)

$ErrorActionPreference = 'Stop'
$raw = Get-Content -Raw -LiteralPath $KeyPath
$matches = [regex]::Matches($raw, 'AIza[0-9A-Za-z_-]{20,}')
if ($matches.Count -ne 1) { throw 'Expected exactly one Google API key candidate.' }

$runtime = Join-Path $env:TEMP ('creator-empire-ai-live-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $runtime | Out-Null
$database = Join-Path $runtime 'coverage.sqlite'
$stdout = Join-Path $runtime 'server.stdout.log'
$stderr = Join-Path $runtime 'server.stderr.log'
$server = $null

try {
  $env:GEMINI_API_KEY = $matches[0].Value
  $env:CREATOR_EMPIRE_DB = $database
  $env:CREATOR_EMPIRE_MAX_DAILY_USD = '2'
  $env:CREATOR_EMPIRE_MAX_MONTHLY_USD = '20'
  $server = Start-Process -FilePath 'python' -ArgumentList @('creator_server.py', '--root', 'dist', '--host', '127.0.0.1', '--port', $Port) -WorkingDirectory $PSScriptRoot\.. -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -WindowStyle Hidden
  Remove-Item Env:GEMINI_API_KEY, Env:CREATOR_EMPIRE_DB, Env:CREATOR_EMPIRE_MAX_DAILY_USD, Env:CREATOR_EMPIRE_MAX_MONTHLY_USD -ErrorAction SilentlyContinue
  Remove-Variable raw, matches -ErrorAction SilentlyContinue

  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
      if ($health.ok) { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 250 }
  }
  if (-not $ready) { throw "AI coverage server did not start. See $stderr" }

  $env:CREATOR_EMPIRE_BASE_URL = "http://127.0.0.1:$Port"
  $env:CREATOR_EMPIRE_GEMINI_MODEL = $Model
  $env:CREATOR_EMPIRE_CONFIGURE_TEST_WORKSPACE = '1'
  $env:CREATOR_EMPIRE_AI_TEST_DELAY_MS = [string]$DelayMs
  $env:CREATOR_EMPIRE_AI_TEST_MODE = $Mode
  if ($Types) { $env:CREATOR_EMPIRE_AI_TEST_TYPES = $Types }
  npm run test:ai-live
  if ($LASTEXITCODE -ne 0) { throw "Live AI coverage failed with exit code $LASTEXITCODE" }
} finally {
  Remove-Item Env:GEMINI_API_KEY, Env:CREATOR_EMPIRE_DB, Env:CREATOR_EMPIRE_MAX_DAILY_USD, Env:CREATOR_EMPIRE_MAX_MONTHLY_USD, Env:CREATOR_EMPIRE_BASE_URL, Env:CREATOR_EMPIRE_GEMINI_MODEL, Env:CREATOR_EMPIRE_CONFIGURE_TEST_WORKSPACE, Env:CREATOR_EMPIRE_AI_TEST_DELAY_MS, Env:CREATOR_EMPIRE_AI_TEST_TYPES, Env:CREATOR_EMPIRE_AI_TEST_MODE -ErrorAction SilentlyContinue
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
}

[pscustomobject]@{ ok = $true; model = $Model; isolatedDatabase = $database; serverLog = $stderr } | ConvertTo-Json
