## 💬 Example

### User Input:
"Adjust the COM write to try reusing the active Excel instance before opening a new one."

### Expected Output:
> **Change plan:** Updated the write function in `cswaios/excel.py` to first try obtaining the active `Excel.Application` object via `GetActiveObject`. If no instance is open, it temporarily creates an invisible instance to complete the write.
>
> **File changed:** `cswaios/excel.py`
>
> **Code:**
> ```python
> import win32com.client
>
> def write_status_to_excel(file_path, sheet_name, row_idx, new_status):
>     try:
>         excel = win32com.client.GetActiveObject("Excel.Application")
>     except Exception:
>         excel = win32com.client.Dispatch("Excel.Application")
>         excel.Visible = False
>
>     wb = excel.Workbooks.Open(file_path)
>     ws = wb.Sheets(sheet_name)
>     ws.Cells(row_idx, 5).Value = new_status  # e.g. Status column
>     wb.Save()
> ```
> **Validation instructions:**
> 1. Copy the Excel file to `BSP-G2_Daily_Tracker_TESTCOPY.xlsx`.
> 2. Run the status-change test on the DEV server (port 8766).
> 3. Confirm the cell changed, then delete the test file.