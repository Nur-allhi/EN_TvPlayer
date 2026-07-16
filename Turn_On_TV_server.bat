@echo off
title TV Server
echo ============================================
echo          TV Server - Starting...
echo ============================================
echo.

:: Find and display the PC's LAN IP address
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do set "IP=%%a"
set "IP=%IP: =%"

if defined IP (
    echo PC LAN IP: %IP%
) else (
    echo Could not detect LAN IP
)

echo.
echo   Management UI : http://localhost:8080/manage
echo   Player        : http://localhost:8080/
echo.
echo   On TV/Mobile, use: http://%IP%:8080/
echo.
echo ============================================
echo.

node cors-proxy.mjs

pause
