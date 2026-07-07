@echo off
REM Windows launcher. Examples:
REM   setup\start.cmd                  (desktop app)
REM   setup\start.cmd cli -- run --url https://example.com --prompt "..."
REM   setup\start.cmd server
cd /d "%~dp0.."
node setup\start.mjs %*
