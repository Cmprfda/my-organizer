## 📍 Environment & Folder Locations

| Environment | Directory Path | Purpose & Rules |
| :--- | :--- | :--- |
| **DEV / Project** | `C:\Users\cm-andrade\Desktop\my_projects\bsp-tracker` | **Work area.** Runs on port **8766** via `run-dev.bat`. Has red DEV bar. JSONs here are disposable test data. `run-dev.bat` & `CLAUDE.md` stay local. |
| **User Stable** | `C:\Users\cm-andrade\Desktop\my_projects\bsp-tracker-app` | **Real user instance.** Runs on port **8765**. Contains real user data (`notes.json`, `ccrs.json`, etc.). **NEVER edit code or test here.** |
| **Releases Share** | `C:\Users\cm-andrade\OneDrive - CRITICAL SOFTWARE, S.A\BSP-G2-Tracker-App` | Contains `releases\bsp-tracker-vN.zip`, `latest.json`, `changelog.json` (Source of Truth), `RELEASES.md`, and `feedback\`. |
| **Production Excel** | `C:\Users\cm-andrade\OneDrive - CRITICAL SOFTWARE, S.A\WRSHALLOWFORD - BSP_G2 (Moreira)\BSP-G2_Daily_Tracker.xlsx` | Default workbook. Main sheet: `PRJ_CFG1_reworks_julho`. Status list sheet: `Admin`. Other workbooks can be opened from the OneDrive picker. |
| **Zip Mirror** | `..\bsp-tracker.zip` | Mirror copy of the latest release zip. |

---