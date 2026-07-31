' My Organizer - arranque sem janela de linha de comandos.
' Usado pelo atalho do Ambiente de Trabalho (criado por setup.bat); corre
' run-with-server.bat de forma invisivel (WindowStyle 0) e nao espera que
' acabe, porque o servidor fica a correr indefinidamente ate a janela da app
' ser fechada.
Set fso = CreateObject("Scripting.FileSystemObject")
Set ws = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
ws.CurrentDirectory = dir
ws.Run Chr(34) & dir & "\run-with-server.bat" & Chr(34), 0, False
