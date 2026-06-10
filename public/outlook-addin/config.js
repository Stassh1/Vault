// Configuration for the Send From Alias add-in.
//
// CLIENT_ID: the Application (client) ID of your Microsoft Entra app
// registration. See README.md for the registration steps. Until this is
// set, alias auto-discovery and sending are disabled and the pane will
// tell you what's missing.
window.ALIAS_ADDIN_CONFIG = {
  CLIENT_ID: "YOUR-AZURE-APP-CLIENT-ID",
  AUTHORITY: "https://login.microsoftonline.com/common",
  GRAPH_SCOPES: ["User.Read", "Mail.ReadWrite", "Mail.Send"],
};
