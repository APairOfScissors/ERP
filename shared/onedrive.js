// ════════════════════════════════════════════════
//  ONEDRIVE FOLDER CREATION + FILE UPLOAD (New Job page + Job detail's
//  "Open in OneDrive" button)
//  Mirrors Steven's existing OneDrive structure:
//    02. Engineering Documents/02. Client Jobs/{ClientFolder}/[{Year}/]{JobNo} - {Address}/...
//    03. Finance Documents/Invoices/{ClientFolder}/{JobNo}-{Rev}/
//  Dexcon job numbers ("25-1015", "26-1005") encode a booking year, and those
//  jobs live one level deeper under a folder for that year; Arax/Forenx numbers
//  don't have that shape, so they skip the extra level entirely.
// ════════════════════════════════════════════════

// Only the numeric prefix is reliable — the wording after it isn't guaranteed to
// match exactly what's actually in OneDrive (e.g. real folder is
// "03. Forenx Consulting Engineers", not this fallback). These are used only as
// a name to create a brand-new client folder with; an existing folder is always
// resolved by listing + matching the "NN." prefix instead (see resolveClientFolderName).
var ONEDRIVE_CLIENT_FOLDERS = {
  '01': '01. Dexcon Engineering Group',
  '02': '02. Arax Consulting',
  '03': '03. Forenx Consulting Engineers'
};

// Files over this size use a chunked upload session instead of a single PUT
// (Graph's simple-upload endpoint is unreliable much past this).
var ONEDRIVE_SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024;
// Must be a multiple of 320 KiB per Graph's upload-session requirements.
var ONEDRIVE_UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024;

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

// "26-1005" -> "26", "ER604" -> null, "260864" -> null (only Dexcon's scheme has this shape)
function jobYearPrefix(jobNo) {
  var m = /^(\d{2})-/.exec(jobNo || '');
  return m ? m[1] : null;
}

// "2026-09-27" -> "2026.09.27 - Full Job Booking"
function bookingDocsFolderName(bookingDateStr) {
  return (bookingDateStr || '').split('-').join('.') + ' - Full Job Booking';
}

// Lists the immediate child item names of a folder. Missing parent -> empty
// list rather than throwing, since "nothing there yet" is a normal first-run state.
async function listChildNames(token, path) {
  var url = path
    ? 'https://graph.microsoft.com/v1.0/me/drive/root:/' + encodeGraphPath(path) + ':/children?$select=name'
    : 'https://graph.microsoft.com/v1.0/me/drive/root/children?$select=name';
  var res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
  if (res.status === 404) return [];
  if (!res.ok) {
    var errText = await res.text();
    throw new Error('Could not list "' + path + '" (' + res.status + '): ' + errText.slice(0,200));
  }
  var data = await res.json();
  return (data.value || []).map(function(item){ return item.name; });
}

// Finds a real, existing child folder by a match rule rather than assuming exact
// wording — the name Steven actually gave a folder isn't guaranteed to match any
// hardcoded guess (this is exactly what bit us: real folder was
// "03. Forenx Consulting Engineers", not "03. Forenx"). Falls back to fallbackName
// only when nothing matches yet (i.e. it's about to be created fresh).
async function resolveChildFolderName(token, basePath, matchFn, fallbackName) {
  var names = await listChildNames(token, basePath);
  var match = names.find(matchFn);
  return match || fallbackName;
}

async function resolveClientFolderName(token, basePath, clientCode, fallbackName) {
  return resolveChildFolderName(token, basePath, function(name) {
    return name && name.indexOf(clientCode + '.') === 0;
  }, fallbackName);
}

