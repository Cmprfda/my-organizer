## Commands (Command Line)

**The server window (the "black window") is busy serving the app and doesn't
accept commands.** To run commands, open **another** window in the app folder
(Shift + right-click on the folder → *"Open PowerShell window here"*) and use
the `bsp.bat` file next to the app:

```
bsp help        list all commands (bsp help <command> = detail)
bsp update      install the new version now from the shared folder
bsp status      version, server, files, OneDrive and pending changes
bsp push        send pending status changes (✎) to Excel
bsp logs -n 50  last lines of tracker.log
bsp open        open the tracker in the browser
bsp stop        stop the running tracker
bsp login       sign in/authenticate Microsoft account (OneDrive)
bsp logout      end that session
```

Each command does its action and exits — it doesn't start the server. `bsp update
--check` just tells if there's a new version, without installing. If the tracker
from this folder is running, the `bsp push` command is executed by it (to avoid
two instances touching the same data); if it's not running, it runs on its own.
Without the `.bat`, it's the same with `python app.py <command>`.