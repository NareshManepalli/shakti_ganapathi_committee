/**
 * SSGC — Funds Web App (the committee's money ledger)
 * ---------------------------------------------------------------------------
 * One dated row per movement of money: the monthly collection, and each thing
 * it was spent on. This is the sheet the committee kept by hand before the site
 * existed, so its shape is theirs, not one invented for the screen:
 *
 *   5/Nov/25  November Amount     3500          13000   Naresh, Rajesh, …
 *   11/Jan/26 Bhogi Celebrations         2000   17500
 *
 * DATE, YEAR AND MONTH ALL STORED
 *   January 2026 holds two rows — the collection on the 5th and Bhogi on the
 *   11th — so the date is what orders the ledger and what a balance is
 *   computed along. Year and month are written beside it because the committee
 *   reads this sheet directly and should not have to parse a date to filter it;
 *   both are derived from the date on every write, so they cannot disagree.
 *
 * SNO AND TRNSCTN_ID
 *   Two numbers doing two jobs. `sno` is the ledger's line number, renumbered
 *   1..N in date order on every write — an entry added for an earlier month
 *   lands in its right place and the rows after it move down, as they would on
 *   a bank statement. `trnsctn_id` never moves: it is handed out once and is
 *   what an edit or a delete names, because the line number under a row changes
 *   the moment anybody inserts an earlier one.
 *
 * WHY THIS IS NOT PART OF THE CONTENT WEB APP
 *   That one refuses anyone without adm_in = 1, and Monthly Funds is the screen
 *   every member reaches — the only screen a funds-only member can open. So the
 *   split here is by action, not by endpoint:
 *
 *     read   any member with a valid session
 *     write  adm_in = 1 only
 *
 * SETUP
 *  1. Make a sheet with this header row, exactly these names in any order —
 *     sheets/funds.csv is it, with the committee's history already in place:
 *       sno | trnsctn_id | date | year | month | credit | debit | balance
 *           | reason | fund_persons | a_in | i_ts | u_ts | d_ts
 *     The date column may be plain text or a real date column — both are read
 *     the same. If you leave it as a date, check the workbook's locale reads
 *     `05-10-2025` as 5 October and not 10 May: File -> Settings -> Locale.
 *  2. Put its id in FUNDS_SHEET_ID below.
 *  3. script.new -> paste this file -> Save.
 *  4. Give it the auth project's signing key, or every call is refused:
 *     open the AUTH project -> Project Settings -> Script Properties -> copy
 *     SESSION_SIGNING_KEY, then run setSigningKey('<that value>') here once.
 *  5. Deploy -> New deployment -> Web app, Execute as Me, access Anyone.
 *  6. Put the /exec URL in src/config/sheetsConfig.js -> api.funds.
 *  7. Run paintFundsSheet() once to colour the money columns of rows that are
 *     already there. New rows are coloured as they are written.
 * ---------------------------------------------------------------------------
 */

// The committee's funds workbook (id or full URL — both work).
// https://docs.google.com/spreadsheets/d/1qGY_P2g8Fg2pmWuj9iDGxW9Lc_GJplb3WxKYBxcZIg0/edit
var FUNDS_SHEET_ID = '1qGY_P2g8Fg2pmWuj9iDGxW9Lc_GJplb3WxKYBxcZIg0';

// The schedule workbook, read only to learn where each fund year begins and
// ends. Day 1 of a year is that year's celebration date, and annual_year beside
// it is what the committee calls the span it closes.
var SCHEDULE_SHEET_ID = '1rtsurWepUJlzebf2LczLO_2f_EZ0YXJ7M06plNLtGV8';


// Audit stamps are written in the committee's own time, not the workbook's.
//
// The funds workbook sits on America/Los_Angeles — Google's default, and not
// something worth changing under a sheet people already read — which put every
// i_ts and u_ts about thirteen and a half hours behind the person who caused
// it. A row added on Tuesday evening was stamped Monday afternoon.
//
// Date CELLS still use the workbook's zone: those have to round-trip to the day
// the sheet displays, and that is a different question from what time it is.
var COMMITTEE_TZ = 'Asia/Kolkata';

var SIGNING_KEY_PROP = 'SESSION_SIGNING_KEY';

// The same three fills the screen and the PDF statement use, so the sheet, the
// table and the printed page all read alike.
var FILL_CREDIT  = '#e7f4ec';
var FILL_DEBIT   = '#fdecef';
var FILL_BALANCE = '#e8f0fb';

var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December'];

