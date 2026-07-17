@echo off
setlocal enabledelayedexpansion
title TV Server

echo.
echo ============================================
echo         TV Server - Starting...
echo ============================================
echo.

REM -- Kill existing process on port 8080 --
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8080 " ^| findstr "LISTENING"') do set "PID=%%a"
if defined PID (
    echo [*] Port 8080 in use - killing...
    taskkill /F /PID !PID! >nul 2>&1
    if not errorlevel 1 (
        echo [+] Killed old server.
    ) else (
        echo [-] Could not kill process.
    )
    timeout /t 1 /nobreak >nul
) else (
    echo [*] Port 8080 is free.
)

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do set "IP=%%a"
set "IP=%IP: =%"

echo.
echo ============================================
echo    TV Server is ready
echo ============================================
echo    Local:   http://localhost:8080
if defined IP (
    echo    Network: http://%IP%:8080
    echo    Manage:  http://%IP%:8080/manage
    echo    TV API:  http://%IP%:8080/api/
)
echo ============================================
echo.

echo Done
pause


node cors-proxy.mjs
echo.
echo Server stopped.
pause