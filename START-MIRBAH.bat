@echo off
chcp 65001 >nul
title Mirbah - platform server
cd /d "%~dp0"
set PORT=8788
set MIRBAH_OWNER_EMAIL=owner@mirbah.local
set MIRBAH_OWNER_PASSWORD=Mirbah-Owner-2026!

echo.
echo  MIRBAH  http://localhost:8788
echo  (leave this window open - closing it stops the site)
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is not installed or not on PATH.
  echo  Install from https://nodejs.org then run this file again.
  pause
  exit /b 1
)

start "" http://localhost:8788/public/
node tools\start-platform.js

echo.
echo  Server stopped. Press any key to close.
pause >nul