// Transaction ids read as SSGC2025000001 — the committee, the year the ledger
// was opened, and a six-digit running number.
//
// The year is the one the ledger STARTED in, not the one the entry falls in, so
// it stays 2025 on a row added in 2027. That is what makes the number a plain
// sequence: an id names the entry, and the entry's own date is the column
// beside it. Change LEDGER_START_YEAR only if the whole ledger is restarted.
var LEDGER_PREFIX = 'SSGC';
var LEDGER_START_YEAR = 2025;
var LEDGER_SEQ_WIDTH = 6;

/* ----------------------------------------------------- the transactions tab */
//
// The working pot for a celebration, kept as a second tab in THIS workbook
// rather than a book of its own. The two are one movement apart — a transfer
// out of the fund is the opening credit here — and a single script owning both
// is what lets that be one write instead of two calls that can half-happen.
//
// Its own id prefix. A funds row and a transactions row are different things
// and must never be mistaken for each other in a message, a statement or a
// conversation, which "SSGC2025000004" and "TXN2025000004" cannot be.
var TRANSACTIONS_TAB = 'transactions';
var TXN_PREFIX = 'TXN';

// Column for column the funds sheet's order, so the two read the same way.
// `fund_persons` gives way to `paid_to` and `mode`: who was paid, and how,
// which is what a spend needs and a collection does not. `kind` marks the one
// opening row per year apart from the credits and spends that follow it.
var TRANSACTIONS_HEADER = [
  'sno', 'trnsctn_id', 'date', 'year', 'month',
  'credit', 'debit', 'balance',
  'annual_year', 'annual_yr_id',
  'kind', 'reason', 'paid_to', 'mode',
  'a_in', 'i_ts', 'u_ts', 'd_ts',
];

/* ------------------------------------------------------------------ utils */

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function fail(code, message) {
  return jsonOut({ ok: false, code: code, error: message });
}

var BOOK_ = null;

function fundsBook() {
  if (BOOK_) return BOOK_;
  var id = String(FUNDS_SHEET_ID || '');
  if (!id || id.indexOf('PASTE_') === 0) {
    throw new Error('FUNDS_SHEET_ID is not set in the script.');
  }
  BOOK_ = SpreadsheetApp.openById(id);
  return BOOK_;
}

function fundsSheet() {
  return fundsBook().getSheets()[0];
}

/** The transactions tab, or a plain instruction if it has not been made yet. */
function transactionsSheet() {
  var sheet = fundsBook().getSheetByName(TRANSACTIONS_TAB);
  if (!sheet) {
    throw new Error('No "' + TRANSACTIONS_TAB + '" tab in the funds workbook. '
      + 'Run createTransactionsTab() once from this editor.');
  }
  return sheet;
}

/**
 * Builds the transactions tab, once.
 *
 * Run from the Apps Script editor: Run ▸ createTransactionsTab. It refuses to
 * touch a tab that already exists rather than rewriting a header over rows
 * somebody has entered — running it twice by accident must cost nothing.
 *
 * The date column is forced to plain text. Left as automatic, Sheets reads
 * "05-10-2025" as a date and renders it back in whatever order the locale
 * prefers — which silently turns 5 October into 10 May, and the ledger's own
 * dd-mm-yyyy is no longer what the sheet holds.
 */
function createTransactionsTab() {
  var book = fundsBook();
  var existing = book.getSheetByName(TRANSACTIONS_TAB);
  if (existing) {
    Logger.log('The "' + TRANSACTIONS_TAB + '" tab already exists — nothing changed.');
    return;
  }

  var sheet = book.insertSheet(TRANSACTIONS_TAB);
  var head = sheet.getRange(1, 1, 1, TRANSACTIONS_HEADER.length);
  head.setValues([TRANSACTIONS_HEADER]);
  head.setFontWeight('bold');
  head.setFontColor('#ffffff');
  head.setBackground('#0e1b33');
  sheet.setFrozenRows(1);

  // The money columns wear the same three fills the screen and the statement
  // use, on the heading as well as on every row this script writes.
  var tint = { credit: FILL_CREDIT, debit: FILL_DEBIT, balance: FILL_BALANCE };
  TRANSACTIONS_HEADER.forEach(function (name, i) {
    if (tint[name]) sheet.getRange(1, i + 1).setFontColor('#0e1b33').setBackground(tint[name]);
  });

  var dateCol = TRANSACTIONS_HEADER.indexOf('date') + 1;
  sheet.getRange(2, dateCol, sheet.getMaxRows() - 1, 1).setNumberFormat('@');

  var widths = {
    sno: 55, trnsctn_id: 130, date: 95, year: 60, month: 90,
    credit: 90, debit: 90, balance: 95, annual_year: 105, annual_yr_id: 95,
    kind: 80, reason: 200, paid_to: 150, mode: 80,
    a_in: 55, i_ts: 140, u_ts: 140, d_ts: 140,
  };
  TRANSACTIONS_HEADER.forEach(function (name, i) {
    if (widths[name]) sheet.setColumnWidth(i + 1, widths[name]);
  });

  SpreadsheetApp.flush();
  Logger.log('Created "' + TRANSACTIONS_TAB + '" with '
    + TRANSACTIONS_HEADER.length + ' columns. It is empty — the screen writes the first row.');
}

