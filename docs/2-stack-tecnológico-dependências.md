## 2) Tech Stack & Dependencies

**Backend**
- Python 3 (HTTP server with [app.py](app.py)).
- Standard libraries: http.server, threading, subprocess, json, zipfile, tempfile, glob, os, socket, datetime, etc.
- openpyxl (workbook reading and data parsing).
- Windows Excel COM integration via PowerShell (write to real Excel, never via openpyxl).

**Frontend**
- Single UI in [index.html](index.html) (HTML + CSS + vanilla JavaScript).
- Drag and drop + pointer/touch fallback for mobile/tablet browsers.
- PT/EN i18n on the client (internal dictionary).

**External integrations**
- OneDrive/SharePoint (tracker file + releases folder).
- Local desktop Excel (COM automation for robust writes).
- Local LAN network (access by IP and localhost).

**Release automation**
- Scripts: [make_release.py](make_release.py), [make-release.bat](make-release.bat), [run-dev.bat](run-dev.bat), [run-with-server.bat](run-with-server.bat), [setup.bat](setup.bat).

---