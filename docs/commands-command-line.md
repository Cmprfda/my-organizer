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