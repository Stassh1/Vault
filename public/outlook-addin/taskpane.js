/* global Office, msal */

// Send From Alias — Outlook compose task pane.
//
// Office.js cannot change a message's From address (item.from is get-only),
// so this add-in works on the server copy of the draft via Microsoft Graph:
//   1. save the draft (item.saveAsync)
//   2. PATCH /me/messages/{id} with the chosen alias as "from"
//   3. optionally POST /me/messages/{id}/send
// Auth uses MSAL with nested app authentication (NAA) when the host
// supports it, falling back to a standard MSAL popup flow otherwise.

const CONFIG = window.ALIAS_ADDIN_CONFIG || {};
const SETTING_EXTRA_ALIASES = "aliasAddin.extraAliases";
const SETTING_LAST_ALIAS = "aliasAddin.lastAlias";

let msalInstance = null;
let aliases = []; // { address, source: "account" | "manual" }
let primaryAddress = null;

Office.onReady(() => {
  document.getElementById("btn-send").onclick = () => sendFromAlias(true);
  document.getElementById("btn-apply").onclick = () => sendFromAlias(false);
  document.getElementById("btn-add").onclick = addManualAlias;
  document.getElementById("btn-refresh").onclick = () => loadAliases(true);
  loadAliases(false);
});

// ---------------------------------------------------------------- UI helpers

function setStatus(message, kind) {
  const el = document.getElementById("status");
  el.textContent = message || "";
  el.className = kind || "";
}

function setBusy(busy) {
  for (const id of ["btn-send", "btn-apply", "btn-add", "btn-refresh"]) {
    document.getElementById(id).disabled = busy;
  }
  if (!busy && aliases.length === 0) {
    document.getElementById("btn-send").disabled = true;
    document.getElementById("btn-apply").disabled = true;
  }
}

function selectedAlias() {
  const checked = document.querySelector('input[name="alias"]:checked');
  return checked ? checked.value : null;
}

function renderAliases(preselect) {
  const list = document.getElementById("alias-list");
  list.innerHTML = "";
  if (aliases.length === 0) {
    list.innerHTML =
      '<em style="color:#6b7280">No aliases yet. Configure sign-in (see README) ' +
      "or add one under “Manage aliases”.</em>";
    return;
  }
  for (const alias of aliases) {
    const label = document.createElement("label");
    label.className = "alias-option";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "alias";
    radio.value = alias.address;
    if (preselect && alias.address.toLowerCase() === preselect.toLowerCase()) {
      radio.checked = true;
    }
    const text = document.createElement("span");
    text.textContent = alias.address;
    label.append(radio, text);
    if (alias.address.toLowerCase() === (primaryAddress || "").toLowerCase()) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "primary";
      label.append(tag);
    } else if (alias.source === "manual") {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "manual";
      label.append(tag);
    }
    list.append(label);
  }
  if (!document.querySelector('input[name="alias"]:checked')) {
    document.querySelector('input[name="alias"]').checked = true;
  }
}

// ------------------------------------------------------------------ aliases

async function loadAliases(interactive) {
  setBusy(true);
  setStatus("Loading aliases…");
  primaryAddress = Office.context.mailbox.userProfile.emailAddress;

  const found = new Map(); // lowercase -> { address, source }
  const add = (address, source) => {
    const key = (address || "").trim().toLowerCase();
    if (key && !found.has(key)) found.set(key, { address: address.trim(), source });
  };

  add(primaryAddress, "account");

  // Auto-discover aliases (proxy addresses) from the signed-in account.
  let discoveryError = null;
  if (isClientIdConfigured()) {
    try {
      const token = await getAccessToken(interactive);
      const res = await graphFetch(
        token,
        "GET",
        "/me?$select=mail,userPrincipalName,proxyAddresses"
      );
      add(res.mail || res.userPrincipalName, "account");
      for (const proxy of res.proxyAddresses || []) {
        if (/^smtp:/i.test(proxy)) add(proxy.slice(5), "account");
      }
    } catch (err) {
      discoveryError = err;
    }
  }

  // Manually added aliases stored in mailbox roaming settings.
  const extras = Office.context.roamingSettings.get(SETTING_EXTRA_ALIASES) || [];
  for (const address of extras) add(address, "manual");

  aliases = [...found.values()];

  // Preselect: current From if set, else last used, else primary.
  const lastUsed = Office.context.roamingSettings.get(SETTING_LAST_ALIAS);
  let preselect = lastUsed || primaryAddress;
  try {
    const from = await new Promise((resolve) =>
      Office.context.mailbox.item.from.getAsync((r) =>
        resolve(r.status === Office.AsyncResultStatus.Succeeded ? r.value : null)
      )
    );
    if (from && from.emailAddress) preselect = from.emailAddress;
  } catch (err) {
    // from.getAsync needs Mailbox 1.7; fall back to last-used/primary.
  }

  renderAliases(preselect);
  setBusy(false);

  if (!isClientIdConfigured()) {
    setStatus(
      "Sign-in isn't configured yet (CLIENT_ID missing in config.js), so aliases " +
        "can't be auto-discovered and sending is disabled. See the README.",
      "error"
    );
  } else if (discoveryError) {
    setStatus(
      "Couldn't auto-discover aliases: " +
        describeError(discoveryError) +
        (interactive ? "" : "\nUse “Refresh aliases” to sign in."),
      "error"
    );
  } else {
    setStatus("");
  }
}

