## Logs

All operations (requests, status changes, downloads, errors) are logged
with date/time and device:
- in the server window (the "black window")
- in the `tracker.log` file, next to the app
- at <http://localhost:8765/logs> in the browser (also by network IP)

**Bugs are reported automatically:** if an error occurs (in the browser or in the
server), the app automatically creates a `BUG_...` entry in the
`BSP-G2-Tracker-App\feedback` folder, with the message, where it crashed and the
server logs — you don't need to write anything. Repeated errors don't create
new entries: they just increment a counter in the existing entry.