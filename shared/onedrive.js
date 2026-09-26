// ════════════════════════════════════════════════
//  ONEDRIVE FOLDER CREATION (New Job page only)
//  Mirrors Steven's existing OneDrive structure:
//    02. Engineering Documents/02. Client Jobs/{ClientFolder}/{JobNo} - {Address}/...
//    03. Finance Documents/Invoices/{ClientFolder}/{JobNo}-{Rev}/
// ════════════════════════════════════════════════
var ONEDRIVE_CLIENT_FOLDERS = {
  '01': '01. Dexcon Engineering Group',
  '02': '02. Arax Consulting',
  '03': '03. Forenx'
};

function sanitizeFolderName(s) {
  return String(s || '')
    .replace(/[\\/:*?"<>|]/g, '-')  // characters OneDrive/SharePoint won't allow in a name
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');         // no trailing dot/space
}

function encodeGraphPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

// Confirms a folder exists at parentPath/name, creating it only if missing.
// Used for ancestor folders that are expected to already exist in Steven's OneDrive
// (e.g. "02. Engineering Documents") so a booking never creates a duplicate of them.
async function ensureFolder(token, parentPath, name) {
  var checkPath = parentPath ? parentPath + '/' + name : name;
  var getRes = await fetch('https://graph.microsoft.com/v1.0/me/drive/root:/' + encodeGraphPath(checkPath), {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (getRes.ok) return;
  if (getRes.status !== 404) {
    var errText = await getRes.text();
    throw new Error('OneDrive lookup failed (' + getRes.status + '): ' + errText.slice(0,200));
  }
  await createFolder(token, parentPath, name);
}

// Creates a folder that is known to be new (fails loudly instead of silently duplicating
// if something unexpected is already there).
async function createFolder(token, parentPath, name) {
  var url = parentPath
    ? 'https://graph.microsoft.com/v1.0/me/drive/root:/' + encodeGraphPath(parentPath) + ':/children'
    : 'https://graph.microsoft.com/v1.0/me/drive/root/children';
  var res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' })
  });
  if (!res.ok) {
    var errText = await res.text();
    throw new Error('OneDrive create "' + name + '" failed (' + res.status + '): ' + errText.slice(0,200));
  }
}

async function createJobFolders(token, clientFolderName, jobNo, address, bookingDateStr) {
  await ensureFolder(token, '', '02. Engineering Documents');
  await ensureFolder(token, '02. Engineering Documents', '02. Client Jobs');
  await ensureFolder(token, '02. Engineering Documents/02. Client Jobs', clientFolderName);

  var jobBasePath  = '02. Engineering Documents/02. Client Jobs/' + clientFolderName;
  var jobFolderName = sanitizeFolderName(jobNo + ' - ' + address);
  await ensureFolder(token, jobBasePath, jobFolderName);
  var jobPath = jobBasePath + '/' + jobFolderName;

  var subfolders = [
    '01. Architecture', '02. Structural', '03. Civil', '04. Geo', '05. PSI',
    '06. Issued Documents', '07. Communication', '08. Site Photos',
    '09. Site Instructions', '10. Survey', '11. Energy Report', '12. Building Permit'
  ];
  for (var i = 0; i < subfolders.length; i++) {
    await createFolder(token, jobPath, subfolders[i]);
  }

  await createFolder(token, jobPath + '/01. Architecture', 'a. Working Docs');
  await createFolder(token, jobPath + '/01. Architecture/a. Working Docs', sanitizeFolderName(bookingDateStr + ' ' + jobNo + ' ' + address));

  await createFolder(token, jobPath + '/07. Communication', 'Corres In');
  await createFolder(token, jobPath + '/07. Communication', 'Corres Out');
}

async function createInvoiceFolder(token, clientFolderName, jobNo, revision) {
  await ensureFolder(token, '', '03. Finance Documents');
  await ensureFolder(token, '03. Finance Documents', 'Invoices');
  await ensureFolder(token, '03. Finance Documents/Invoices', clientFolderName);
  await createFolder(token, '03. Finance Documents/Invoices/' + clientFolderName, sanitizeFolderName(jobNo + '-' + revision));
}

// Fire-and-forget: booking a job never waits on this. Toasts on completion either way.
function createOneDriveFoldersInBackground(client, jobNo, revision, address, bookingDateStr) {
  var clientFolderName = client && ONEDRIVE_CLIENT_FOLDERS[client.code];
  if (!clientFolderName) {
    toast('OneDrive folders skipped — no folder mapping for "' + (client ? client.name : 'this client') + '"', 'err');
    return;
  }
  toast('Creating OneDrive folders…', 'ok');
  getGraphToken().then(function(token) {
    return createJobFolders(token, clientFolderName, jobNo, address, bookingDateStr)
      .then(function(){ return createInvoiceFolder(token, clientFolderName, jobNo, revision); });
  }).then(function() {
    toast('OneDrive folders created', 'ok');
  }).catch(function(err) {
    toast('OneDrive folder creation failed: ' + err.message, 'err');
  });
}
