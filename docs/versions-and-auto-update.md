## Versions and auto-update

The app has a version ID (visible in the bar, e.g. **v2**). Releases live in
the shared folder **`BSP-G2-Tracker-App`** (OneDrive): `releases\bsp-tracker-vN.zip`
for each version + `latest.json` pointing to the latest one.

**On startup, the app checks that folder and, if there's a newer version, it
updates itself and restarts.** For this to work, one time only:
[open the shared folder](https://criticalsoftwaresa-my.sharepoint.com/:f:/g/personal/cm-andrade_criticalsoftware_com/IgCcVCwvzrAHSpBAGR-J3JRqATJDp1V62WRx7ddKad0tCzM?e=I4g1ot)
and pick **"Add shortcut to OneDrive"** — the app finds it automatically.
Without the shortcut, the app keeps working, it just won't auto-update (and
it tells you so, with this link, on startup).

You can also update without waiting for startup, with the `bsp update`
command (see below).

Each version is **also** published on
[GitHub Releases](https://github.com/Cmprfda/my-organizer/releases), as a
download alternative for anyone without access to the shared folder.
Auto-update still uses the shared folder.