/**
 * The workbook's timezone, NOT the script project's.
 *
 * A date cell is midnight in the timezone the spreadsheet keeps, and the two
 * settings are separate — a new script project defaults to America/Los_Angeles
 * whatever the sheet says. Format 5 October 00:00 IST in Los Angeles and it
 * prints as the 4th, so every date would be a day early and the wrong month at
 * the turn of one.
 */
function sheetTimeZone() {
  return fundsBook().getSpreadsheetTimeZone();
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

/**
 * A date cell as `dd-MM-yyyy`, the form the committee writes.
 *
 * The column may hold either text or a real date — Sheets reinterprets one as
 * the other depending on the column's format, and both have to read the same.
 * A real date is turned back into text HERE rather than left to JSON, which
 * would send a UTC instant that lands a day early for anyone west of the sheet.
 */
function asDateText(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, sheetTimeZone(), 'dd-MM-yyyy');
  }
  return String(value || '').trim();
}

/** `dd-MM-yyyy` -> `yyyyMMdd`, which sorts and compares as a plain number. */
function dateKey(text) {
  var m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(String(text || '').trim());
  if (!m) return 0;
  return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]);
}

function yearOfDate(text) {
  var m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(String(text || '').trim());
  return m ? m[3] : '';
}

function monthOfDate(text) {
  var m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(String(text || '').trim());
  return m ? (MONTHS[Number(m[2]) - 1] || '') : '';
}

function asNumber(value) {
  var n = Number(String(value === 0 ? '0' : (value || '')).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function writeRow(sheet, rowNumber, fields) {
  var header = headerOf(sheet);
  Object.keys(fields).forEach(function (key) {
    var c = header.indexOf(key);
    if (c >= 0) sheet.getRange(rowNumber, c + 1).setValue(fields[key]);
  });
}

function appendRow(sheet, fields) {
  var header = headerOf(sheet);
  var row = header.map(function (h) { return h && fields[h] !== undefined ? fields[h] : ''; });
  sheet.appendRow(row);
  return sheet.getLastRow();
}

/**
 * The next transaction id, generated rather than typed.
 *
 * Counted across every row including the soft-deleted ones, so a deleted entry
 * never has its id handed out again — an id that appeared on a statement once
 * must not come back meaning something else.
 */
function nextTrnsctnId(rows) {
  // The prefix is stripped by length rather than matched by pattern. A trailing
  // \d+ would swallow the year as well — SSGC2025000001 reads as two million,
  // and the next id comes out SSGC20252025000012.
  var prefix = LEDGER_PREFIX + LEDGER_START_YEAR;
  var max = 0;
  rows.forEach(function (r) {
    var id = String(r.trnsctn_id || '').trim();
    if (id.indexOf(prefix) !== 0) return;
    var n = Number(id.slice(prefix.length));
    if (!isNaN(n)) max = Math.max(max, n);
  });

  var n = String(max + 1);
  while (n.length < LEDGER_SEQ_WIDTH) n = '0' + n;
  return prefix + n;
}

/**
 * Fills in an id for any live row that has none.
 *
 * Run once after pasting in history kept elsewhere. Rows written through this
 * script get theirs on the way in, so this is only for what arrived by hand.
 */
function numberFundsRows() {
  var sheet = fundsSheet();
  var header = headerOf(sheet);
  var col = header.indexOf('trnsctn_id');
  if (col < 0) throw new Error('The sheet has no trnsctn_id column.');

  var rows = readRows(sheet);
  var filled = 0;
  rows.forEach(function (r) {
    if (String(r.trnsctn_id || '').trim()) return;
    sheet.getRange(r.__row, col + 1).setValue(nextTrnsctnId(readRows(sheet)));
    filled += 1;
  });
  SpreadsheetApp.flush();
  Logger.log('Numbered ' + filled + ' rows.');
}

/**
 * The fund years, oldest first, from the schedule sheet.
 *
 * A year ends when its own celebrations end, nine days after day 1 — money
 * spent on a celebration belongs to the fund that was collected for it. Read
 * once per request and cached: every row in a restate asks the same question.
 */
var YEARS_ = null;

function fundYears() {
  if (YEARS_) return YEARS_;
  YEARS_ = [];
  try {
    var sheet = SpreadsheetApp.openById(SCHEDULE_SHEET_ID).getSheets()[0];
    var rows = readRows(sheet);
    var starts = [];
    rows.forEach(function (r) {
      if (Number(r.day_no) !== 1) return;
      var d = r.date instanceof Date
        ? Utilities.formatDate(r.date, sheetTimeZone(), 'dd-MM-yyyy')
        : String(r.date || '').trim();
      // The schedule stores yyyy-MM-dd; accept either shape.
      var iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
      if (iso) d = iso[3] + '-' + iso[2] + '-' + iso[1];
      if (!dateKey(d)) return;
      starts.push({ key: dateKey(d), annual: String(r.annual_year || '').trim() });
    });
    starts.sort(function (a, b) { return a.key - b.key; });

    var previous = 0;
    starts.forEach(function (st) {
      // nine days of celebrations, day 1 included
      var d = String(st.key);
      var end = new Date(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)) + FESTIVAL_DAYS_ - 1);
      var endKey = end.getFullYear() * 10000 + (end.getMonth() + 1) * 100 + end.getDate();
      YEARS_.push({ from: previous + 1, to: endKey, annual: st.annual });
      previous = endKey;
    });
  } catch (e) {
    YEARS_ = [];
  }
  return YEARS_;
}

