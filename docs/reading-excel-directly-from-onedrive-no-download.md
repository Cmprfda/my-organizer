## Reading Excel directly from OneDrive (no download)

By default the app reads the `.xlsx` file that's on disk (Downloads or the
synced OneDrive folder). Alternatively it can read the workbook **where it
lives**, through the Excel API (Microsoft Graph): nothing gets downloaded, it
doesn't depend on OneDrive syncing, and it works even if the file is open by
other people.

How to enable it (one time, only on the PC where the app runs):

1. In **Settings** (⚙) click **Connect**: the Microsoft sign-in screen opens
   in the browser, you pick the account and that's it. No need to install
   anything, copy config files or register applications in Azure — the app
   uses the public Azure CLI client, which organizations already authorize.
2. In **Settings → Change workbook** pick the workbook to open. On a fresh
   install the app already points to the `WRSHALLOWFORD` site and to
   `BSP-G2_Daily_Tracker.xlsx` (`graph_config.json` is created on first
   startup from `graph_config.example.json`).
3. In **Settings → Data** pick the source: *Automatic* (OneDrive first, local
   file as fallback), *OneDrive (web)* or *Local file*.

> The app **cannot** reuse the Edge/Chrome session: the browser stores
> cookies encrypted with the Windows account (and for SharePoint, not for
> Graph); grabbing them would be the same technique used by credential-
> stealing malware. That's why sign-in happens on Microsoft's own page.

**If your organization blocks this access**, there are two alternatives in
`graph_config.json`:

- `"use_azure_cli": true` with the Azure CLI installed and `az login` done —
  the app uses that token (useful if you already have the CLI on your PC).
- Your own Azure registration (Azure Portal → **Microsoft Entra ID** →
  **App registrations**, with *Allow public client flows: Yes* and the
  delegated permissions `Files.ReadWrite.All`, `Sites.ReadWrite.All`,
  `offline_access`), putting the `client_id` in `graph_config.json`. With
  `"login_mode": "device"` sign-in becomes a code instead of opening the
  browser.

Credentials stay only on this PC (`graph_token.json`, never included in
published releases or logs) and the connection can only be started from this
computer — anyone accessing over the local network uses the already-
connected session. Until you connect an account, the app still works fine
with the local file.