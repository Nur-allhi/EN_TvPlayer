@echo off
setlocal enabledelayedexpansion
title EN IPTV

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5001 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
timeout /t 1 /nobreak >nul

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do set "IP=%%a"
set "IP=%IP: =%"

echo.
echo  Starting EN IPTV (HTTPS)...
echo.
echo  Server:  https://localhost:5000
echo  Player:  https://localhost:5000/enplayer
echo  Manage:  https://localhost:5000/manage
echo  Proxy:   https://localhost:5001
if defined IP echo  Network: https://!IP!:5000
echo.
echo  Note: Accept self-signed certificate warning in browser (Advanced > Proceed).
echo.

start "EN IPTV Server" cmd /c node packages\server\server.mjs
start "EN IPTV Proxy" cmd /c node packages\proxy\proxy.mjs

echo  Both services started in separate windows.
pause
