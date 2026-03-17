param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$BotArgs
)

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

if (-not $env:PLAYWRIGHT_BROWSERS_PATH) {
  $env:PLAYWRIGHT_BROWSERS_PATH = ".cache/ms-playwright"
}

if (-not $env:npm_config_cache) {
  $env:npm_config_cache = ".npm-cache"
}

& npm.cmd start -- @BotArgs
exit $LASTEXITCODE
