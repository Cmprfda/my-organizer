## Access from phone / other devices

The server listens on the whole local network. The address for mobile
devices (e.g. `http://192.168.x.x:8765`) appears **in the server window at
startup** and **in the app's top bar** ("📱 Open on phone…"). Everything
works from any device: filters, status editing and the Excel refresh cycle.

**Opening Excel workbooks from the phone** works too: **+** → **Excel from
OneDrive** browses the same folders and opens the workbook in its own tab. The
reading is done by the PC where the app runs, using the OneDrive session
already connected there — the phone never signs in and never sees which
account it is. Two things stay on the PC: **Excel from a local file** (the
Windows file dialog opens on the PC, so the option is hidden elsewhere) and
connecting/disconnecting the Microsoft account itself. On another device those
buttons simply don't appear; Settings says where to do it instead.

Note this means **anyone on the local network who opens the app can browse the
OneDrive/SharePoint folders the connected account can reach**, and open any
workbook there. That is the point of the feature, but it is worth knowing:
the app is only as private as the network it listens on.

If it doesn't connect from another device, the Windows/company firewall is
blocking inbound connections — talk to IT. To restrict the server to the PC
itself only: `python app.py --host 127.0.0.1`.