var FESTIVAL_DAYS_ = 9;

/** What the committee calls the year a date falls in, or '' if unknown. */
function annualYearFor(dateText) {
  var k = dateKey(dateText);
  if (!k) return '';
  var years = fundYears();
  for (var i = 0; i < years.length; i++) {
    if (k >= years[i].from && k <= years[i].to) return years[i].annual;
  }
  return '';
}

/** Green for money in, red for money out, blue for the balance. */
function paintRow(sheet, rowNumber) {
  var header = headerOf(sheet);
  var pairs = [['credit', FILL_CREDIT], ['debit', FILL_DEBIT], ['balance', FILL_BALANCE]];
  pairs.forEach(function (p) {
    var c = header.indexOf(p[0]);
    if (c >= 0) sheet.getRange(rowNumber, c + 1).setBackground(p[1]);
  });
}

/**
 * Colours every existing row. Run once after pasting in history the committee
 * kept elsewhere — writes through this script colour themselves.
 */
function paintFundsSheet() {
  var sheet = fundsSheet();
  var rows = readRows(sheet);
  rows.forEach(function (r) { paintRow(sheet, r.__row); });
  SpreadsheetApp.flush();
  Logger.log('Painted ' + rows.length + ' rows.');
}

/**
 * A short, safe fingerprint of a signing key.
 *
 * "Present: yes" is not the same as "correct": a key pasted with a stray space
 * or newline is present and still verifies nothing, and the failure that
 * follows looks exactly like an expired session. This says enough to compare
 * two projects' keys and nothing like enough to reconstruct one.
 */
function keyFingerprint(key) {
  if (!key) return 'absent';
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, key);
  return 'len=' + key.length
    + ' sha=' + Utilities.base64Encode(digest).slice(0, 10)
    + (key !== key.trim() ? '  ** HAS LEADING/TRAILING WHITESPACE **' : '');
}

/**
 * Run once to confirm the key is in place and the sheet opens.
 *
 * Paste this same function into the AUTH project and run it there too — the two
 * fingerprints must match exactly, or every call from the portal is refused
 * with "your session has ended" no matter how recently anybody signed in.
 */
function checkFunds() {
  var key = PropertiesService.getScriptProperties().getProperty(SIGNING_KEY_PROP);
  Logger.log('Signing key: ' + keyFingerprint(key));
  try {
    Logger.log('funds rows: ' + readRows(fundsSheet()).length);
    Logger.log('sheet timezone: ' + sheetTimeZone());
  } catch (e) {
    Logger.log('funds FAILED: ' + e.message);
  }
}

/* ------------------------------------------------------------------- auth */

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

/** Run once, pasting in the value the auth project's initAuth() created. */
function setSigningKey(key) {
  if (!key) { Logger.log("Pass the auth project's signing key as the argument."); return; }
  PropertiesService.getScriptProperties().setProperty(SIGNING_KEY_PROP, key);
  Logger.log('Signing key stored. The portal can now read and write the funds.');
}

