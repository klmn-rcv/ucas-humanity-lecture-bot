@echo off
setlocal

for %%I in ("%~dp0..") do set "ROOT_DIR=%%~fI"
cd /d "%ROOT_DIR%"

set "LOCAL_NODE_DIR="
for /d %%D in ("%ROOT_DIR%\.cache\node\node-v*-win-x64") do (
  if exist "%%~fD\npm.cmd" set "LOCAL_NODE_DIR=%%~fD"
)
if defined LOCAL_NODE_DIR set "PATH=%LOCAL_NODE_DIR%;%PATH%"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd was not found. Install Node.js or place a portable Node distribution under .cache\node.
  exit /b 1
)

if not defined PLAYWRIGHT_BROWSERS_PATH set "PLAYWRIGHT_BROWSERS_PATH=%ROOT_DIR%\.cache\ms-playwright"
if not defined npm_config_cache set "npm_config_cache=%ROOT_DIR%\.npm-cache"

call npm.cmd start -- %*
exit /b %ERRORLEVEL%
