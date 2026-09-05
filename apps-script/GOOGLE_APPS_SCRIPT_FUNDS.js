/**
 * SSGC — Funds & Transactions Web App (the committee's two money ledgers)
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
 *   is moved to its right place on the sheet and the rows after it move down,
 *   as they would on a bank statement. `trnsctn_id` never moves: it is handed
 *   out once and is what an edit or a delete names, because the line number
 *   under a row changes the moment anybody inserts an earlier one.
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
 *     The date column is kept as PLAIN TEXT, `dd-MM-yyyy`, by this script. It
 *     cannot be left to the workbook: a Google Sheet on the default US locale
 *     reads a typed "05-08-2026" as the 8th of May, and a ledger row then
 *     carries a date its own month column contradicts. Every write formats
 *     the cell as text before filling it, and restate() below turns any cell
 *     the sheet has already converted back into the day that was meant.
 *  2. Put its id in FUNDS_SHEET_ID below.
 *  3. script.new -> paste this file -> Save.
 *  4. Give it the auth project's signing key, or every call is refused:
 *     open the AUTH project -> Project Settings -> Script Properties -> copy
 *     SESSION_SIGNING_KEY, then run setSigningKey('<that value>') here once.
 *  5. Deploy -> New deployment -> Web app, Execute as Me, access Anyone.
 *  6. Put the /exec URL in src/config/sheetsConfig.js -> api.funds.
 *  7. Run repairFundsSheet() once. It puts the rows that are already there in
 *     date order, renumbers them, rewrites the running balance, mends any date
 *     the workbook mangled and colours the money columns. Every write after
 *     that does the same for itself.
 *
 * THE SECOND LEDGER
 *   Transactions — the pot the committee spends from during a celebration —
 *   lives in its own workbook, and this script serves both:
 *
 *     GET  ?token=…                 the fund
 *     GET  ?what=txns&token=…       the pot
 *     POST saveTxn / deleteTxn      write the pot
 *
 *   One script rather than two, because the two books are one movement apart:
 *   the pot's opening row IS a transfer out of the fund, and saving it writes
 *   that debit into the funds sheet in the same call. Split across two
 *   deployments, that movement could half-happen.
 *
 *  8. Put the transactions workbook's id in TRANSACTIONS_SHEET_ID below.
 *  9. Run setupTransactionsSheet() once to write its header — or, if the
 *     header was typed by hand, run repairTransactionsSheet() once instead.
 * 10. Run checkTransactions() to confirm this project can reach all three
 *     books and holds the signing key, before wondering why a screen is blank.
 *
 * WHAT WENT WRONG BEFORE, AND WHAT NOW HOLDS IT RIGHT
 *   Rows were appended to the bottom of the sheet and only their line numbers
 *   were reordered, so an entry for an earlier month sat last on the sheet
 *   with a number from the middle. And the date went in as a bare string,
 *   which the workbook parsed month-first — 05-08-2026 became 8 May — so the
 *   row sorted into the wrong month, and the screen, reading the mangled
 *   date back, could not find the entry it had just written and reported the
 *   save as failed; a second press then put the row in twice.
 *
 *   Now every write ends in restate(): the date column is text, the rows are
 *   physically in date order with retired rows below the live ones, sno runs
 *   1..N down the page, and the balance is rewritten along it. Writes take a
 *   script lock, because a whole-block rewrite that overlapped another would
 *   lose a row.
 * ---------------------------------------------------------------------------
 */

// The committee's funds workbook (id or full URL — both work).
// https://docs.google.com/spreadsheets/d/13Tssnt0f8pLXj54kBCf8eefsv7e8_CqYODi1ws3buZk/edit
var FUNDS_SHEET_ID = '13Tssnt0f8pLXj54kBCf8eefsv7e8_CqYODi1ws3buZk';

// The schedule workbook, read only to learn where each fund year begins and
// ends. Day 1 of a year is that year's celebration date, and annual_year beside
// it is what the committee calls the span it closes.
var SCHEDULE_SHEET_ID = '1nZcSPH0WQY5xmZtcWhGo2r_VazkZX0B8SKFVLlSLEFo';