/**
 * Any signed-in member. The ledger is what a funds-only member comes for.
 *
 * A missing key is told apart from a bad token on purpose. Both refuse the
 * caller, but only one is the member's problem — reporting "your session has
 * ended" to somebody who signed in ten seconds ago sends them round the sign-in
 * loop forever while the actual fault is a Script Property nobody has set.
 */
function requireMember(body) {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty(SIGNING_KEY_PROP)) {
    // The names of what IS set are reported back. They are not secrets, and
    // they answer in one look what guessing cannot: an empty list means the key
    // went into a different project, and a list with a near-miss in it means
    // the name was mistyped.
    var have = props.getKeys();
    throw new Error(
      'The funds service has no ' + SIGNING_KEY_PROP + ' in its Script Properties. '
      + (have.length
        ? 'This project currently holds: ' + have.join(', ') + '.'
        : 'This project holds no script properties at all.')
    );
  }
  var claims = verifySessionToken(body.token);
  if (!claims) throw new Error('Your session has ended. Please sign in again.');
  return claims;
}

/** Changing the ledger is a different matter — full access only. */
function requireAdmin(body) {
  var claims = requireMember(body);
  if (Number(claims.adm) !== 1) throw new Error('You do not have permission to edit the funds.');
  return claims;
}

/* -------------------------------------------------------------- READ (GET) */

/** The live rows, oldest first, shaped for the screen. */
function ledger() {
  return readRows(fundsSheet())
    .filter(function (r) { return String(r.a_in === undefined ? '1' : r.a_in).trim() === '1'; })
    .map(function (r) {
      var date = asDateText(r.date);
      return {
        sno: Number(r.sno) || 0,
        trnsctn_id: String(r.trnsctn_id || ''),
        date: date,
        // Sent as stored, but the screen trusts the date: a row whose year or
        // month was typed by hand can disagree, and the date is the one that
        // orders the ledger.
        year: String(r.year || yearOfDate(date)),
        month: String(r.month || monthOfDate(date)),
        credit: asNumber(r.credit),
        debit: asNumber(r.debit),
        balance: asNumber(r.balance),
        annual_year: String(r.annual_year || ''),
        annual_yr_id: String(r.annual_yr_id || ''),
        reason: String(r.reason || ''),
        fund_persons: String(r.fund_persons || ''),
        __k: dateKey(date),
      };
    })
    .sort(function (a, b) {
      // Date first, then sno — two movements on the same day keep the order
      // they were entered in, which is how a bank statement reads.
      if (a.__k !== b.__k) return a.__k - b.__k;
      return a.sno - b.sno;
    })
    .map(function (r) { delete r.__k; return r; });
}

function doGet(e) {
  var params = (e && e.parameter) || {};
  try {
    requireMember({ token: params.token });
  } catch (err) {
    return fail('UNAUTHORIZED', err.message);
  }
  try {
    // ?what=txns for the working pot, nothing for the fund. Two screens read
    // this endpoint and neither wants the other's rows, so asking for both on
    // every load would double the slowest call on the slowest service here.
    if (String(params.what || '').trim() === 'txns') {
      return jsonOut({ ok: true, txns: txnLedger() });
    }
    return jsonOut({ ok: true, funds: ledger() });
  } catch (err) {
    return fail('SERVER_ERROR', String(err && err.message ? err.message : err));
  }
}

/* ------------------------------------------------------------- WRITE (POST)
 *   { action:'saveFund',   token, entry:{ trnsctn_id?, date, reason, credit, debit, fund_persons } }
 *   { action:'deleteFund', token, trnsctn_id }
 *
 * Deletes are soft, as everywhere else in the workbook: a_in goes to 0 and the
 * row stays, so a mistaken click is one cell away from being undone.
 */
function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
    requireAdmin(body);

    var action = String(body.action || '').trim();
    if (action === 'saveFund')   return saveFund(body);
    if (action === 'deleteFund') return deleteFund(body);
    if (action === 'saveTxn')    return saveTxn(body);
    if (action === 'deleteTxn')  return deleteTxn(body);
    return fail('UNKNOWN_ACTION', 'Unknown action: ' + action);
  } catch (err) {
    return fail('SERVER_ERROR', String(err && err.message ? err.message : err));
  }
}

