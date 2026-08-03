## Access from phone / other devices

The server listens on the whole local network. The address for mobile
devices (e.g. `http://192.168.x.x:8765`) appears **in the server window at
startup** and **in the app's top bar** ("📱 Open on phone…"). Everything
works from any device: filters, status editing and the Excel refresh cycle.
If it doesn't connect from another device, the Windows/company firewall is
blocking inbound connections — talk to IT. To restrict the server to the PC
itself only: `python app.py --host 127.0.0.1`.