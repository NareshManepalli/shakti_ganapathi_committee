/**
 * SSGC — Content Web App (read + write for the admin portal)
 * ---------------------------------------------------------------------------
 * The write endpoint the portal's editor screens save through. It covers the
 * three data sheets:
 *
 *   content   about / mandapam / festival rows
 *   schedule  the nine festival days, per year
 *   members   the committee list, including the private columns
 *
 * WHY THIS EXISTS SEPARATELY FROM THE PUBLIC READS
 *   The public site reads `content` and `schedule` straight from their CSV
 *   exports, and `members` through the read-only Members Web App. None of that
 *   can write, and none of it should — those URLs are in a public repo and the
 *   browser bundle. Everything here requires a signed session token.
 *
 * AUTHORISATION
 *   Every action needs a token minted by the Auth Web App, carrying adm_in = 1.
 *   The signature is checked with the SAME key, held in Script Properties under
 *   SESSION_SIGNING_KEY — copy it from the auth project, exactly as the gallery
 *   script does. A funds-only member (adm_in = 0) is refused outright.
 *
 * SETUP
 *  1. script.new -> paste this file -> Save.
 *  2. Check the three sheet ids below.
 *  3. Project Settings -> Script Properties -> add SESSION_SIGNING_KEY with the
 *     value from the auth project.
 *  4. Deploy -> New deployment -> Web app, Execute as Me, access Anyone.
 *  5. Put the /exec URL in src/config/sheetsConfig.js -> api.content.
 * ---------------------------------------------------------------------------
 */

var CONTENT_SHEET_ID  = '1KYhZ-3pImxBIW68f3ZljQi3RivM51O7kwKR1awC0UbA';
var SCHEDULE_SHEET_ID = '1rtsurWepUJlzebf2LczLO_2f_EZ0YXJ7M06plNLtGV8';
var MEMBERS_SHEET_ID  = '1nzynJzTm72i7C0lmfR50VZ6lONArSrh7ncbejMSiYyc';

// Audit stamps in the committee's own time. A new Apps Script project defaults
// to America/Los_Angeles, which would date every i_ts and u_ts to the previous
// afternoon for anyone entering rows from India.
var COMMITTEE_TZ = 'Asia/Kolkata';

var SIGNING_KEY_PROP = 'SESSION_SIGNING_KEY';

/* ------------------------------------------------------------------ utils */

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function fail(code, message) {
  return jsonOut({ ok: false, code: code, error: message });
}

/** Run once to confirm the key is in place and all three sheets open. */
function checkContent() {
  var key = PropertiesService.getScriptProperties().getProperty(SIGNING_KEY_PROP);
  Logger.log('Signing key present: ' + (key ? 'yes' : 'NO — writes will all be refused'));
  ['content', 'schedule', 'members'].forEach(function (name) {
    try {
      Logger.log(name + ' rows: ' + readRows(sheetFor(name)).length);
    } catch (e) {
      Logger.log(name + ' FAILED: ' + e.message);
    }
  });
}

function sheetFor(which) {
  var id = which === 'content' ? CONTENT_SHEET_ID
         : which === 'schedule' ? SCHEDULE_SHEET_ID
         : MEMBERS_SHEET_ID;
  return SpreadsheetApp.openById(id).getSheets()[0];
}

/** Header row lower-cased, so a renamed or reordered column still resolves. */
function headerOf(sheet) {
  return sheet.getDataRange().getValues()[0]
    .map(function (h) { return String(h || '').trim().toLowerCase(); });
}

function readRows(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var header = headerOf(sheet);
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = {};
    var blank = true;
    for (var c = 0; c < header.length; c++) {
      if (!header[c]) continue;
      row[header[c]] = values[r][c];
      if (String(values[r][c] || '').trim()) blank = false;
    }
    if (blank) continue;
    row.__row = r + 1;                 // 1-based sheet row, for writing back
    out.push(row);
  }
  return out;
}

function stamp() {
  return Utilities.formatDate(new Date(), COMMITTEE_TZ, 'yyyy-MM-dd HH:mm:ss');
}

/** Writes the given fields onto one row, ignoring columns the sheet lacks. */
function writeRow(sheet, rowNumber, fields) {
  var header = headerOf(sheet);
  Object.keys(fields).forEach(function (key) {
    var c = header.indexOf(key);
    if (c >= 0) sheet.getRange(rowNumber, c + 1).setValue(fields[key]);
  });
}

