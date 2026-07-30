bat_content = """@echo off
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
"""

with open("make-release.bat", "w", encoding="utf-8", newline="\r\n") as f:
    f.write(bat_content)

print("Ficheiro make-release.bat criado com sucesso.")