## Feedback/bugs flow

Frontend (manual feedback or JS error) + backend (exceptions) ->
`feedback.stage_feedback_folder()` creates the folder in `feedback_pending\`
-> `feedback.deliver()` tries (1) upload via Microsoft Graph to the shared
folder `config.FEEDBACK_SHARE_URL` (a SharePoint link with write access for
anyone at Critical Software; overridden via the `BSP_FEEDBACK_SHARE`
variable), (2) the locally synced `feedback\` folder, (3) stays pending and
is retried later by `feedback.flush_pending()`. Bug deduplication by
signature in [bug_reports.json](bug_reports.json) + appended
[tracker.log](tracker.log); repeats write `repeticao_NN.txt` in the same
folder.

When nothing delivers — the case for whoever runs the app from outside
Critical Software, with no access to the shared folder and no LAN relay in
reach — the response of `/api/feedback` carries `issue_url`, built by
`feedback.github_issue_url()`, and the form shows a button that opens GitHub's
new-issue page with the title and body already filled in. The repository is
public, so any GitHub account can submit it without being a collaborator; the
person confirms the issue themselves and drags the screenshots in there, since
the issue API accepts no attachments. The reporter's IP is stripped from the
body (the issue is public) and the images stay behind in
`feedback_pending\<folder>`, listed in the body by name.

Both channels are read when feedback is worked on, and each is closed in its own
way: a folder moves to `feedback\Fixed\`, an issue gets a comment naming the
version that fixed it and is then closed. They do not deduplicate against each
other — `bug_reports.json` and `delivered_folder_exists()` only see the folders.

---