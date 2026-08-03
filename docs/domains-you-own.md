## Domains you own

- **Jira** (`cswaios/jira.py`): REST calls via a Personal Access Token in `jira_config.json` (localhost-only config endpoint `/api/jira/config`). Used only by the TODO list (`jiraIssues` field on todo items), never by Excel Tasks/CCRs.
- **Excel** (`cswaios/excel.py`): openpyxl for **reads only**. Writes go through Excel/COM (`PowerShell GetActiveObject` or an invisible Excel instance) — never `openpyxl.save()` on the production file, it corrupts validations and charts.
- **Microsoft Graph / OneDrive / SharePoint** (`cswaios/graph.py`): auth (PKCE loopback), `graph_browse`/`graph_pick`, recents in `workbooks.json`, and feedback delivery uploads to `config.FEEDBACK_SHARE_URL`.
- **Git**: status/diff/log freely; commit and push to `origin main` only when explicitly instructed or when executing the project's pre-authorized Release Procedure (see below).