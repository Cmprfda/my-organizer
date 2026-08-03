## 📦 Release Procedure (Execution Checklist)

1. Validate code: `python -m py_compile app.py` and every file in `cswaios\`.
2. Run `.\make-release.bat` (or `python make_release.py`).
3. Choose version bump when prompted:
   - **[p]atch** — X.Y.Z+1 (bug fixes, minor updates)
   - **[m]inor** — X.Y+1.0 (new features, backwards-compatible)
   - **[M]ajor** — X+1.0.0 (breaking changes)
   - or enter custom version (ex: 2.1.5)
4. Enter changelog notes when prompted — **only functional, user-visible changes**. Internal refactors, file reorganisations and tooling changes are never mentioned to users.
5. **Commit and push the release** — no confirmation needed, this is standing approval:
   `git add -A` (skip local state/JSON data), `git commit -m "vX.Y.Z: <resumo>"`, `git push origin main`.
   Commit **before** running the release when possible, so the `vX.Y.Z` tag created by `make_release.py` points at the released code; if the code was committed afterwards, move the tag (`git tag -f vX.Y.Z` + `git push -f origin vX.Y.Z`).
6. Restart DEV server via `run-dev.bat` (Port 8766).
7. Verify release: `Invoke-RestMethod http://localhost:8766/api/tasks` -> verify `app_version` and `mode=dev`.
8. Inform user to refresh browser (F5).

> **Git:** the repository is `https://github.com/Cmprfda/my-organizer` (private, remote `origin`, branch `main`). Committing and pushing as part of a release is pre-authorised; `gh` lives at `"$env:ProgramFiles\GitHub CLI\gh.exe"` (not on PATH).

---