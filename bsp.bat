@echo off
rem My Organizer - comandos de linha de comandos
rem   ATENCAO: corre isto numa janela NOVA. A janela do servidor esta ocupada
rem   a servir a app e nao aceita comandos.
rem   bsp help      lista todos os comandos
rem   bsp update    instala a versao nova da pasta partilhada
rem   bsp status    servidor, ficheiros, OneDrive e alteracoes por enviar
rem   bsp push      envia as alteracoes de estado pendentes

setlocal
cd /d "%~dp0"

rem localizar o Python (python no PATH, launcher py, ou instalacao por utilizador)
set "PY="
where python >nul 2>nul && set "PY=python"
if not defined PY where py >nul 2>nul && set "PY=py -3"
if not defined PY for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python3*") do set "PY=%%D\python.exe"

if not defined PY (
    echo Python nao foi encontrado. Corre primeiro o setup.bat.
    exit /b 1
)

if "%~1"=="" (
    %PY% "%~dp0app.py" help
    exit /b %errorlevel%
)

%PY% "%~dp0app.py" %*
exit /b %errorlevel%
