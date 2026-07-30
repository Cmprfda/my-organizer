@echo off
rem My Organizer - configuracao inicial (correr uma vez)
title My Organizer - setup
setlocal
cd /d "%~dp0"

echo ==============================================
echo  My Organizer - configuracao inicial
echo ==============================================
echo.

rem ---- 1. localizar (ou instalar) o Python -------------------------------
set "PY="
where python >nul 2>nul && set "PY=python"
if not defined PY where py >nul 2>nul && set "PY=py -3"

if not defined PY (
    echo Python nao encontrado. A tentar instalar automaticamente com winget...
    winget install -e --id Python.Python.3.12 --scope user --silent --accept-package-agreements --accept-source-agreements
    rem o PATH desta janela ainda nao conhece a instalacao nova - procurar diretamente
    for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python3*") do set "PY=%%D\python.exe"
)

if not defined PY (
    echo.
    echo Nao foi possivel instalar o Python automaticamente.
    echo Instala o Python 3 de https://www.python.org/downloads/
    echo ^(marca a opcao "Add python.exe to PATH"^) e volta a correr este setup.
    echo.
    pause
    exit /b 1
)
echo Python OK: %PY%

rem ---- 2. dependencia openpyxl -------------------------------------------
%PY% -c "import openpyxl" >nul 2>nul || (
    echo A instalar a dependencia openpyxl...
    %PY% -m pip install --user openpyxl
    if errorlevel 1 (
        echo Nao foi possivel instalar o openpyxl. Verifica a ligacao a internet/proxy.
        pause
        exit /b 1
    )
)
echo openpyxl OK

rem ---- 3. atalho no Ambiente de Trabalho ---------------------------------
(
echo Set ws = CreateObject("WScript.Shell"^)
echo Set fso = CreateObject("Scripting.FileSystemObject"^)
echo desk = ws.SpecialFolders("Desktop"^)
echo Set lnk = ws.CreateShortcut(desk ^& "\My Organizer.lnk"^)
echo lnk.TargetPath = "%windir%\System32\cmd.exe"
echo lnk.Arguments = "/c ""%~dp0run.bat"""
echo lnk.WorkingDirectory = "%~dp0"
echo lnk.WindowStyle = 1
echo lnk.IconLocation = "%SystemRoot%\System32\shell32.dll,265"
echo lnk.Description = "My Organizer"
echo lnk.Save
echo rem atalho com o nome antigo, criado por versoes anteriores deste setup
echo If fso.FileExists(desk ^& "\BSP-G2 Tracker.lnk"^) Then fso.DeleteFile desk ^& "\BSP-G2 Tracker.lnk"
) > "%TEMP%\bsp_shortcut.vbs"
cscript //nologo "%TEMP%\bsp_shortcut.vbs"
del "%TEMP%\bsp_shortcut.vbs" >nul 2>nul
echo Atalho "My Organizer" criado no Ambiente de Trabalho.

echo.
echo Setup concluido! A arrancar a app...
echo (Da proxima vez basta usar o atalho do Ambiente de Trabalho)
echo.
call "%~dp0run.bat"
