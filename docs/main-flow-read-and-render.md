## Main flow (read and render)

Excel/OneDrive -> Backend `cswaios/excel.py` or `cswaios/graph.py` -> Raw sheet cache (_RAW_CACHE) + last-good-read cache (_LAST_GOOD) in `cswaios/tasks.py` -> API /api/tasks (`cswaios/server.py`) -> Frontend `static/js/tasks.js` -> Compact/full table, CCRs, TODO, feedback

In the `auto` source, when the workbook chosen on OneDrive also exists as a
synced copy on disk (`tasks.local_twin`), that copy is the one read
(`synced_copy=true` in the payload): whatever gets written to Excel shows up
immediately, while the cloud copy only receives the changes once OneDrive
finishes syncing (can take minutes).

While reading the local copy, `tasks.sync_gap` compares the content of the
two copies (`rows_digest`, which ignores empty cells and trailing empty rows
because local Excel and the cloud don't count the sheet the same way) and, if
they differ, appends the `notice_syncing` warning to the payload's `notice`
(shown with an ℹ under the file name). Dates aren't used to decide this:
OneDrive updates the item's `lastModifiedDateTime` **before** the new content
is actually available. The comparison only actually reads the cloud when one
of the copies changes (the verdict is cached in `_SYNC_CHECK`, cleared by
`forget_cache`); if the Graph call fails, the warning simply doesn't appear.