function saveFund(body) {
  var entry = body.entry || {};
  var date = String(entry.date || '').trim();
  if (!dateKey(date)) return fail('BAD_DATE', 'Give the entry a date as dd-mm-yyyy.');

  var credit = asNumber(entry.credit);
  var debit = asNumber(entry.debit);
  if (credit < 0 || debit < 0) return fail('BAD_AMOUNT', 'Amounts cannot be negative.');
  if (!credit && !debit) return fail('BAD_AMOUNT', 'Enter an amount in or out.');
  // One row is one movement. Both filled in would make the balance ambiguous
  // and the statement unreadable — split it into two entries instead.
  if (credit && debit) return fail('BAD_AMOUNT', 'An entry is money in or money out, not both.');

  var sheet = fundsSheet();
  var rows = readRows(sheet);

  // Year and month are written from the date rather than taken from the caller,
  // so the three can never tell different stories about the same row.
  var fields = {
    date: date,
    year: yearOfDate(date),
    month: monthOfDate(date),
    credit: credit || '',
    debit: debit || '',
    reason: String(entry.reason || ''),
    fund_persons: String(entry.fund_persons || ''),
    u_ts: stamp(),
  };

  // Typed values win. Left blank they are worked out from the date against the
  // schedule sheet, so the common case needs nothing entered — but a committee
  // that numbers a year differently from the way this infers it can say so, and
  // restate() will not argue.
  if (String(entry.annual_year || '').trim()) fields.annual_year = String(entry.annual_year).trim();
  if (String(entry.annual_yr_id || '').trim()) fields.annual_yr_id = String(entry.annual_yr_id).trim();

  // Found by transaction id, never by line number: sno is renumbered on every
  // write, so the row sitting at line 5 now is not the one that was there when
  // the drawer was opened.
  var existing = null;
  if (entry.trnsctn_id) {
    rows.forEach(function (r) {
      if (String(r.trnsctn_id) === String(entry.trnsctn_id)) existing = r;
    });
  }

  if (existing) {
    writeRow(sheet, existing.__row, fields);
  } else {
    fields.trnsctn_id = nextTrnsctnId(rows);
    fields.a_in = 1;
    fields.i_ts = stamp();
    appendRow(sheet, fields);
  }

  restate(sheet);
  SpreadsheetApp.flush();
  return jsonOut({ ok: true, funds: ledger() });
}

function deleteFund(body) {
  var id = String(body.trnsctn_id || '').trim();
  if (!id) return fail('BAD_ID', 'Which entry?');

  var sheet = fundsSheet();
  var target = null;
  readRows(sheet).forEach(function (r) { if (String(r.trnsctn_id) === id) target = r; });
  if (!target) return fail('NOT_FOUND', 'That entry is no longer there.');

  writeRow(sheet, target.__row, { a_in: 0, d_ts: stamp() });
  restate(sheet);
  SpreadsheetApp.flush();
  return jsonOut({ ok: true, funds: ledger() });
}

/**
 * Puts the ledger back in order after any write.
 *
 * Renumbers sno 1..N in date order, rewrites the running balance along it, and
 * repaints the money columns. All three are consequences of one entry — adding
 * a January row when February is already there moves every line after it, and a
 * sheet the committee reads directly has to show that rather than leave them to
 * work it out.
 */
function restate(sheet) {
  var header = headerOf(sheet);
  var colSno = header.indexOf('sno');
  var colBal = header.indexOf('balance');

  var live = readRows(sheet)
    .filter(function (r) { return String(r.a_in === undefined ? '1' : r.a_in).trim() === '1'; })
    .map(function (r) { r.__k = dateKey(asDateText(r.date)); return r; })
    .sort(function (a, b) {
      if (a.__k !== b.__k) return a.__k - b.__k;
      return (Number(a.sno) || 0) - (Number(b.sno) || 0);
    });

  var colAnnual = header.indexOf('annual_year');

  var running = 0;
  live.forEach(function (r, i) {
    running += asNumber(r.credit) - asNumber(r.debit);
    if (colSno >= 0) sheet.getRange(r.__row, colSno + 1).setValue(i + 1);
    if (colBal >= 0) sheet.getRange(r.__row, colBal + 1).setValue(running);
    // Written rather than typed, so the sheet reads standalone and cannot
    // disagree with the screen about which year a row belongs to.
    if (colAnnual >= 0 && !String(r.annual_year || '').trim()) {
      sheet.getRange(r.__row, colAnnual + 1).setValue(annualYearFor(asDateText(r.date)));
    }
    paintRow(sheet, r.__row);
  });
}

