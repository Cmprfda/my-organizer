## Access from Mobile / Other Devices

The server listens on the entire local network. The address for mobile devices
(e.g., `http://192.168.x.x:8765`) appears **in the server window at startup**
and **in the app bar** ("📱 Open on mobile…"). Everything works from
any device: filters, status editing, and the Excel update cycle. If you can't connect from another device, it's the Windows/company firewall
blocking incoming connections — contact IT. To restrict the server
to just your own PC: `python app.py --host 127.0.0.1`.