function addManualAlias() {
  const input = document.getElementById("manual-alias");
  const address = input.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    setStatus("Enter a valid email address.", "error");
    return;
  }
  const extras = Office.context.roamingSettings.get(SETTING_EXTRA_ALIASES) || [];
  if (!extras.some((a) => a.toLowerCase() === address.toLowerCase())) {
    extras.push(address);
    Office.context.roamingSettings.set(SETTING_EXTRA_ALIASES, extras);
    Office.context.roamingSettings.saveAsync(() => {});
  }
  if (!aliases.some((a) => a.address.toLowerCase() === address.toLowerCase())) {
    aliases.push({ address, source: "manual" });
  }
  input.value = "";
  renderAliases(address);
  setStatus("Alias added.", "ok");
}

// --------------------------------------------------------------------- auth

function isClientIdConfigured() {
  return CONFIG.CLIENT_ID && !/^YOUR-/.test(CONFIG.CLIENT_ID);
}

async function initMsal() {
  if (msalInstance) return;
  const msalConfig = {
    auth: {
      clientId: CONFIG.CLIENT_ID,
      authority: CONFIG.AUTHORITY || "https://login.microsoftonline.com/common",
    },
    cache: { cacheLocation: "localStorage" },
  };
  if (Office.context.requirements.isSetSupported("NestedAppAuth", "1.1")) {
    msalInstance = await msal.createNestablePublicClientApplication(msalConfig);
  } else {
    // Older hosts: standard popup flow. Requires the task pane URL to be
    // registered as an SPA redirect URI on the app registration.
    msalConfig.auth.redirectUri = window.location.href.split(/[?#]/)[0];
    msalInstance = new msal.PublicClientApplication(msalConfig);
    await msalInstance.initialize();
  }
}

async function getAccessToken(allowInteractive) {
  await initMsal();
  const request = { scopes: CONFIG.GRAPH_SCOPES };
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) request.account = accounts[0];
  try {
    const result = await msalInstance.acquireTokenSilent(request);
    return result.accessToken;
  } catch (silentError) {
    if (!allowInteractive) throw silentError;
    const result = await msalInstance.acquireTokenPopup(request);
    return result.accessToken;
  }
}

// -------------------------------------------------------------------- graph

async function graphFetch(token, method, path, body) {
  const res = await fetch("https://graph.microsoft.com/v1.0" + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404) {
    const err = new Error("not found");
    err.notFound = true;
    throw err;
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).error.message;
    } catch (e) {
      /* no JSON body */
    }
    throw new Error("Graph " + method + " " + path + " failed (" + res.status + "): " + detail);
  }
  return res.status === 204 || res.status === 202 ? null : res.json();
}

function saveDraft() {
  return new Promise((resolve, reject) => {
    Office.context.mailbox.item.saveAsync((result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) resolve(result.value);
      else reject(new Error("Couldn't save the draft: " + result.error.message));
    });
  });
}

function toRestId(itemId) {
  return Office.context.mailbox.convertToRestId(itemId, Office.MailboxEnums.RestVersion.v2_0);
}

// The freshly saved draft can take a moment to reach the server; retry 404s.
async function patchFrom(token, restId, alias, attempts = 6) {
  const path = "/me/messages/" + encodeURIComponent(restId);
  const body = { from: { emailAddress: { address: alias } } };
  for (let i = 0; ; i++) {
    try {
      return await graphFetch(token, "PATCH", path, body);
    } catch (err) {
      if (!err.notFound || i >= attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

// ------------------------------------------------------------------ actions

async function sendFromAlias(sendNow) {
  const alias = selectedAlias();
  if (!alias) {
    setStatus("Pick an alias first.", "error");
    return;
  }
  if (!isClientIdConfigured()) {
    setStatus("CLIENT_ID isn't configured in config.js — see the README.", "error");
    return;
  }

  setBusy(true);
  try {
    setStatus("Signing in…");
    const token = await getAccessToken(true);

    setStatus("Saving draft…");
    const itemId = await saveDraft();
    const restId = toRestId(itemId);

    setStatus("Setting From to " + alias + "…");
    await patchFrom(token, restId, alias);

    Office.context.roamingSettings.set(SETTING_LAST_ALIAS, alias);
    Office.context.roamingSettings.saveAsync(() => {});

    if (sendNow) {
      setStatus("Sending…");
      await graphFetch(token, "POST", "/me/messages/" + encodeURIComponent(restId) + "/send");
      setStatus("Sent from " + alias + " ✓\nClosing this draft — don't press Outlook's Send button.", "ok");
      closeComposeWindow();
    } else {
      setStatus(
        "From set to " + alias + " on the saved draft ✓\n" +
          "Note: the compose window may not show it, and some Outlook clients " +
          "reset the From field when you press Send. “Send now from selected " +
          "alias” is the reliable option.",
        "ok"
      );
    }
  } catch (err) {
    setStatus(describeError(err), "error");
  } finally {
    setBusy(false);
  }
}

function closeComposeWindow() {
  try {
    const item = Office.context.mailbox.item;
    if (item.closeAsync) {
      item.closeAsync({ discardItem: true }, () => {});
    } else if (item.close) {
      item.close();
    }
  } catch (err) {
    // Closing is best-effort; the message has already been sent.
  }
}

function describeError(err) {
  const msg = (err && err.message) || String(err);
  if (/ErrorSendAsDenied|SendAsDenied/i.test(msg)) {
    return (
      "Exchange refused to send as that address (SendAsDenied). Make sure the " +
      "alias belongs to your mailbox and your admin has enabled sending from " +
      "aliases: Set-OrganizationConfig -SendFromAliasEnabled $true"
    );
  }
  if (err && err.notFound) {
    return "The draft hasn't synced to the server yet. Wait a moment and try again.";
  }
  return msg;
}