// The transactions workbook — the working pot, kept as its own book at the
// committee's instruction rather than as a second tab here.
// https://docs.google.com/spreadsheets/d/1swn7831hxQmCaMDsi_xbCmRoJLx5fBN1nDw7571_GbM/edit
var TRANSACTIONS_SHEET_ID = '1swn7831hxQmCaMDsi_xbCmRoJLx5fBN1nDw7571_GbM';


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

/* ---------------------------------------------------- the transactions book */
//
// The working pot for a celebration, in its own workbook. The two ledgers are
// one movement apart — a transfer out of the fund is the opening credit here —
// and this one script opens both books, which is what lets that transfer be a
// single write rather than two calls that can leave the books half-moved. Two
// workbooks, one owner: the separation is the committee's filing, not a second
// service.
//
// Its own id prefix. A funds row and a transactions row are different things
// and must never be mistaken for each other in a message, a statement or a
// conversation, which "SSGC2025000004" and "TXN2025000004" cannot be.
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
  // Who last touched the row — written from the signed token's name on every
  // save and delete, never from anything the caller typed. Last at the sheet's
  // edge so the committee's familiar column order stays where it was.
  'trnsfr_nm',
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

var TXN_BOOK_ = null;

function transactionsBook() {
  if (TXN_BOOK_) return TXN_BOOK_;
  var id = String(TRANSACTIONS_SHEET_ID || '');
  if (!id || id.indexOf('PASTE_') === 0) {
    throw new Error('TRANSACTIONS_SHEET_ID is not set in the script.');
  }
  TXN_BOOK_ = SpreadsheetApp.openById(id);
  return TXN_BOOK_;
}

function transactionsSheet() {
  return transactionsBook().getSheets()[0];
}

/**
 * The transactions workbook's own timezone.
 *
 * Its own, not the funds book's. They are separate files and each carries its
 * own locale — read a transactions date cell in the funds book's zone and every
 * date could land a day out, which is the exact fault this pair of functions
 * exists to prevent.
 */
function txnTimeZone() {
  return transactionsBook().getSpreadsheetTimeZone();
}

/**
 * Prepares the transactions workbook, once.
 *
 * Run from the Apps Script editor: Run ▸ setupTransactionsSheet. It writes the
 * header, freezes it, tints the money columns and sets sensible widths. It
 * refuses a sheet that already has a header rather than writing over rows
 * somebody has entered — running it twice by accident must cost nothing.
 *
 * The date column is forced to plain text. Left as automatic, Sheets reads
 * "05-10-2025" as a date and renders it back in whatever order the locale
 * prefers — which silently turns 5 October into 10 May, and the ledger's own
 * dd-mm-yyyy is no longer what the sheet holds.
 */
function setupTransactionsSheet() {
  var sheet = transactionsSheet();

  var width = sheet.getLastColumn();
  if (width > 0) {
    var first = sheet.getRange(1, 1, 1, width).getValues()[0]
      .filter(function (v) { return String(v || '').trim() !== ''; });
    if (first.length) {
      Logger.log('That sheet already has a header (' + first.join(', ') + ') — nothing changed.');
      return;
    }
  }

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
    a_in: 55, i_ts: 140, u_ts: 140, d_ts: 140
  };
  TRANSACTIONS_HEADER.forEach(function (name, i) {
    if (widths[name]) sheet.setColumnWidth(i + 1, widths[name]);
  });

  SpreadsheetApp.flush();
  Logger.log('Prepared "' + sheet.getName() + '" with '
    + TRANSACTIONS_HEADER.length + ' columns. It is empty — the screen writes the first row.');
}

/**
 * Says whether this project can reach everything it needs.
 *
 * Three books and a signing key, checked in one run — because "the screen is
 * blank" looks the same whether the id is wrong, the sheet was never shared, or
 * the key went into a different project.
 */
