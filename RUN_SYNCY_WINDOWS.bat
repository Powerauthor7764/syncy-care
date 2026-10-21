@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
 echo Node.js is not installed. Install Node 22 or newer from https://nodejs.org/
 pause
 exit /b 1
)
echo Starting Syncy Care on http://127.0.0.1:3000
node src/server.js
pause