/** Appends a row, filling only the columns the sheet actually has. */
function appendRow(sheet, fields) {
  var header = headerOf(sheet);
  var row = header.map(function (h) { return h && fields[h] !== undefined ? fields[h] : ''; });
  sheet.appendRow(row);
  return sheet.getLastRow();
}

/** Next free id, so a deleted row's id is never silently reused. */
function nextId(rows) {
  var max = 0;
  rows.forEach(function (r) { max = Math.max(max, Number(r.id) || 0); });
  return max + 1;
}

/* ------------------------------------------------------------------- auth */

/**
 * Verifies a token minted by the Auth Web App — same HMAC, same key, which
 * lives in Script Properties in both projects and in neither file.
 */
function verifySessionToken(token) {
  var key = PropertiesService.getScriptProperties().getProperty(SIGNING_KEY_PROP);
  if (!key) return null;

  var parts = String(token || '').split('.');
  if (parts.length !== 2) return null;

  var expected = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(parts[0], key)
  ).replace(/=+$/, '');
  if (expected !== parts[1]) return null;

  var payload;
  try {
    payload = JSON.parse(
      Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString()
    );
  } catch (e) { return null; }

  if (!payload || !payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

/** Throws unless the caller is a signed-in member with full access. */
function requireAdmin(body) {
  var claims = verifySessionToken(body.token);
  if (!claims) throw new Error('Your session has ended. Please sign in again.');
  if (Number(claims.adm) !== 1) throw new Error('You do not have permission to edit this.');
  return claims;
}

/* -------------------------------------------------------------- READ (GET) */

/**
 * Everything the editor screens need, in one call. Reads only — the public
 * site never uses this, so it carries the private member columns too, and is
 * therefore gated like the writes.
 */
function doGet(e) {
  var params = (e && e.parameter) || {};
  try {
    requireAdmin({ token: params.token });
  } catch (err) {
    return fail('UNAUTHORIZED', err.message);
  }
  try {
    return jsonOut({
      ok: true,
      content: readRows(sheetFor('content')),
      schedule: readRows(sheetFor('schedule')),
      members: readRows(sheetFor('members')),
    });
  } catch (err) {
    return fail('SERVER_ERROR', String(err && err.message ? err.message : err));
  }
}

/* ------------------------------------------------------------- WRITE (POST)
 *   { action:'saveContent',  token, section, content_en, content_te, image?, map_url? }
 *   { action:'saveSchedule', token, day:{ id?, year, day_no, date, time, title_en, ... } }
 *   { action:'deleteSchedule', token, id }
 *   { action:'saveMember',   token, member:{ id?, name_en, ... } }
 *   { action:'deleteMember', token, id }
 *
 * Deletes are SOFT: a_in goes to 0 and d_ts is stamped, matching the rest of
 * the workbook. Nothing here removes a row, so a mistaken click is one cell
 * away from being undone.
 */
function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
    requireAdmin(body);

    var action = String(body.action || '').trim();
    if (action === 'saveContent')    return saveContent(body);
    if (action === 'saveSchedule')   return saveSchedule(body);
    if (action === 'deleteSchedule') return softDelete('schedule', body.id);
    if (action === 'saveMember')     return saveMember(body);
    if (action === 'deleteMember')   return softDelete('members', body.id);
    return fail('UNKNOWN_ACTION', 'Unknown action: ' + action);
  } catch (err) {
    return fail('SERVER_ERROR', String(err && err.message ? err.message : err));
  }
}

/* ---------------------------------------------------------------- content */

function saveContent(body) {
  var section = String(body.section || '').trim().toLowerCase();
  if (!section) return fail('BAD_SECTION', 'Which section is this?');

  var sheet = sheetFor('content');
  var rows = readRows(sheet);
  var target = null;
  rows.forEach(function (r) {
    if (String(r.section || '').trim().toLowerCase() === section) target = r;
  });

  var fields = { u_ts: stamp() };
  ['content_en', 'content_te', 'image', 'map_url'].forEach(function (k) {
    if (body[k] !== undefined) fields[k] = String(body[k]);
  });

  if (target) {
    writeRow(sheet, target.__row, fields);
  } else {
    fields.id = nextId(rows);
    fields.section = section;
    fields.a_in = 1;
    fields.i_ts = stamp();
    appendRow(sheet, fields);
  }
  SpreadsheetApp.flush();
  return jsonOut({ ok: true, content: readRows(sheet) });
}

/* --------------------------------------------------------------- schedule */

