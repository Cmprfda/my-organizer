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

---