function checkTransactions() {
  var out = [];
  try { out.push('funds: ' + fundsBook().getName() + ' (' + sheetTimeZone() + ')'); }
  catch (e) { out.push('funds: FAILED — ' + e.message); }
  try {
    var sh = transactionsSheet();
    out.push('transactions: ' + transactionsBook().getName() + ' / tab "' + sh.getName()
      + '" (' + txnTimeZone() + '), ' + Math.max(0, sh.getLastRow() - 1) + ' rows');
    out.push('header: ' + headerOf(sh).join(', '));
  } catch (e) { out.push('transactions: FAILED — ' + e.message); }
  try { out.push('schedule: ' + SpreadsheetApp.openById(SCHEDULE_SHEET_ID).getName()); }
  catch (e) { out.push('schedule: FAILED — ' + e.message); }
  out.push('signing key: ' + keyFingerprint(
    PropertiesService.getScriptProperties().getProperty(SIGNING_KEY_PROP)));
  Logger.log(out.join(String.fromCharCode(10)));
  return out.join(String.fromCharCode(10));
}

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

function pad2(n) {
  var s = String(n);
  return s.length < 2 ? '0' + s : s;
}

/**
 * Typed date text tidied into `dd-MM-yyyy`, the form the committee writes.
 *
 * 5/8/2026, 05.08.2026, 2026-08-05 and 05-08-26 all mean the same day and all
 * come out as 05-08-2026. Anything else is handed back as it was, trimmed —
 * a value nobody can parse is still something somebody typed.
 */
function normaliseDateText(value) {
  var s = String(value === undefined || value === null ? '' : value).trim();
  var m;
  if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/.exec(s))) return pad2(m[3]) + '-' + pad2(m[2]) + '-' + m[1];
  if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/.exec(s))) return pad2(m[1]) + '-' + pad2(m[2]) + '-' + m[3];
  if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2})$/.exec(s))) return pad2(m[1]) + '-' + pad2(m[2]) + '-20' + m[3];
  return s;
}

/** 1..12 for a month name or its first three letters, 0 for anything else. */
function monthIndex(name) {
  var s = String(name || '').trim().toLowerCase().slice(0, 3);
  if (!s) return 0;
  for (var i = 0; i < MONTHS.length; i++) {
    if (MONTHS[i].toLowerCase().slice(0, 3) === s) return i + 1;
  }
  return 0;
}

/**
 * A date cell as `dd-MM-yyyy`, however it arrived.
 *
 * Text is tidied (see normaliseDateText). A real Date is what Sheets made of a
 * string it decided to parse for itself, and in a workbook on the default US
 * locale it parses month-first: "05-08-2026" written by this script came back
 * as the 8th of May. The month column beside it was written from the string
 * before the workbook got to it, so when the two disagree and swapping day and
 * month makes them agree, the swap is the correction. Only a Date is ever
 * swapped — text stands as typed. A bare serial number (a date cell whose
 * format was changed under it) is turned back into its day too.
 *
 * A real date is turned into text HERE rather than left to JSON, which would
 * send a UTC instant that lands a day early for anyone west of the sheet.
 */
function mendDate(value, monthName, tz) {
  if (typeof value === 'number' && value > 20000) {
    // Days since 30 December 1899, which is how the sheet counts.
    value = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    tz = 'UTC';
  }
  if (!(value instanceof Date)) return normaliseDateText(value);

  var text = Utilities.formatDate(value, tz || sheetTimeZone(), 'dd-MM-yyyy');
  var m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text);
  if (!m) return text;

  var day = Number(m[1]);
  var month = Number(m[2]);
  var want = monthIndex(monthName);
  if (want && want !== month && want === day && month <= 12) {
    return pad2(month) + '-' + pad2(day) + '-' + m[3];
  }
  return text;
}

/** mendDate without a month column to check against. */
function asDateText(value, tz) {
  return mendDate(value, '', tz);
}

/** `dd-MM-yyyy` -> `yyyyMMdd`, which sorts and compares as a plain number. */
function dateKey(text) {
  var m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(normaliseDateText(text));
  if (!m) return 0;
  return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]);
}

function yearOfDate(text) {
  var m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(normaliseDateText(text));
  return m ? m[3] : '';
}

function monthOfDate(text) {
  var m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(normaliseDateText(text));
  return m ? (MONTHS[Number(m[2]) - 1] || '') : '';
}

