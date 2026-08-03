## 🛠️ Excel Implementation Details

1. **Excel Lock Handling & Cache:**
   - Use `_RAW_CACHE` to serve tasks instantly when Excel is locked by a teammate.
   - Force a cache warm-up on server start (`warm_cache`).
   - Trigger a full refresh cycle (`/api/tasks?cycle=1`) when saving changes while Excel is open: close book (saving), read, and reopen.
2. **Fallback & Overrides:**
   - If COM write fails or times out, save the change as a local override in `status_overrides.json` and mark the task with a `✎` badge.
   - Allow user to push pending overrides via "Push (N)" or discard via "Descartar locais".

---