/* ==========================================================================
   TRANSACTIONS — the working pot
   ==========================================================================
   The second tab of this workbook. The fund is what the committee collected
   over the year; this is the pot they spend from during the celebration, and
   the two are one movement apart: a debit in the fund is the opening credit
   here. Kept in the same script for that reason — the transfer is a single
   write, where two endpoints could leave the books half-moved.

   Everything below reuses the funds machinery. readRows, writeRow, appendRow
   and restate all take a sheet, and restate in particular is the whole of the
   arithmetic: renumber, rewrite the running balance, stamp the fund year,
   repaint. A transactions row obeys the same rules because it runs through the
   same code, not because two copies were kept in step.
   ========================================================================== */

/** The next TXN id. Same reasoning as nextTrnsctnId — stripped by length. */
function nextTxnId(rows) {
  var prefix = TXN_PREFIX + LEDGER_START_YEAR;
  var max = 0;
  rows.forEach(function (r) {
    var id = String(r.trnsctn_id || '').trim();
    if (id.indexOf(prefix) !== 0) return;
    var n = Number(id.slice(prefix.length));
    if (!isNaN(n)) max = Math.max(max, n);
  });
  var next = String(max + 1);
  while (next.length < LEDGER_SEQ_WIDTH) next = '0' + next;
  return prefix + next;
}

/** The live transactions, oldest first, shaped for the screen. */
function txnLedger() {
  return readRows(transactionsSheet())
    .filter(function (r) { return String(r.a_in === undefined ? '1' : r.a_in).trim() === '1'; })
    .map(function (r) {
      var date = asDateText(r.date);
      return {
        sno: Number(r.sno) || 0,
        trnsctn_id: String(r.trnsctn_id || ''),
        date: date,
        year: String(r.year || yearOfDate(date)),
        month: String(r.month || monthOfDate(date)),
        credit: asNumber(r.credit),
        debit: asNumber(r.debit),
        balance: asNumber(r.balance),
        annual_year: String(r.annual_year || ''),
        annual_yr_id: String(r.annual_yr_id || ''),
        kind: String(r.kind || (asNumber(r.credit) ? 'credit' : 'spend')),
        reason: String(r.reason || ''),
        paid_to: String(r.paid_to || ''),
        mode: String(r.mode || ''),
        __k: dateKey(date)
      };
    })
    .sort(function (a, b) {
      if (a.__k !== b.__k) return a.__k - b.__k;
      return a.sno - b.sno;
    })
    .map(function (r) { delete r.__k; return r; });
}

/** Which fund year a row belongs to, however it was filled in. */
function txnYearKey(row) {
  var id = String(row.annual_yr_id || '').trim();
  if (id) return 'id:' + id;
  return 'yr:' + String(row.annual_year || annualYearFor(asDateText(row.date)) || '').trim();
}

/**
 * Adds or updates one transaction.
 *
 *   { action:'saveTxn', token, entry:{ trnsctn_id?, date, kind, credit, debit,
 *                                      reason, paid_to, mode, annual_year?,
 *                                      annual_yr_id?, mirror? } }
 *
 * An `opening` row also writes the matching debit into the funds sheet, in this
 * same call, so the money cannot be in both books at once. `mirror: false`
 * skips that — for a committee that already entered the transfer by hand.
 */