function saveSchedule(body) {
  var day = body.day || {};
  var year = String(day.year || '').trim();
  var dayNo = Number(day.day_no) || 0;
  if (!/^\d{4}$/.test(year)) return fail('BAD_YEAR', 'Enter a four-digit year.');
  if (dayNo < 1) return fail('BAD_DAY', 'Which day of the festival is this?');

  var sheet = sheetFor('schedule');
  var rows = readRows(sheet);

  var fields = { u_ts: stamp() };
  ['year', 'annual_year', 'annual_yr_id', 'day_no', 'date', 'day_en', 'day_te', 'time', 'title_en', 'title_te', 'image']
    .forEach(function (k) { if (day[k] !== undefined) fields[k] = String(day[k]); });

  var existing = null;
  if (day.id) {
    rows.forEach(function (r) { if (String(r.id) === String(day.id)) existing = r; });
  }

  if (existing) {
    writeRow(sheet, existing.__row, fields);
  } else {
    // A year may not have two of the same day — that would show twice publicly.
    var clash = null;
    rows.forEach(function (r) {
      if (String(r.a_in).trim() === '1'
          && String(r.year).trim() === year
          && Number(r.day_no) === dayNo) clash = r;
    });
    if (clash) return fail('DAY_EXISTS', 'Day ' + dayNo + ' of ' + year + ' already exists.');

    fields.id = nextId(rows);
    fields.a_in = 1;
    fields.i_ts = stamp();
    appendRow(sheet, fields);
  }
  SpreadsheetApp.flush();
  return jsonOut({ ok: true, schedule: readRows(sheet) });
}

/* ---------------------------------------------------------------- members */

function saveMember(body) {
  var m = body.member || {};
  var name = String(m.name_en || '').trim();
  if (!name) return fail('BAD_NAME', 'Enter a name.');

  var mobile = String(m.mobile || '').replace(/\D/g, '');
  if (mobile.length > 10) mobile = mobile.slice(-10);
  if (mobile && mobile.length !== 10) return fail('BAD_MOBILE', 'Enter a 10-digit mobile number.');

  var email = String(m.email || '').trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return fail('BAD_EMAIL', 'Enter a valid email address.');
  }

  var sheet = sheetFor('members');
  var rows = readRows(sheet);

  // The mobile is how a member signs in, so two rows must never share one.
  if (mobile) {
    var clash = null;
    rows.forEach(function (r) {
      var other = String(r.mobile || '').replace(/\D/g, '').slice(-10);
      if (other === mobile && String(r.id) !== String(m.id) && String(r.a_in).trim() === '1') clash = r;
    });
    if (clash) return fail('MOBILE_TAKEN', String(clash.name_en) + ' already uses that mobile number.');
  }

  var fields = { u_ts: stamp(), mobile: mobile };
  ['name_en', 'name_te', 'position_en', 'position_te', 'email',
   'photo', 'prfle_photo', 'display_order'].forEach(function (k) {
    if (m[k] !== undefined) fields[k] = String(m[k]);
  });
  ['is_executive', 'access_in', 'adm_in', 'bypass_in'].forEach(function (k) {
    if (m[k] !== undefined) fields[k] = m[k] ? 1 : 0;
  });

  var existing = null;
  if (m.id) rows.forEach(function (r) { if (String(r.id) === String(m.id)) existing = r; });

  if (existing) {
    writeRow(sheet, existing.__row, fields);
  } else {
    fields.id = nextId(rows);
    fields.a_in = 1;
    fields.i_ts = stamp();
    appendRow(sheet, fields);
  }
  SpreadsheetApp.flush();
  return jsonOut({ ok: true, members: readRows(sheet) });
}

/* ----------------------------------------------------------- soft delete */

function softDelete(which, id) {
  if (!id) return fail('BAD_ID', 'Which row?');
  var sheet = sheetFor(which);
  var rows = readRows(sheet);
  var target = null;
  rows.forEach(function (r) { if (String(r.id) === String(id)) target = r; });
  if (!target) return fail('NOT_FOUND', 'That row no longer exists.');

  // Soft delete, like everything else in this workbook: a_in = 0 hides it from
  // the site, d_ts records when, and the row stays put in case it was a mistake.
  writeRow(sheet, target.__row, { a_in: 0, d_ts: stamp(), u_ts: stamp() });
  SpreadsheetApp.flush();

  var out = { ok: true };
  out[which] = readRows(sheet);
  return jsonOut(out);
}
