@echo off
rem My Organizer - arranque (usa setup.bat na primeira vez)

rem aplicar atualizacao pendente deste proprio ficheiro (escrita pela app)
if exist "%~f0.new" (
    move /y "%~f0.new" "%~f0" >nul
    call "%~f0" %*
    exit /b
)

title My Organizer
setlocal
cd /d "%~dp0"

rem localizar o Python (python no PATH, launcher py, ou instalacao por utilizador)
set "PY="
where python >nul 2>nul && set "PY=python"
if not defined PY where py >nul 2>nul && set "PY=py -3"
if not defined PY for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python3*") do set "PY=%%D\python.exe"

if not defined PY (
    echo Python nao foi encontrado. Corre primeiro o setup.bat.
    pause
    exit /b 1
)

%PY% -c "import openpyxl" >nul 2>nul || (
    echo A instalar a dependencia openpyxl ^(so acontece na primeira vez^)...
    %PY% -m pip install --user openpyxl
    if errorlevel 1 (
        echo Nao foi possivel instalar o openpyxl. Corre o setup.bat ou verifica a internet.
        pause
        exit /b 1
    )
)

rem se ja houver um tracker a correr, para-o para arrancar de fresco nesta janela
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue; if ($c) { $p = Get-Process -Id $c[0].OwningProcess -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -like 'python*') { Write-Host 'A parar a instancia anterior do tracker...'; Stop-Process -Id $p.Id -Force } }"

echo A arrancar o My Organizer...
echo  - o browser abre sozinho; os enderecos ^(PC e telemovel^) aparecem abaixo
echo  - as operacoes ficam registadas aqui, em tracker.log e em /logs
echo  - fecha esta janela ^(ou Ctrl+C^) para parar o servidor
echo.
%PY% "%~dp0app.py"
pause
