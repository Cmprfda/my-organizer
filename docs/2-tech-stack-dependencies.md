## 2) Tech Stack & Dependencies

**Backend**
- Python 3 (entry point [app.py](app.py) + package [cswaios/](cswaios)).
- Standard libraries: http.server, threading, subprocess, json, zipfile, tempfile, glob, os, socket, datetime, etc.
- openpyxl (workbook reading and data parsing).
- Windows Excel COM integration via PowerShell (writes to the real Excel file, never via openpyxl).

**Frontend**
- Markup in [index.html](index.html); styles in `static/css/*.css` and logic in `static/js/*.js` (HTML + CSS + vanilla JavaScript).
- Drag and drop + pointer/touch fallback for mobile/tablet browsers.
- PT/EN i18n on the client (internal dictionary in `static/js/i18n.js`).

**External integrations**
- OneDrive/SharePoint (tracker file + releases folder).
- Local desktop Excel (COM automation for robust writes).
- Local LAN network (access by IP and localhost).

**Release automation**
- Scripts: [make_release.py](make_release.py), [make-release.bat](make-release.bat), [run-dev.bat](run-dev.bat), [run-with-server.bat](run-with-server.bat), [setup.bat](setup.bat).
- Every release ends with **commit + push** to `origin/main` (private repo `Cmprfda/my-organizer`); step 9 of `make_release.py` also publishes the zip to GitHub Releases with the tag `vN`.

---