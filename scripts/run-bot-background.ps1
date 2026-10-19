param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$BotArgs
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir
New-Item -ItemType Directory -Force logs | Out-Null

$LocalNodeDir = Get-ChildItem (Join-Path $RootDir ".cache\node") -Directory -ErrorAction SilentlyContinue |
  Where-Object { Test-Path (Join-Path $_.FullName "npm.cmd") } |
  Select-Object -First 1 -ExpandProperty FullName
if ($LocalNodeDir) {
  $env:PATH = "$LocalNodeDir;$env:PATH"
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  throw "npm.cmd was not found. Install Node.js or place a portable Node distribution under .cache\node."
}

if (-not $env:PLAYWRIGHT_BROWSERS_PATH) {
  $env:PLAYWRIGHT_BROWSERS_PATH = ".cache/ms-playwright"
}

if (-not $env:npm_config_cache) {
  $env:npm_config_cache = ".npm-cache"
}

$CliPath = Join-Path $RootDir "src\cli.ts"
$PidPath = Join-Path $RootDir "logs\bot.pid"
if (Test-Path $PidPath) {
  $ExistingId = Get-Content $PidPath -ErrorAction SilentlyContinue
  if ($ExistingId -match '^\d+$') {
    $ExistingProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$ExistingId" -ErrorAction SilentlyContinue
    if ($ExistingProcess.CommandLine -and $ExistingProcess.CommandLine.Contains($CliPath)) {
      throw "Bot is already running with pid $ExistingId"
    }
  }
}
$NodeArgs = @("--import", "tsx", ('"' + $CliPath + '"')) + @($BotArgs | Where-Object { $null -ne $_ })
$process = Start-Process -FilePath (Get-Command node.exe).Source `
  -ArgumentList $NodeArgs `
  -WorkingDirectory $RootDir `
  -RedirectStandardOutput "logs\\bot.log" `
  -RedirectStandardError "logs\\bot.err" `
  -WindowStyle Hidden `
  -PassThru

Set-Content -Path "logs\\bot.pid" -Value $process.Id
Write-Output "started pid $($process.Id)"