// Year folders are assumed to be literally "25"/"26" unless something else is
// already there (e.g. "25 Jobs") — matches an exact name or that name as a prefix.
async function resolveYearFolderName(token, basePath, yearPrefix) {
  return resolveChildFolderName(token, basePath, function(name) {
    return name === yearPrefix || (name && name.indexOf(yearPrefix) === 0 && /^\D/.test(name.slice(yearPrefix.length) || ' '));
  }, yearPrefix);
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

// Falls back to the client's own name (e.g. "04. Some New Client Pty Ltd") when
// the client code isn't one of the 3 hardcoded ones above — without this, a 4th+
// client with no OneDrive folder yet would resolve to a blank/undefined name and
// fail with a cryptic Graph 400 on first use.
function clientFolderFallbackName(clientCode, clientName) {
  return ONEDRIVE_CLIENT_FOLDERS[clientCode] || sanitizeFolderName(clientCode + '. ' + (clientName || 'Client'));
}

// Resolves (without creating) the folder a job's own folder lives directly under:
// the client folder, plus a year subfolder for Dexcon-style job numbers. Shared by
// creation and the read-only "Open in OneDrive" lookup so they can't disagree.
async function resolveJobParentPath(token, clientCode, clientName, jobNo) {
  var clientJobsBase = '02. Engineering Documents/02. Client Jobs';
  var clientFolderName = await resolveClientFolderName(token, clientJobsBase, clientCode, clientFolderFallbackName(clientCode, clientName));
  var parentPath = clientJobsBase + '/' + clientFolderName;
  var yearPrefix = jobYearPrefix(jobNo);
  if (yearPrefix) {
    var yearFolderName = await resolveYearFolderName(token, parentPath, yearPrefix);
    parentPath = parentPath + '/' + yearFolderName;
  }
  return parentPath;
}

// Returns { jobPath, bookingDocsPath } once the full tree exists.
async function createJobFolders(token, clientCode, clientName, jobNo, address, bookingDateStr) {
  await ensureFolder(token, '', '02. Engineering Documents');
  await ensureFolder(token, '02. Engineering Documents', '02. Client Jobs');
  var clientJobsBase = '02. Engineering Documents/02. Client Jobs';

  var clientFolderName = await resolveClientFolderName(token, clientJobsBase, clientCode, clientFolderFallbackName(clientCode, clientName));
  await ensureFolder(token, clientJobsBase, clientFolderName);
  var parentPath = clientJobsBase + '/' + clientFolderName;

  var yearPrefix = jobYearPrefix(jobNo);
  if (yearPrefix) {
    var yearFolderName = await resolveYearFolderName(token, parentPath, yearPrefix);
    await ensureFolder(token, parentPath, yearFolderName);
    parentPath = parentPath + '/' + yearFolderName;
  }

  var jobFolderName = sanitizeFolderName(jobNo + ' - ' + address);
  await ensureFolder(token, parentPath, jobFolderName);
  var jobPath = parentPath + '/' + jobFolderName;

  var subfolders = [
    '01. Architecture', '02. Structural', '03. Civil', '04. Geo', '05. PSI',
    '06. Issued Documents', '07. Communication', '08. Site Photos',
    '09. Site Instructions', '10. Survey', '11. Energy Report', '12. Building Permit'
  ];
  for (var i = 0; i < subfolders.length; i++) {
    await ensureFolder(token, jobPath, subfolders[i]);
  }

  var bookingDocsName = bookingDocsFolderName(bookingDateStr);
  await ensureFolder(token, jobPath + '/01. Architecture', 'a. Working Docs');
  await ensureFolder(token, jobPath + '/01. Architecture/a. Working Docs', bookingDocsName);

  await ensureFolder(token, jobPath + '/07. Communication', 'Corres In');
  await ensureFolder(token, jobPath + '/07. Communication', 'Corres Out');

  return { jobPath: jobPath, bookingDocsPath: jobPath + '/01. Architecture/a. Working Docs/' + bookingDocsName };
}

async function createInvoiceFolder(token, clientCode, clientName, jobNo, revision) {
  await ensureFolder(token, '', '03. Finance Documents');
  await ensureFolder(token, '03. Finance Documents', 'Invoices');
  var clientFolderName = await resolveClientFolderName(
    token, '03. Finance Documents/Invoices', clientCode, clientFolderFallbackName(clientCode, clientName)
  );
  await ensureFolder(token, '03. Finance Documents/Invoices', clientFolderName);
  await ensureFolder(token, '03. Finance Documents/Invoices/' + clientFolderName, sanitizeFolderName(jobNo + '-' + revision));
}

// Read-only equivalent of the job-folder path creation resolves — used by
// "Open in OneDrive" so it points at exactly the same folder, without creating anything.
async function resolveJobFolderPath(token, clientCode, clientName, jobNo, address) {
  var parentPath = await resolveJobParentPath(token, clientCode, clientName, jobNo);
  return parentPath + '/' + sanitizeFolderName(jobNo + ' - ' + address);
}

// Looks up a folder's own OneDrive web link (used by the "Open in OneDrive" button).
async function getFolderWebUrl(token, path) {
  var res = await fetch('https://graph.microsoft.com/v1.0/me/drive/root:/' + encodeGraphPath(path), {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (res.status === 404) throw new Error('Folder not found on OneDrive — it may not have been created for this job yet.');
  if (!res.ok) {
    var errText = await res.text();
    throw new Error('OneDrive lookup failed (' + res.status + '): ' + errText.slice(0,200));
  }
  var data = await res.json();
  return data.webUrl;
}

// Uploads one file into folderPath, using a chunked session for anything over
// ONEDRIVE_SIMPLE_UPLOAD_LIMIT. onProgress(percent) is optional.
async function uploadFileToOneDrive(token, folderPath, file, onProgress) {
  var basePath = encodeGraphPath(folderPath);
  var filename = encodeURIComponent(file.name);

  if (file.size <= ONEDRIVE_SIMPLE_UPLOAD_LIMIT) {
    var res = await fetch('https://graph.microsoft.com/v1.0/me/drive/root:/' + basePath + '/' + filename + ':/content', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/octet-stream' },
      body: file
    });
    if (!res.ok) {
      var errText = await res.text();
      throw new Error('Upload failed for "' + file.name + '" (' + res.status + '): ' + errText.slice(0,200));
    }
    if (onProgress) onProgress(100);
    return;
  }

  var sessionRes = await fetch('https://graph.microsoft.com/v1.0/me/drive/root:/' + basePath + '/' + filename + ':/createUploadSession', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } })
  });
  if (!sessionRes.ok) {
    var sessErrText = await sessionRes.text();
    throw new Error('Could not start upload session for "' + file.name + '": ' + sessErrText.slice(0,200));
  }
  var session = await sessionRes.json();
  var uploadUrl = session.uploadUrl;
  var size = file.size;
  var start = 0;
  while (start < size) {
    var end = Math.min(start + ONEDRIVE_UPLOAD_CHUNK_SIZE, size);
    var chunk = file.slice(start, end);
    // The session URL is pre-authenticated by Graph — no Authorization header here.
    var chunkRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(end - start),
        'Content-Range': 'bytes ' + start + '-' + (end - 1) + '/' + size
      },
      body: chunk
    });
    if (!chunkRes.ok && chunkRes.status !== 202) {
      var chunkErrText = await chunkRes.text();
      throw new Error('Upload failed partway through "' + file.name + '" (' + chunkRes.status + '): ' + chunkErrText.slice(0,200));
    }
    start = end;
    if (onProgress) onProgress(Math.round((start / size) * 100));
  }
}

