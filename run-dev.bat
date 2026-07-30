@echo off
rem My Organizer - instancia de DESENVOLVIMENTO
rem   porto 8766, sem auto-atualizacao (o codigo local e o que esta a ser trabalhado).
rem   A versao estavel do utilizador corre a parte, no porto 8765.
title My Organizer (DEV)
setlocal
cd /d "%~dp0"

set "PY="
where python >nul 2>nul && set "PY=python"
if not defined PY where py >nul 2>nul && set "PY=py -3"
if not defined PY for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python3*") do set "PY=%%D\python.exe"

if not defined PY (
    echo Python nao foi encontrado. Corre primeiro o setup.bat.
    pause
    exit /b 1
)

rem so mata a instancia DEV (8766); a estavel no 8765 fica intacta
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue; if ($c) { $p = Get-Process -Id $c[0].OwningProcess -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -like 'python*') { Write-Host 'A parar a instancia DEV anterior...'; Stop-Process -Id $p.Id -Force } }"

echo A arrancar o My Organizer em modo DEV (porto 8766)...
echo.
%PY% "%~dp0app.py" --dev
pause
