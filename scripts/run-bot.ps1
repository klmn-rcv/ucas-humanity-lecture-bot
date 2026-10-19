param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$BotArgs
)

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

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

& npm.cmd start -- @BotArgs
exit $LASTEXITCODE
