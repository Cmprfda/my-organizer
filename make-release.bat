@echo off
chcp 65001 >nul
title My Organizer - Publish Release

echo ==================================================
echo   My Organizer - Iniciar Processo de Release
echo ==================================================
echo.

python "%~dp0make_release.py"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo --------------------------------------------------
    echo [ERRO] Ocorreu uma falha durante o processo de release.
    echo --------------------------------------------------
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Pressione qualquer tecla para fechar esta janela...
pause >nul
