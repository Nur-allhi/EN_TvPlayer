@echo off
setlocal enabledelayedexpansion
title EN IPTV

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5001 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
timeout /t 1 /nobreak >nul

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do set "IP=%%a"
set "IP=%IP: =%"

echo.
echo  Starting EN IPTV...
echo.
echo  Server:  http://localhost:5000
echo  Player:  http://localhost:5000/enplayer
echo  Manage:  http://localhost:5000/manage
echo  Proxy:   http://localhost:5001
if defined IP echo  Network: http://!IP!:5000
echo.

start "EN IPTV Server" cmd /c node packages\server\server.mjs
start "EN IPTV Proxy" cmd /c node packages\proxy\proxy.mjs

echo  Both services started in separate windows.
pause
