## 📦 Release Procedure (Execution Checklist)

1. Validate code: `python -m py_compile app.py` and every file in `cswaios\`.
2. Run `.\make-release.bat` (or `python make_release.py`).
3. Choose version bump when prompted:
   - **Project convention (old way):** integer version `vN` only.
   - Enter **custom version** and type the next integer (example: `107`).
   - Do not publish semantic versions (`X.Y.Z`) for this project.
4. Enter changelog notes when prompted — **only functional, user-visible changes**. Internal refactors, file reorganisations and tooling changes are never mentioned to users.
5. **Commit and push the release** — no confirmation needed, this is standing approval:
   `git add -A` (skip local state/JSON data), `git commit -m "vN: <resumo>"`, `git push origin main`.
   Commit **before** running the release when possible, so the `vN` tag created by `make_release.py` points at the released code; if the code was committed afterwards, move the tag (`git tag -f vN` + `git push -f origin vN`).
6. Restart DEV server via `run-dev.bat` (Port 8766).
7. Verify release: `Invoke-RestMethod http://localhost:8766/api/tasks` -> verify `app_version` and `mode=dev`.
8. Inform user to refresh browser (F5).

> **Git:** the repository is `https://github.com/Cmprfda/my-organizer` (private, remote `origin`, branch `main`). Committing and pushing as part of a release is pre-authorised; `gh` lives at `"$env:ProgramFiles\GitHub CLI\gh.exe"` (not on PATH).

---