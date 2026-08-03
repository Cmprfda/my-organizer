# My Organizer — Excel sheet viewer

Local web app that opens an Excel workbook from your OneDrive/SharePoint and
shows it in a useful way. It comes ready for `BSP-G2_Daily_Tracker.xlsx` (tab
`PRJ_CFG1_reworks_julho`), where it keeps the **compact view** with **your**
tasks: TCs/functions with impact, whether you're author or reviewer, the
status and what's left to do. Any other workbook is shown as a plain table.

## Installation (one time)

Download the latest zip from one of these:

- **[GitHub Releases](https://github.com/Cmprfda/my-organizer/releases/latest)**
  — `bsp-tracker-vN.zip` is attached to the latest release;
- the shared folder **`BSP-G2-Tracker-App`** (`releases\bsp-tracker-vN.zip`).

Extract it to a folder of your own (e.g. on the Desktop) and **double-click
`setup.bat`**. It handles everything:
- installs Python 3 if missing (via winget, no admin rights needed)
- installs the `openpyxl` dependency
- creates the **"My Organizer"** shortcut on the Desktop
- starts the app at the end

## Daily use

1. **Double-click the "My Organizer" shortcut** — the app opens in its own
   window (no console). Close that window to stop it. If you need to see the
   server addresses or debug an issue, run `run-with-server.bat` instead of
   the shortcut — same app, but with the server window visible.

2. **Get the Excel file**: use the **"Get from SharePoint"** button in the app
   (downloads via your browser, with your session) or download it manually:
   [BSP-G2_Daily_Tracker.xlsx](https://criticalsoftwaresa.sharepoint.com/sites/WRSHALLOWFORD/_layouts/15/download.aspx?UniqueId=107B4AEF-D629-4094-92D1-3F681C4B12EF).
   Even better: in Teams, in the channel folder where the tracker lives, use
   **"Add shortcut to OneDrive"** — the app then picks up updates
   automatically, with no downloads needed.

3. **Type your name** in the field at the top (remembered by the browser).

In the top bar you can also **pick the Excel file** (among the ones the app
finds; the most recent one is used by default) and **the tab** to show — your
choices are remembered. Tabs with a different structure are shown as a plain
table.

## Features

- **OneDrive workbook** (Settings → *Change workbook*): browse folders in
  OneDrive and the SharePoint sites you follow, search by name, and open any
  `.xlsx` file. Recently used workbooks stay within reach.
- **`?` button** (in the top bar, right of the connection indicator): opens
  the **"How to use"** guide with all app usage instructions.
- **Badge in the top-right corner**: shows where the data comes from —
  green (OneDrive connected), red (ready to connect / no server) or gray
  (local file). Click it to open Settings.
- **Compact view** (default): TCs/Functions · Role (Author/Reviewer of TC/TP) · Status · What to do
- Filter buttons (can be combined):
  - **Author / Reviewer** — filter by your role
  - **On my side** — the ball is on your side (work to do or reviews waiting on you)
  - **On the other side** — waiting on others (in review, or the author reworking it)
  - **Done** — completed
- **Status editing** — click a status badge to change it. The app **saves the
  change to the Excel file itself** via Excel/COM (preserves charts and
  validations; the change syncs up to SharePoint via OneDrive like a normal
  edit). Before writing it confirms the sheet row hasn't changed. If writing
  to Excel fails, the change is saved locally (**✎** and a blue ring on the
  badge) and the sheet catches up next time that cell is refreshed.
- **Execution / notes** — per task: quick tag (Running on Jenkins, Saving
  logs, …), **execution checklist** (ran on dev branch, ran on component
  branch, component branch updated, review branch updated — green chips when
  done) and free text (number of runs, links). Saved on the server: the same
  state across all your devices.
- **Personal TODO** with two modes: **List** and **Kanban** (To do, In
  progress, Pending, Done), with drag&drop between columns and support for
  dragging items from Tasks/CCRs into the TODO.
- On TODO cards with detail, the note also appears as a **chip** (📝), in the
  visual style of the integrated board.
- Filter button counts recalculate based on active filters; buttons with no
  results are dimmed
- Free-text search box
- **Full view** — the original table with all columns and detailed statuses
- **See all** — the whole team's tasks
- Auto-refresh every 2 minutes

## Excel open on this PC?

No problem. If you have the file open in local Excel (which locks it), the
app keeps showing the data from the last read, with an amber warning. The
**"Refresh"** button (or the **"Close Excel and refresh"** button that
appears in the warning) does the full cycle: closes Excel **saving the
changes**, reads fresh data, and reopens Excel — and it works from any
device, including your phone.

## Reading Excel directly from OneDrive (no download)

By default the app reads the `.xlsx` file that's on disk (Downloads or the
synced OneDrive folder). Alternatively it can read the workbook **where it
lives**, through the Excel API (Microsoft Graph): nothing gets downloaded, it
doesn't depend on OneDrive syncing, and it works even if the file is open by
other people.

How to enable it (one time, only on the PC where the app runs):

1. In **Settings** (⚙) click **Connect**: the Microsoft sign-in screen opens
   in the browser, you pick the account and that's it. No need to install
   anything, copy config files or register applications in Azure — the app
   uses the public Azure CLI client, which organizations already authorize.
2. In **Settings → Change workbook** pick the workbook to open. On a fresh
   install the app already points to the `WRSHALLOWFORD` site and to
   `BSP-G2_Daily_Tracker.xlsx` (`graph_config.json` is created on first
   startup from `graph_config.example.json`).
3. In **Settings → Data** pick the source: *Automatic* (OneDrive first, local
   file as fallback), *OneDrive (web)* or *Local file*.

> The app **cannot** reuse the Edge/Chrome session: the browser stores
> cookies encrypted with the Windows account (and for SharePoint, not for
> Graph); grabbing them would be the same technique used by credential-
> stealing malware. That's why sign-in happens on Microsoft's own page.

**If your organization blocks this access**, there are two alternatives in
`graph_config.json`:

- `"use_azure_cli": true` with the Azure CLI installed and `az login` done —
  the app uses that token (useful if you already have the CLI on your PC).
- Your own Azure registration (Azure Portal → **Microsoft Entra ID** →
  **App registrations**, with *Allow public client flows: Yes* and the
  delegated permissions `Files.ReadWrite.All`, `Sites.ReadWrite.All`,
  `offline_access`), putting the `client_id` in `graph_config.json`. With
  `"login_mode": "device"` sign-in becomes a code instead of opening the
  browser.

Credentials stay only on this PC (`graph_token.json`, never included in
published releases or logs) and the connection can only be started from this
computer — anyone accessing over the local network uses the already-
connected session. Until you connect an account, the app still works fine
with the local file.

## Logs

All operations (requests, status changes, downloads, errors) are logged with
date/time and device:
- in the server window (the "black window")
- in the `tracker.log` file, next to the app
- at <http://localhost:8765/logs> in the browser (also via the network IP)

**Bugs report themselves:** if an error happens (in the browser or the
server), the app automatically creates a `BUG_...` entry in the
`BSP-G2-Tracker-App\feedback` folder, with the message, where it broke, and
the server logs — nothing needs to be written by hand. Repeated errors don't
create new entries: they just increment a counter on the existing one.

## Access from phone / other devices

The server listens on the whole local network. The address for mobile
devices (e.g. `http://192.168.x.x:8765`) appears **in the server window at
startup** and **in the app's top bar** ("📱 Open on phone…"). Everything
works from any device: filters, status editing and the Excel refresh cycle.
If it doesn't connect from another device, the Windows/company firewall is
blocking inbound connections — talk to IT. To restrict the server to the PC
itself only: `python app.py --host 127.0.0.1`.

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

## Commands (command line)

**The server window (the "black window") is busy serving the app and doesn't
accept commands.** To give commands, open **another** window in the app's
folder (Shift + right-click the folder → *"Open PowerShell window here"*) and
use `bsp.bat`, which sits next to the app:

```
bsp help        lists all commands (bsp help <command> = detail)
bsp update      installs the new version from the shared folder right away
bsp status      version, server, files, OneDrive and pending changes to send
bsp push        sends pending status changes (✎) to Excel
bsp logs -n 50  last lines of tracker.log
bsp open        opens the tracker in the browser
bsp stop        stops the running tracker
bsp login       connects/authenticates the Microsoft account (OneDrive)
bsp logout      ends that session
```

Each command does its job and exits — it doesn't start the server. `bsp
update --check` only tells you if there's a new version, without installing.
If the tracker in this folder is running, `bsp push` is executed by it
(so two instances don't touch the same data at once); if not, it runs on its
own. Without the `.bat`, it's the same with `python app.py <command>`.

## Tips

- For always-fresh data with no manual downloads: in Teams, open the channel
  files and click **Sync** — the app detects the synced folder.
- For a different tab or port: `python app.py --port 9000` and the
  `?sheet=TabName` parameter in the API URL.

## Integration Notes

- TODO no longer has its own note editor.
- Notes should be managed in the source views:
  - **Tasks (Excel)** use the existing "Execução / notas" editor
  - **CCRs** use the existing CCR notes column/editor
- Tablet/mobile browsers now use a **pointer-based drag fallback** so dragging
  works even when native HTML5 drag-and-drop is unreliable.
- TODO Kanban now includes an **In progress timer**:
  - moving a card into **Em curso** starts the clock automatically
  - moving it out pauses and accumulates elapsed time
  - clicking the timer on an **Em curso** card toggles start/pause
  - a **restart (↺)** control resets elapsed time (and restarts immediately if still in Em curso)
  - elapsed time remains visible after pause/move
- TODO status/column changes are **manual only**: only explicit user actions
  (drag/drop, checkbox, timer controls) can move or update TODO items.
