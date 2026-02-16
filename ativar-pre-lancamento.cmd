@echo off
cd /d "%~dp0"
node scripts\set-launch-mode.js prelaunch
echo.
echo Modo PRE-LANCAMENTO ativado.
echo Faça commit/push e deploy no Railway.
pause
