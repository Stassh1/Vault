# Send From Alias — custom Outlook add-in

A sideloadable ("upload as custom app") Outlook add-in that asks which of your
email aliases you want to send the current message from, and sends it from that
address.

## How it works (and why)

The Office JavaScript API **cannot change a message's From address** —
`Office.context.mailbox.item.from` is read-only in compose mode. So this add-in
works on the server copy of your draft through Microsoft Graph:

1. You compose a message and open the **Choose alias** task pane.
2. The pane lists your aliases (auto-discovered from your Microsoft 365 account
   via `proxyAddresses`, plus any you add manually).
3. **Send now from selected alias** saves the draft, sets `from` on it via
   Graph, and sends it via Graph. This is the reliable path — use Outlook's
   built-in Send button only when you want to send from your primary address.
4. **Set From on draft (no send)** only patches the saved draft. Some Outlook
   clients overwrite the From field again when you press their Send button, so
   prefer the button above.

Files in this folder:

| File | Purpose |
| --- | --- |
| `manifest.xml` | The file you upload to Outlook ("Add from file") |
| `taskpane.html` / `taskpane.js` | The task pane UI and logic |
| `config.js` | Where you put your Entra app's client ID |
| `assets/` | Add-in icons |

## Setup

### 1. Host the files over HTTPS

This folder lives in `public/`, so a deployed Vault instance serves it
automatically at `https://<your-domain>/outlook-addin/taskpane.html`. Any
static HTTPS host works too — just copy this folder there.

The manifest currently points at `vault.stassh.com`. If your deployment uses a
different domain, replace it:

```bash
sed -i 's/vault\.stassh\.com/your-domain.com/g' manifest.xml
```

### 2. Register an app in Microsoft Entra (for Graph access)

1. Go to [portal.azure.com](https://portal.azure.com) → **App registrations**
   → **New registration**.
2. Name: `Send From Alias add-in`. Supported account types: *Accounts in this
   organizational directory only* is fine for a single tenant.
3. Under **Authentication**, add a **Single-page application (SPA)** platform
   with these two redirect URIs:
   - `brk-multihub://<your-domain>` (e.g. `brk-multihub://vault.stassh.com`) —
     enables nested app authentication (silent SSO inside Outlook)
   - `https://<your-domain>/outlook-addin/taskpane.html` — fallback popup flow
     for older Outlook hosts
4. Under **API permissions**, add these **delegated** Microsoft Graph
   permissions: `User.Read`, `Mail.ReadWrite`, `Mail.Send`. These are
   user-consentable in most tenants; grant admin consent if your tenant
   requires it.
5. Copy the **Application (client) ID** into `config.js`
   (`CLIENT_ID: "..."`) and redeploy.

### 3. Allow sending from aliases in Exchange Online (one-time, admin)

By default Exchange rewrites the From address back to your primary SMTP
address. An admin must run (Exchange Online PowerShell):

```powershell
Set-OrganizationConfig -SendFromAliasEnabled $true
```

The aliases themselves are managed in the Microsoft 365 admin center under
**Users → Active users → Manage username and email**.

### 4. Upload the add-in to Outlook

- **Self-service:** open [https://aka.ms/olksideload](https://aka.ms/olksideload)
  (or Outlook on the web → Settings → **Manage add-ins**) → **My add-ins** →
  **Add a custom add-in** → **Add from file…** → pick `manifest.xml`.
- **Whole organization:** Microsoft 365 admin center → **Settings →
  Integrated apps → Upload custom apps** → upload `manifest.xml`.

The add-in appears in the ribbon/overflow menu when composing a message, on
Outlook on the web, new Outlook for Windows, classic Outlook for Windows, and
Outlook for Mac.

## Usage

1. Compose a message as usual (recipients, subject, body, attachments).
2. Open **Choose alias** from the compose ribbon.
3. Pick the alias — your last-used alias is preselected.
4. Click **Send now from selected alias**. The pane sends the message from
   that address and closes the draft.

Manually added aliases (e.g. shared mailboxes you have *Send As* rights for)
are stored in your mailbox's roaming settings, so they follow you across
devices.

## Troubleshooting

- **"SendAsDenied"** — the alias isn't on your mailbox, or
  `SendFromAliasEnabled` hasn't been enabled (step 3).
- **Recipients still see your primary address** — `SendFromAliasEnabled` is off;
  Exchange silently rewrites the address.
- **Sign-in popup blocked / AADSTS errors** — check both SPA redirect URIs in
  the app registration match your deployed domain exactly.
- **"Draft hasn't synced"** — slow mailbox sync; wait a second and click again.
