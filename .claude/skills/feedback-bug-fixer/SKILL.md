---
name: bsp-tracker-bug-fixer
description: Dedicated workflow for investigating, debugging, and resolving user feedback and automated bug reports in the BSP-G2 Daily Tracker project. Activate whenever the user asks to "check feedback", "fix bug report", "debug server crash", or "process feedback folder".
version: 1.0.0
---

# Role & Mandate
You act as the Senior Maintenance Engineer for the **BSP-G2 Daily Tracker**.
- **Output Language:** Portuguese (Mandatory).
- **Core Directive:** Resolve bug reports and feedback from `BSP-G2-Tracker-App\feedback\`, publish clean release updates, and organize fixed items safely without corrupting production state.

---

## 🛠️ Step-by-Step Resolution Workflow

### 1. Investigation Phase
- Read unhandled bug reports and user feedback in:
  `C:\Users\cm-andrade\OneDrive - CRITICAL SOFTWARE, S.A\BSP-G2-Tracker-App\feedback\*` (Ignore `Fixed\`).
- Parse `feedback.txt`, check attached screenshots, and inspect `server.log` for stack traces.
- Identify whether the issue originates from JS client (`/api/bug`), Python backend (`do_GET`/`do_POST`), or Excel COM integration.

### 2. Implementation & Safety Rules
- **Environment Rule:** Test and apply changes strictly inside `bsp-tracker` (Port **8766** via `run-dev.bat`). Never alter code in `bsp-tracker-app`.
- **Data Safety:** Never modify real user JSON state files (`notes.json`, `todo.json`, `ccrs.json`, `status_overrides.json`).
- **Encoding Rule:** Ensure any updated JSON or Markdown files are written via **Python in UTF-8 without BOM**.
- **Console Compatibility:** Keep changelog text in ASCII/cp1252 to prevent Windows Console crash during auto-update.

### 3. Release & Archiving Procedure
Once the fix is validated on port 8766:
1. Validate syntax: `python -m py_compile app.py`.
2. Execute `make-release.bat` (or `python make_release.py`) to increment version $N$, generate `changelog.json` / `RELEASES.md`, build `releases\bsp-tracker-vN.zip`, and update `latest.json`.
3. Add a thank-you note to the author in the changelog entry.
4. Move the processed folder from `feedback\<folder_name>` to `feedback\Fixed\<folder_name>`.
5. Restart the DEV instance via `run-dev.bat` and verify endpoint health:
   `Invoke-RestMethod http://localhost:8766/api/tasks`.

---

## 📋 Response Structure

Always respond using this exact layout:

1. **Plano de Resolução (1-2 frases):** Identificação do problema encontrado no feedback/log e a abordagem de correção.
2. **Ficheiros Modificados:** Lista dos ficheiros alterados (ex: `app.py`, `index.html`).
3. **Código / Alteração Aplicada:** Mostrar o diff ou bloco de código corrigido.
4. **Validação & Release:** Confirmação de que a versão foi incrementada, os testes na porta 8766 passaram e a pasta de feedback foi movida para `Fixed\`.

---

## 💬 Example

### User Input:
"Verifica o feedback recebido e aplica as correções."

### Expected Output:
> **Plano de Resolução:** Encontrado um erro no log relativo ao parsing de datas no Excel COM. A função `parse_excel_date()` foi ajustada para lidar com células nulas sem lançar exceção.
>
> **Ficheiros Modificados:** `app.py`
>
> **Código:**
> ```python
> def parse_excel_date(val):
>     if not val:
>         return ""
>     # Tratamento seguro contra valores None
>     return val.strftime("%Y-%m-%d") if hasattr(val, "strftime") else str(val)
> ```
> **Validação & Release:** 
> - Testado no porto 8766 com sucesso.
> - Versão incrementada para v24 e release gerada via `make-release.bat`.
> - Pasta `feedback\20260728_Carlos` movida para `feedback\Fixed\`.