function saveTxn(body) {
  var entry = body.entry || {};
  var date = String(entry.date || '').trim();
  if (!dateKey(date)) return fail('BAD_DATE', 'Give the transaction a date as dd-mm-yyyy.');

  var kind = String(entry.kind || '').trim().toLowerCase();
  if (kind !== 'opening' && kind !== 'credit' && kind !== 'spend') {
    return fail('BAD_KIND', 'A transaction is an opening, money in or money out.');
  }

  var credit = asNumber(entry.credit);
  var debit = asNumber(entry.debit);
  // The kind decides the direction, so only one amount can survive — the screen
  // sends a single box. Anything else is a caller that has lost track of which
  // way the money went, and guessing on its behalf is how a ledger goes wrong.
  if (kind === 'spend') { credit = 0; } else { debit = 0; }
  var amount = kind === 'spend' ? debit : credit;
  if (amount <= 0) return fail('BAD_AMOUNT', 'Enter an amount.');

  var reason = String(entry.reason || '').trim();
  if (!reason) return fail('BAD_REASON', 'Say what this transaction was for.');

  var sheet = transactionsSheet();
  var rows = readRows(sheet);
  var live = rows.filter(function (r) {
    return String(r.a_in === undefined ? '1' : r.a_in).trim() === '1';
  });

  var existing = null;
  if (entry.trnsctn_id) {
    rows.forEach(function (r) {
      if (String(r.trnsctn_id) === String(entry.trnsctn_id)) existing = r;
    });
  }

  var fields = {
    date: date,
    year: yearOfDate(date),
    month: monthOfDate(date),
    credit: credit || '',
    debit: debit || '',
    kind: kind,
    reason: reason,
    paid_to: String(entry.paid_to || ''),
    mode: String(entry.mode || ''),
    u_ts: stamp()
  };
  if (String(entry.annual_year || '').trim()) fields.annual_year = String(entry.annual_year).trim();
  if (String(entry.annual_yr_id || '').trim()) fields.annual_yr_id = String(entry.annual_yr_id).trim();

  // One opening a year. A second would make "what the pot started with" a
  // question with two answers, and every balance below it arguable.
  if (kind === 'opening') {
    var wantKey = txnYearKey({
      date: date,
      annual_year: fields.annual_year,
      annual_yr_id: fields.annual_yr_id
    });
    var clash = null;
    live.forEach(function (r) {
      if (String(r.kind || '').trim().toLowerCase() !== 'opening') return;
      if (existing && String(r.trnsctn_id) === String(existing.trnsctn_id)) return;
      if (txnYearKey(r) === wantKey) clash = r;
    });
    if (clash) {
      return fail('OPENING_EXISTS',
        'This fund year already has an opening amount (' + String(clash.trnsctn_id)
        + '). Edit that one instead of adding a second.');
    }
  }

  var id;
  if (existing) {
    id = String(existing.trnsctn_id);
    writeRow(sheet, existing.__row, fields);
  } else {
    id = nextTxnId(rows);
    fields.trnsctn_id = id;
    fields.a_in = 1;
    fields.i_ts = stamp();
    appendRow(sheet, fields);
  }

  restate(sheet);

  // The other half of the movement. Written after the transactions row so its
  // id can be named in the funds row, which is what lets the pair be found
  // again — and read plainly by anyone looking at the sheet itself.
  if (kind === 'opening' && entry.mirror !== false) mirrorOpeningToFunds(id, date, amount);

  SpreadsheetApp.flush();
  return jsonOut({ ok: true, txns: txnLedger(), funds: ledger() });
}

/**
 * Records the transfer out of the fund that an opening row represents.
 *
 * The link lives in the funds row's own remark — "Transferred to transactions
 * (TXN2025000001)" — rather than in a new column. It costs the committee no
 * sheet change, it survives a copy-paste, and it says what it is to somebody
 * reading the sheet directly, which a hidden id column would not.
 */
function mirrorOpeningToFunds(txnId, date, amount) {
  var sheet = fundsSheet();
  var rows = readRows(sheet);
  var mark = '(' + txnId + ')';

  var existing = null;
  rows.forEach(function (r) {
    if (String(r.reason || '').indexOf(mark) >= 0) existing = r;
  });

  var fields = {
    date: date,
    year: yearOfDate(date),
    month: monthOfDate(date),
    credit: '',
    debit: amount,
    reason: 'Transferred to transactions ' + mark,
    u_ts: stamp()
  };

  if (existing) {
    writeRow(sheet, existing.__row, fields);
  } else {
    fields.trnsctn_id = nextTrnsctnId(rows);
    fields.a_in = 1;
    fields.i_ts = stamp();
    appendRow(sheet, fields);
  }
  restate(sheet);
}

/**
 * Soft-deletes one transaction.
 *
 * An opening row cannot go while entries stand on it: every balance below it
 * is measured from that figure, and removing it would silently restate the
 * whole year rather than fail.
 */
function deleteTxn(body) {
  var id = String(body.trnsctn_id || '').trim();
  if (!id) return fail('BAD_ID', 'Which transaction?');

  var sheet = transactionsSheet();
  var live = readRows(sheet).filter(function (r) {
    return String(r.a_in === undefined ? '1' : r.a_in).trim() === '1';
  });

  var target = null;
  live.forEach(function (r) { if (String(r.trnsctn_id) === id) target = r; });
  if (!target) return fail('NOT_FOUND', 'That transaction is no longer there.');

  if (String(target.kind || '').trim().toLowerCase() === 'opening') {
    var key = txnYearKey(target);
    var others = 0;
    live.forEach(function (r) {
      if (String(r.trnsctn_id) === id) return;
      if (txnYearKey(r) === key) others += 1;
    });
    if (others) {
      return fail('OPENING_IN_USE',
        'This year has ' + others + ' transaction' + (others === 1 ? '' : 's')
        + ' standing on that opening amount. Remove them first, or edit the amount instead.');
    }
  }

  writeRow(sheet, target.__row, { a_in: 0, d_ts: stamp() });
  restate(sheet);
  SpreadsheetApp.flush();
  return jsonOut({ ok: true, txns: txnLedger(), funds: ledger() });
}
