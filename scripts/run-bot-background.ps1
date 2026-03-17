param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$BotArgs
)

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir
New-Item -ItemType Directory -Force logs | Out-Null

if (-not $env:PLAYWRIGHT_BROWSERS_PATH) {
  $env:PLAYWRIGHT_BROWSERS_PATH = ".cache/ms-playwright"
}

if (-not $env:npm_config_cache) {
  $env:npm_config_cache = ".npm-cache"
}

$npmArgs = @("start", "--") + $BotArgs
$process = Start-Process -FilePath "npm.cmd" `
  -ArgumentList $npmArgs `
  -WorkingDirectory $RootDir `
  -RedirectStandardOutput "logs\\bot.log" `
  -RedirectStandardError "logs\\bot.err" `
  -WindowStyle Hidden `
  -PassThru

Set-Content -Path "logs\\bot.pid" -Value $process.Id
Write-Output "started pid $($process.Id)"
