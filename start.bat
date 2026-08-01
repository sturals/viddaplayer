@echo off
cd /d "%~dp0"
chcp 65001 > nul
title VIDAA TV Player - Server

netsh advfirewall firewall add rule name="VIDAA_Player_3427" dir=in action=allow protocol=TCP localport=3427 >nul 2>&1

node server.js

pause
