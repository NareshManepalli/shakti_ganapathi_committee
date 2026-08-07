/**
 * SSGC — Members Web App  (read-only)
 * ---------------------------------------------------------------------------
 * Serves the committee list to the public site.
 *
 *   ?action=members   -> the public committee list
 *
 * Only rows with a_in = 1 are returned, sorted by display_order.
 *
 * WHAT IS DELIBERATELY NOT RETURNED
 *  mobile, email, access_in and adm_in never leave this script. The public
 *  site does not need them, and the mobile numbers in particular become the
 *  whitelist for the Committee Fund gate later — publishing them would hand
 *  out half of that check for free.
 *
 * THE TWO ACCESS FLAGS  (for the admin phase, not used yet)
 *  access_in = 1, adm_in = 1  -> full access: add and edit content, upload
 *                                photos, manage members and transactions
 *  access_in = 1, adm_in = 0  -> read-only: the transactions screen and the
 *                                monthly amount screen, nothing else
 *  access_in = 0              -> appears on the public site, cannot sign in
 *
 *  There are no passwords in the sheet. Sign-in will be OTP to the member's
 *  mobile, plus a secret code the committee sets — designed in the admin
 *  phase. Until then this script is read-only: with no way to authenticate a
 *  caller, any write endpoint on a public URL would be open to everyone.
 *
 * SETUP
 *  1. Open the SSGC workbook -> Extensions -> Apps Script.
 *  2. Paste this file. Save.
 *  3. Deploy -> New deployment -> Web app
 *       Execute as:     Me
 *       Who has access: Anyone
 *  4. Put the /exec URL in the site's .env as VITE_MEMBERS_API.
 * ---------------------------------------------------------------------------
 */

var MEMBERS_SHEET = 'members';

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function membersSheet() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MEMBERS_SHEET);
  if (!sh) throw new Error('Sheet not found: ' + MEMBERS_SHEET);
  return sh;
}

function readMembers() {
  var values = membersSheet().getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    if (values[r].join('').trim() === '') continue;
    var obj = {};
    for (var c = 0; c < headers.length; c++) if (headers[c]) obj[headers[c]] = values[r][c];
    rows.push(obj);
  }
  return rows;
}

function isOne(v) {
  return String(v).trim() === '1';
}

function doGet(e) {
  try {
    var action = String(((e && e.parameter) || {}).action || 'members');
    if (action !== 'members') throw new Error('Unknown action: ' + action);
    return jsonOut({ ok: true, members: publicMembers() });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function publicMembers() {
  return readMembers()
    .filter(function (r) { return isOne(r.a_in); })
    .map(function (r) {
      return {
        id: Number(r.id),
        name_en: String(r.name_en || ''),
        name_te: String(r.name_te || ''),
        position_en: String(r.position_en || ''),
        position_te: String(r.position_te || ''),
        photo: String(r.photo || ''),
        display_order: Number(r.display_order || 0),
        is_executive: isOne(r.is_executive),
      };
    })
    .sort(function (a, b) { return a.display_order - b.display_order; });
}
