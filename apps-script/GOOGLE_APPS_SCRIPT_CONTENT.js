/**
 * SSGC — Content Web App  (read-only)
 * ---------------------------------------------------------------------------
 * Serves the two content sheets to the public site:
 *
 *   content   two records — `about` (text + image) and `mandapam` (address + map)
 *   schedule  the nine festival days, per year
 *
 *   ?action=all                 -> { content:{…}, schedule:{ years, year, days } }
 *   ?action=content             -> the content records only
 *   ?action=schedule&year=2026  -> that year's days (omit year for the latest)
 *
 * Only rows with a_in = 1 are returned.
 *
 * READ-ONLY FOR NOW
 *  There are no write endpoints yet. Admin editing arrives with the admin
 *  portal, which will authenticate by OTP — until that exists there is no way
 *  to authorise a write, and an unauthenticated write endpoint on a public URL
 *  would let anyone edit the site. Reads are safe to expose because everything
 *  they return is already on the public page.
 *
 * SETUP
 *  1. Open the SSGC workbook -> Extensions -> Apps Script.
 *  2. Paste this file. Save.
 *  3. Deploy -> New deployment -> Web app
 *       Execute as:     Me
 *       Who has access: Anyone
 *  4. Put the /exec URL in the site's .env as VITE_CONTENT_API.
 *
 * The workbook stays Restricted. This script runs as you, so the site reads
 * through it rather than touching the sheet.
 * ---------------------------------------------------------------------------
 */

var CONTENT_SHEET = 'content';
var SCHEDULE_SHEET = 'schedule';

/* ------------------------------------------------------------------ utils */
function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheetByName(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Sheet not found: ' + name);
  return sh;
}

/** Rows as objects keyed by the header row. Blank rows are skipped. */
function readRows(sheetName) {
  var sh = sheetByName(sheetName);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return { headers: values[0] || [], rows: [] };

  var headers = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    if (values[r].join('').trim() === '') continue;
    var obj = { _row: r + 1 };
    for (var c = 0; c < headers.length; c++) if (headers[c]) obj[headers[c]] = values[r][c];
    rows.push(obj);
  }
  return { headers: headers, rows: rows };
}

function isActive(v) {
  return String(v).trim() === '1';
}

/**
 * Dates and times are stored as text so they survive locale changes. If the
 * sheet has silently coerced one to a Date, normalise it back rather than
 * letting a locale-formatted string reach the site.
 */
function asDateText(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v || '').trim();
}

function asTimeText(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
  }
  return String(v || '').trim();
}

/* -------------------------------------------------------------- READ (GET) */
function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    var action = String(params.action || 'all');

    if (action === 'content') return jsonOut({ ok: true, content: getContent() });

    if (action === 'schedule') {
      var s = getSchedule(params.year);
      return jsonOut({ ok: true, years: s.years, year: s.year, days: s.days });
    }

    var sched = getSchedule(params.year);
    return jsonOut({
      ok: true,
      content: getContent(),
      schedule: { years: sched.years, year: sched.year, days: sched.days },
    });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/**
 * Two records, keyed by section:
 *   about    -> { content_en, content_te, image }
 *   mandapam -> { content_en, content_te, map_url }   (address is one field)
 *
 * Headings and subtitles are NOT here — they are fixed in the site's
 * translations and never change, so putting them in the sheet would only
 * create somewhere for them to drift out of sync.
 */
function getContent() {
  var out = {};
  readRows(CONTENT_SHEET).rows.forEach(function (row) {
    var section = String(row.section || '').trim();
    if (!section || !isActive(row.a_in)) return;
    out[section] = {
      content_en: String(row.content_en == null ? '' : row.content_en),
      content_te: String(row.content_te == null ? '' : row.content_te),
      image: String(row.image || ''),
      map_url: String(row.map_url || ''),
    };
  });
  return out;
}

/**
 * Days for one year. With no year given, returns the latest year that has
 * rows — so a new festival becomes the default simply by adding its rows.
 *
 * day_en / day_te are optional. Left blank, the site derives the weekday from
 * `date`, which is the safer default: a hand-typed weekday can contradict the
 * date it sits beside, and the date is the value everything else is built on.
 */
function getSchedule(wantedYear) {
  var active = readRows(SCHEDULE_SHEET).rows.filter(function (r) { return isActive(r.a_in); });

  var years = [];
  active.forEach(function (r) {
    var y = String(r.year).trim();
    if (y && years.indexOf(y) === -1) years.push(y);
  });
  years.sort(function (a, b) { return Number(b) - Number(a); });

  var year = String(wantedYear || '').trim();
  if (!year || years.indexOf(year) === -1) year = years[0] || '';

  var days = active
    .filter(function (r) { return String(r.year).trim() === year; })
    .map(function (r) {
      return {
        year: Number(r.year),
        day_no: Number(r.day_no),
        date: asDateText(r.date),
        day_en: String(r.day_en || ''),
        day_te: String(r.day_te || ''),
        time: asTimeText(r.time),
        title_en: String(r.title_en || ''),
        title_te: String(r.title_te || ''),
        image: String(r.image || ''),
      };
    })
    .sort(function (a, b) { return a.day_no - b.day_no; });

  return { years: years, year: year, days: days };
}
