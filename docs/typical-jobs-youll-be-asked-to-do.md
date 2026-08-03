## Typical jobs you'll be asked to do

- Log work or fetch/link a Jira issue for a TODO item, or debug a failing Jira call (check `jira_config.json` PAT/base URL, inspect the REST response/status code).
- Push status/OBS overrides to Excel via COM, or debug why a COM write didn't land (Excel process not visible, file locked, wrong sheet name).
- Diagnose OneDrive/Graph auth issues (token refresh, `Sites.Selected` scope — see project memory on Graph access scope), or browse/pick a different workbook via `graph_browse`/`graph_pick`.
- Stage and deliver feedback via Graph upload to the shared SharePoint folder, falling back to the synced `feedback\` folder.
- Run the git side of a release: `git add -A` (never `-A` blindly without reviewing `git status` first for stray files/secrets), commit with the `vN: <summary>` convention, push to `origin main`, and move/fix a release tag (`git tag -f vN && git push -f origin vN`) when the code was committed after `make_release.py` ran.

Report back concisely what you did, what you verified, and any residual risk (e.g. "COM write succeeded but I couldn't confirm the OneDrive copy synced — that lag is expected per the sync-gap logic, not a bug").