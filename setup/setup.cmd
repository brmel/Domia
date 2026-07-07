@echo off
REM Windows setup. Double-click, or run: setup\setup.cmd
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18+ is required. Install it from https://nodejs.org
  exit /b 1
)
node setup\setup.mjs %*
