## Versions and Auto-Update

The app has a version ID (visible in the bar, e.g., **v2**). Releases live
in the shared folder **`BSP-G2-Tracker-App`** (OneDrive): `releases\bsp-tracker-vN.zip`
for each version + `latest.json` pointing to the most recent.

**On startup, the app checks that folder and, if there's a newer version,
updates itself and restarts automatically.** To enable this, do this once:
[open the shared folder](https://criticalsoftwaresa-my.sharepoint.com/:f:/g/personal/cm-andrade_criticalsoftware_com/IgCcVCwvzrAHSpBAGR-J3JRqATJDp1V62WRx7ddKad0tCzM?e=I4g1ot)
and choose **"Add shortcut to OneDrive"** — the app will find it
automatically. Without the shortcut, the app continues to work, it just won't
update (and will tell you that, with this link, at startup).

You can also update without waiting for startup, with the command `bsp update`
(see below).