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