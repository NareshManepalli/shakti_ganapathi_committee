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
 *  email, access_in and adm_in never leave this script.
 *
 *  `email` matters most: the funds gate emails a one-time code to that
 *  address, so publishing it would tell an attacker exactly which inbox to go
 *  after. `access_in` and `adm_in` say who may sign in and who is an admin —
 *  nothing a visitor needs, and a map of who to target.
 *
 *  `mobile` IS returned: the identity card shows it, which the committee
 *  asked for. That is a decision, not an oversight — it is no longer part of
 *  any check, because sign-in is a code emailed to the member.
 *
 *  This is the whole reason the members workbook can go back to Restricted:
 *  the site reads it through here, so the private columns are never served.
 *
 * THE TWO ACCESS FLAGS  (for the admin phase, not used yet)
 *  access_in = 1, adm_in = 1  -> full access: add and edit content, upload
 *                                photos, manage members and transactions
 *  access_in = 1, adm_in = 0  -> read-only: the transactions screen and the
 *                                monthly amount screen, nothing else
 *  access_in = 0              -> appears on the public site, cannot sign in
 *
 *  There are no passwords in the sheet. Sign-in is a 6-digit code emailed to
 *  the member (see GOOGLE_APPS_SCRIPT_AUTH.js), which reads this same sheet
 *  privately. This script stays read-only: with no way to authenticate a
 *  caller, any write endpoint on a public URL would be open to everyone.
 *
 * SETUP
 *  1. script.google.com -> New project -> paste this file -> Save.
 *     (Standalone, like the gallery and auth scripts — nothing to bind.)
 *  2. Check MEMBERS_SHEET_ID below points at the members workbook.
 *  3. Deploy -> New deployment -> Web app
 *       Execute as:     Me       (its access is what keeps the sheet private)
 *       Who has access: Anyone
 *  4. Put the /exec URL in src/config/sheetsConfig.js -> api.members,
 *     then set the members workbook itself to *Restricted*.
 * ---------------------------------------------------------------------------
 */

var MEMBERS_SHEET_ID = '1nzynJzTm72i7C0lmfR50VZ6lONArSrh7ncbejMSiYyc';

// Tab name. Left as a hint rather than a requirement: if no tab matches, the
// first one is used, so renaming the tab cannot break the public site.
var MEMBERS_SHEET = 'members';

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function membersSheet() {
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var sh = MEMBERS_SHEET ? ss.getSheetByName(MEMBERS_SHEET) : null;
  if (!sh) sh = ss.getSheets()[0];
  if (!sh) throw new Error('No tabs found in the members workbook.');
  return sh;
}

/** Run once from the editor to check access before deploying. */
function checkMembers() {
  var sh = membersSheet();
  var rows = publicMembers();
  Logger.log('Tab read: ' + sh.getName());
  Logger.log('Public rows returned: ' + rows.length);
  Logger.log('Keys per row: ' + Object.keys(rows[0] || {}).join(', '));
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
        // Shown on the identity card, so it is public by decision, not by
        // accident. Everything omitted below is what must stay private.
        mobile: String(r.mobile || ''),
        photo: String(r.photo || ''),
        prfle_photo: String(r.prfle_photo || ''),
        display_order: Number(r.display_order || 0),
        is_executive: isOne(r.is_executive),
      };
    })
    .sort(function (a, b) { return a.display_order - b.display_order; });
}
