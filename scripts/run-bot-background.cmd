@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-bot-background.ps1" %*
exit /b %ERRORLEVEL%
