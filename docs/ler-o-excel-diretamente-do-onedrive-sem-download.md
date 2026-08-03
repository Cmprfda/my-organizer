## Reading Excel Directly from OneDrive (Without Download)

By default, the app reads the `.xlsx` file that's on disk (Downloads or
OneDrive synced folder). Alternatively, it can read the workbook **where it
actually is**, via the Excel API (Microsoft Graph): it doesn't download
anything, doesn't depend on OneDrive syncing, and works with the file open by
other people.

How to enable (once, only on the PC where the app runs):

1. Copy `graph_config.example.json` to `graph_config.json`. The example
   already points to the `WRSHALLOWFORD` site and the `BSP-G2_Daily_Tracker.xlsx`
   file — the app looks for the workbook in the site's library. (If you prefer,
   delete the `site_url`/`file_name` and use `file_url` instead: Share → Copy
   link.)
2. In **Settings** (⚙) click on **Sign in**: Microsoft's login screen opens in
   the browser, you choose your account and that's it. No need to install
   anything or register apps in Azure — the app uses the public Azure CLI
   client, which organizations already have authorized.
3. In **Settings → Data Source** choose the source: *Automatic* (OneDrive first,
   local file as fallback), *OneDrive (web)* or *Local file*.

> The app **cannot** reuse the Edge/Chrome session: the browser stores cookies
> encrypted with your Windows account (and for SharePoint, not for Graph); to
> retrieve them would be the same technique used by credential-stealing malware.
> That's why sign-in happens on Microsoft's own page.

**If your organization blocks this access**, there are two alternatives in
`graph_config.json`:

- `"use_azure_cli": true` with Azure CLI installed and `az login` already done
  — the app uses that token (useful if you already have the CLI on your PC).
- Your own registration in Azure (Azure Portal → **Microsoft Entra ID** →
  **App registrations**, with *Allow public client flows: Yes* and delegated
  permissions `Files.ReadWrite.All`, `Sites.ReadWrite.All`, `offline_access`),
  putting the `client_id` in `graph_config.json`. With `"login_mode": "device"`
  login becomes code-based instead of opening a browser.

Credentials stay only on this PC (`graph_token.json`, never included in
published versions or logs) and the connection can only be started from this
computer — anyone accessing via local network uses the already-connected
session. Without `graph_config.json` none of this appears and the app works
exactly as before.