function asNumber(value) {
  var n = Number(String(value === 0 ? '0' : (value || '')).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

/**
 * The date column, forced to plain text before anything is written into it.
 *
 * Set on the cell first and the value second: a cell that is already text
 * keeps "05-08-2026" as the six characters it is, where an automatic cell
 * parses them into whatever day the workbook's locale prefers. The other
 * order would show a date cell's serial number as text and fix nothing.
 */
function textDateCell(sheet, rowNumber) {
  var c = headerOf(sheet).indexOf('date');
  if (c >= 0) sheet.getRange(rowNumber, c + 1).setNumberFormat('@');
}

function writeRow(sheet, rowNumber, fields) {
  var header = headerOf(sheet);
  if (fields.date !== undefined) textDateCell(sheet, rowNumber);
  Object.keys(fields).forEach(function (key) {
    var c = header.indexOf(key);
    if (c >= 0) sheet.getRange(rowNumber, c + 1).setValue(fields[key]);
  });
}

/**
 * Adds a row after the last one with anything in it.
 *
 * Written by range rather than with appendRow(), because the date cell has to
 * be made text before the value lands in it, and appendRow() gives no chance
 * to do that. The sheet is grown if the row would fall off its end.
 */
function appendRow(sheet, fields) {
  var header = headerOf(sheet);
  var row = header.map(function (h) { return h && fields[h] !== undefined ? fields[h] : ''; });
  var rowNumber = sheet.getLastRow() + 1;
  if (rowNumber > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rowNumber - sheet.getMaxRows());
  }
  textDateCell(sheet, rowNumber);
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  return rowNumber;
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

/**
 * Puts an existing sheet right, once.
 *
 * Run from the Apps Script editor: Run ▸ repairFundsSheet, and the same for
 * the transactions book. It is restate() — what every write already does —
 * run over rows that arrived some other way: pasted-in history, rows the old
 * script appended out of order, dates the workbook parsed into the wrong
 * month. Nothing is deleted; rows are moved into date order, renumbered,
 * their balances rewritten, their dates made text, the money columns coloured.
 * Running it twice costs nothing but a moment.
 */
function repairFundsSheet() {
  return repairSheet_(fundsSheet(), 'funds');
}

function repairTransactionsSheet() {
  return repairSheet_(transactionsSheet(), 'transactions');
}

function repairSheet_(sheet, name) {
  var done = restate(sheet);
  SpreadsheetApp.flush();
  var line = name + ': ' + done.rows + ' row' + (done.rows === 1 ? '' : 's')
    + ' (' + done.live + ' live) now in date order; '
    + done.mended + ' date cell' + (done.mended === 1 ? '' : 's')
    + ' rewritten as dd-MM-yyyy text.';
  Logger.log(line);
  return line;
}

/** The old name for repairFundsSheet(), kept so older notes still run. */
function paintFundsSheet() {
  return repairFundsSheet();
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

/**
 * The pot accepts a second hand. trns_adm_in = 1 marks a transactions admin —
 * a member trusted with this one ledger and nothing else in the portal. The
 * claim travels in the signed token (txa), so it is the auth script's word,
 * not the caller's.
 */
function requireTxnWriter(body) {
  var claims = requireMember(body);
  if (Number(claims.adm) !== 1 && Number(claims.txa) !== 1) {
    throw new Error('You do not have permission to edit the transactions.');
  }
  return claims;
}

/* -------------------------------------------------------------- READ (GET) */

/** The live rows, oldest first, shaped for the screen. */
function ledger() {
  return readRows(fundsSheet())
    .filter(function (r) { return String(r.a_in === undefined ? '1' : r.a_in).trim() === '1'; })
    .map(function (r) {
      // Read against the month column, so a date the workbook parsed into the
      // wrong month is shown as the day that was meant even before the sheet
      // has been repaired.
      var date = mendDate(r.date, r.month, sheetTimeZone());
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
  var lock = null;
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);

    var action = String(body.action || '').trim();

    // One write at a time. restate() rewrites the whole ledger block, and two
    // of those overlapping would each write back the rows they read — the
    // later one without the row the earlier one added. Thirty seconds is far
    // longer than a write takes; a caller that waits it out is refused with
    // a coded error, so the screen reports it rather than re-reading.
    lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      lock = null;
      return fail('BUSY', 'Another entry is being saved. Please try again in a moment.');
    }

    // Checked per action, not once at the door: the fund is adm_in = 1 only,
    // while the pot also takes a transactions admin — the one ledger that role
    // exists for. The claims ride into the write so it can record whose hand
    // it was.
    if (action === 'saveFund')   { requireAdmin(body); return saveFund(body); }
    if (action === 'deleteFund') { requireAdmin(body); return deleteFund(body); }
    if (action === 'saveTxn')    return saveTxn(body, requireTxnWriter(body));
    if (action === 'deleteTxn')  return deleteTxn(body, requireTxnWriter(body));
    return fail('UNKNOWN_ACTION', 'Unknown action: ' + action);
  } catch (err) {
    return fail('SERVER_ERROR', String(err && err.message ? err.message : err));
  } finally {
    if (lock) lock.releaseLock();
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
 * The rows are physically sorted into date order — not merely renumbered —
 * so the sheet reads top to bottom the way the screen does. Adding a January
 * row when February is already there moves every line after it down, as it
 * would on a bank statement, and a committee that reads this sheet directly
 * sees that rather than a row at the bottom wearing a number from the middle.
 *
 * Along the way: every date cell becomes `dd-MM-yyyy` text (mending any the
 * workbook parsed into the wrong month — see mendDate), year and month are
 * rewritten from the date, sno runs 1..N down the live rows, the running
 * balance is rewritten along them, the fund year is filled in where blank,
 * and the money columns are coloured. Retired rows (a_in = 0) keep their
 * place in the sheet but move below the live ones, lose their line number and
 * their colour, and keep everything else, so a mistaken delete is still one
 * cell away from being undone.
 *
 * Reads and writes the block in one go each, which is both faster than a cell
 * at a time and the only way to move rows. Formulas survive: a cell holding
 * one is written back as the formula, not its last value.
 *
 * Returns { rows, live, mended } for the repair functions' log line.
 */
function restate(sheet) {
  var header = headerOf(sheet);
  var col = function (name) { return header.indexOf(name); };
  var cDate = col('date');
  var cYear = col('year');
  var cMonth = col('month');
  var cSno = col('sno');
  var cBal = col('balance');
  var cAnnual = col('annual_year');
  var cAin = col('a_in');
  var cCredit = col('credit');
  var cDebit = col('debit');
  if (cDate < 0) throw new Error('The sheet "' + sheet.getName() + '" has no date column.');

  var width = header.length;
  var tz = sheet.getParent().getSpreadsheetTimeZone();

  // The whole column, to the sheet's last row, so a date typed by hand into a
  // spare row below the ledger stays the text it was typed as.
  if (sheet.getMaxRows() > 1) {
    sheet.getRange(2, cDate + 1, sheet.getMaxRows() - 1, 1).setNumberFormat('@');
  }

  var last = sheet.getLastRow();
  if (last < 2) return { rows: 0, live: 0, mended: 0 };

  var block = sheet.getRange(2, 1, last - 1, width);
  var values = block.getValues();
  var formulas = block.getFormulas();

  var mended = 0;
  var rows = [];
  values.forEach(function (raw, i) {
    var blank = raw.every(function (x) { return String(x === 0 ? '0' : (x || '')).trim() === ''; });
    if (blank) return;

    var v = raw.map(function (x, j) { return formulas[i][j] ? formulas[i][j] : x; });

    var before = raw[cDate];
    var date = mendDate(before, cMonth >= 0 ? raw[cMonth] : '', tz);
    if (before instanceof Date || typeof before === 'number' || String(before) !== date) mended += 1;
    v[cDate] = date;

    // The same test ledger() applies: no a_in column means every row is live;
    // with the column, only a 1 is.
    var live = cAin < 0 || String(raw[cAin] === '' ? '' : raw[cAin]).trim() === '1';
    var sno = Number(raw[cSno]);

    rows.push({
      v: v,
      live: live,
      // A row with no readable date sorts last, where it can be seen.
      key: dateKey(date) || 99999999,
      // Two movements on the same day keep the order they were entered in:
      // the line numbers they already carry, then the new row (which has
      // none yet) after them, then the order they sat in.
      sno: cSno >= 0 && sno > 0 ? sno : 1e9,
      pos: i
    });
  });

  rows.sort(function (a, b) {
    if (a.live !== b.live) return a.live ? -1 : 1;
    if (a.key !== b.key) return a.key - b.key;
    if (a.sno !== b.sno) return a.sno - b.sno;
    return a.pos - b.pos;
  });

  var running = 0;
  var liveCount = 0;
  rows.forEach(function (r, i) {
    var v = r.v;
    if (!r.live) {
      if (cSno >= 0 && String(v[cAin] === undefined ? '' : v[cAin]).trim() === '0') v[cSno] = '';
      return;
    }
    liveCount += 1;
    running += asNumber(v[cCredit]) - asNumber(v[cDebit]);
    if (cSno >= 0) v[cSno] = i + 1;
    if (cBal >= 0) v[cBal] = running;
    // Year and month follow the date, so the three can never tell different
    // stories about the same row.
    if (cYear >= 0 && yearOfDate(v[cDate])) v[cYear] = Number(yearOfDate(v[cDate]));
    if (cMonth >= 0 && monthOfDate(v[cDate])) v[cMonth] = monthOfDate(v[cDate]);
    // Written rather than typed, so the sheet reads standalone and cannot
    // disagree with the screen about which year a row belongs to.
    if (cAnnual >= 0 && !String(v[cAnnual] || '').trim()) v[cAnnual] = annualYearFor(v[cDate]);
  });

  var out = rows.map(function (r) { return r.v; });
  if (out.length) sheet.getRange(2, 1, out.length, width).setValues(out);

  // Blank lines that sat between rows have been closed up; whatever is left
  // below the block is cleared so no row appears twice.
  var spare = values.length - out.length;
  if (spare > 0) {
    var tail = sheet.getRange(2 + out.length, 1, spare, width);
    tail.clearContent();
    tail.setBackground(null);
  }

  // Green for money in, red for money out, blue for the balance — on the live
  // rows; a retired row goes uncoloured so it reads as outside the ledger.
  [['credit', FILL_CREDIT], ['debit', FILL_DEBIT], ['balance', FILL_BALANCE]].forEach(function (p) {
    var c = col(p[0]);
    if (c < 0 || !out.length) return;
    var fills = rows.map(function (r) { return [r.live ? p[1] : null]; });
    sheet.getRange(2, c + 1, out.length, 1).setBackgrounds(fills);
  });

  return { rows: out.length, live: liveCount, mended: mended };
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
      var date = mendDate(r.date, r.month, txnTimeZone());
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
  var date = mendDate(row.date, row.month, txnTimeZone());
  return 'yr:' + String(row.annual_year || annualYearFor(date) || '').trim();
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
function saveTxn(body, claims) {
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
    // The name out of the signed token, whoever holds the pen — full admin or
    // transactions admin alike. Not taken from the entry: the caller does not
    // get to sign someone else's name.
    trnsfr_nm: String((claims && claims.nm) || ''),
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
function deleteTxn(body, claims) {
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

  // The deleter's name lands beside the soft delete, same as on a save — the
  // row stays in the sheet, so it should say who retired it as well as when.
  writeRow(sheet, target.__row, {
    a_in: 0, d_ts: stamp(),
    trnsfr_nm: String((claims && claims.nm) || ''),
  });
  restate(sheet);

  // An opening takes its transfer with it. Left behind, the fund would carry a
  // debit for money that went nowhere — the pot it moved into no longer exists
  // — and the committee's total would be short by exactly that amount with
  // nothing on either screen to say why.
  if (String(target.kind || '').trim().toLowerCase() === 'opening') {
    unmirrorOpening(String(target.trnsctn_id));
  }

  SpreadsheetApp.flush();
  return jsonOut({ ok: true, txns: txnLedger(), funds: ledger() });
}

/** Removes the funds debit an opening row put there, if it is still there. */
function unmirrorOpening(txnId) {
  var sheet = fundsSheet();
  var mark = '(' + txnId + ')';
  var found = null;
  readRows(sheet).forEach(function (r) {
    if (String(r.a_in === undefined ? '1' : r.a_in).trim() !== '1') return;
    if (String(r.reason || '').indexOf(mark) >= 0) found = r;
  });
  if (!found) return;

  writeRow(sheet, found.__row, { a_in: 0, d_ts: stamp() });
  restate(sheet);
}