// Uploads every file in sequence (parallel uploads risk hitting Graph throttling),
// toasting per-file progress so a slow/large batch doesn't look stalled.
async function uploadFilesToOneDrive(token, folderPath, files) {
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    toast('Uploading ' + file.name + ' (' + (i+1) + '/' + files.length + ')…', 'ok');
    await uploadFileToOneDrive(token, folderPath, file);
  }
}

// Fire-and-forget: booking a job never waits on this. Toasts on completion either way.
// `files` is optional — an array/FileList of booking documents to drop into
// 01. Architecture/a. Working Docs/{date} - Full Job Booking/.
function createOneDriveFoldersInBackground(client, jobNo, revision, address, bookingDateStr, files) {
  if (!client || !client.code) {
    toast('OneDrive folders skipped — no client code for "' + (client ? client.name : 'this client') + '"', 'err');
    return;
  }
  toast('Creating OneDrive folders…', 'ok');
  var paths;
  getGraphToken().then(function(token) {
    return createJobFolders(token, client.code, client.name, jobNo, address, bookingDateStr)
      .then(function(p) {
        paths = p;
        return createInvoiceFolder(token, client.code, client.name, jobNo, revision);
      })
      .then(function() {
        if (files && files.length) return uploadFilesToOneDrive(token, paths.bookingDocsPath, files);
      });
  }).then(function() {
    toast('OneDrive folders' + (files && files.length ? ' and files' : '') + ' created', 'ok');
  }).catch(function(err) {
    toast('OneDrive setup failed: ' + err.message, 'err');
  });
}
