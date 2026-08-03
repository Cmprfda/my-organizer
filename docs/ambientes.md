## Environments

- **DEV (development workspace):**
  - Folder: [bsp-tracker](.)
  - Startup: [run-dev.bat](run-dev.bat)
  - Mode: --dev flag
  - Port: 8766
  - No auto-update active in the DEV flow.

- **Stable (user instance):**
  - Folder: bsp-tracker-app (outside the current workspace)
  - Startup: [run-with-server.bat](run-with-server.bat)
  - Port: 8765
  - Auto-update via latest.json + release zips.

- **Isolated test:**
  - Startup: python app.py --dev --port 8767 --no-browser --no-update
  - Used for smoke tests without interfering with 8766.