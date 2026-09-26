// ════════════════════════════════════════════════
//  MSAL / MICROSOFT GRAPH CONFIG
//  Shared by every page that talks to Graph (Invoicing's Mail.Send,
//  New Job's OneDrive folder creation). Both scopes are requested together
//  so one consent popup covers every Graph feature in the app, rather than
//  Steven getting a fresh popup the first time he hits each feature.
// ════════════════════════════════════════════════
var msalConfig = {
  auth: {
    clientId: 'bd5baea5-3664-4073-a977-8443d1067a4e',
    authority: 'https://login.microsoftonline.com/1f775747-bcd3-450a-ad8b-9aee8a428b5f',
    redirectUri: 'https://apairofscissors.github.io/ERP/'
  },
  cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false }
};
var msalInstance = new msal.PublicClientApplication(msalConfig);
var msalInitialized = null; // promise, set on first use
var GRAPH_SCOPES = ['Mail.Send', 'Files.ReadWrite.All'];

async function ensureMsalInit() {
  if (!msalInitialized) msalInitialized = msalInstance.initialize();
  await msalInitialized;
}

// Acquires a token covering GRAPH_SCOPES: silent refresh first, popup sign-in as fallback.
// Must be called directly from a user-gesture handler (e.g. a click) so the popup isn't blocked.
async function getGraphToken() {
  await ensureMsalInit();
  var accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    try {
      var silent = await msalInstance.acquireTokenSilent({ scopes: GRAPH_SCOPES, account: accounts[0] });
      return silent.accessToken;
    } catch (e) {
      // Falls through to interactive popup below (e.g. InteractionRequiredAuthError)
    }
  }
  var result = accounts.length > 0
    ? await msalInstance.acquireTokenPopup({ scopes: GRAPH_SCOPES, account: accounts[0] })
    : await msalInstance.loginPopup({ scopes: GRAPH_SCOPES });
  return result.accessToken;
}
