## 🛠️ Quick Commands & CLI

- **Start DEV Server (Port 8766):** `.\run-dev.bat` (Runs `app.py --dev`)
- **Validate Syntax:** `python -m py_compile app.py` + `Get-ChildItem cswaios\*.py | ForEach-Object { python -m py_compile $_.FullName }`
- **Publish Release:** `.\make-release.bat` or `python make_release.py`
- **Verify DEV Endpoint:** `Invoke-RestMethod http://localhost:8766/api/tasks`
- **Start Isolated Test Instance (Port 8767+):** 
  `python app.py --dev --port 8767 --no-browser --no-update`
- **App CLI (no server):** `python app.py <help|update|version|status|push|logs|open|stop|login|logout|fix-icon>` (wrapper `bsp.bat`; `help` lists them, `help <cmd>` details one). Commands target the instance of their own folder via `/api/ping`; add `--dev` to prefer port 8766. They must run in a **separate** window — the server window does not accept input.

---