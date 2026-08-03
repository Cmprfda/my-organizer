## 5) Critical Constraints & Invariants

1. **Never write to Excel via openpyxl.**
   - Writes are only allowed via COM (desktop Excel).

2. **Never test/write to the real Excel file in destructive tests.**
   - Use a temporary test copy where applicable.

3. **TODO is manual-only.**
   - TODO status/column only changes via an explicit user action (drag/drop, checkbox, timer controls).

4. **Separate stable and DEV ports.**
   - 8765 stable, 8766 DEV, 8767+ disposable test instances.

5. **Never touch Windows Firewall/security config.**

6. **Never corrupt release metadata encoding.**
   - changelog/latest/RELEASES in UTF-8 without BOM (avoid breaking auto-update/json parsing).

7. **Preserve frontend/backend identifiers and contracts.**
   - IDs/classes used by JS and API payloads are part of the contract.

8. **Stable user data must never be touched in tests.**
   - Stable environment kept separate from the DEV workspace.

9. **Read resilience is mandatory.**
   - On Excel lock, serve a valid cache instead of breaking the experience.

10. **Thread safety/log safety.**
   - Log writes synchronized via lock.

---