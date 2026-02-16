@echo off
cd /d "%~dp0"
node scripts\set-launch-mode.js launch
echo.
echo Modo LANCAMENTO ativado.
echo Faça commit/push e deploy no Railway.
pause
