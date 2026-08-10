// ---------------------------------------------------------------------------
// Google Sheets fetch + parse helpers
// ---------------------------------------------------------------------------
// Read a Google Sheet as CSV straight from the browser — no API key, no
// backend. The plain CSV export is tried first, with the gviz endpoint as a
// fallback since it is friendlier to cross-origin requests.
// ---------------------------------------------------------------------------

// Pull the sheet id and tab id (gid) out of any Google Sheets URL.
const parseSheetUrl = (url) => {
  if (!url) return null;
  const idMatch = String(url).match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return null;
  // null, not '0', when the URL names no tab. A workbook's first tab is only
  // gid 0 if it is the tab the workbook was created with — rename or recreate
  // it and the id is some other number. Asking for gid=0 on such a workbook is
  // a 400, so when no tab is named we ask for no tab and take the default.
  const gidMatch = String(url).match(/[#&?]gid=([0-9]+)/);
  return { sheetId: idMatch[1], gid: gidMatch ? gidMatch[1] : null };
};

// The two CSV export URLs we attempt, in order. A cache-busting param is
// appended so the browser/CDN won't keep serving a stale copy after the sheet
// is edited.
const buildCsvUrls = ({ sheetId, gid }) => {
  const cb = `_cb=${Date.now()}`;
  const tab = gid === null ? '' : `gid=${gid}&`;
  return [
    `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&${tab}${cb}`,
    `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&${tab}${cb}`,
  ];
};

// Parse a whole CSV document into an array of field arrays. This scans
// character by character so a quoted field may contain commas, escaped quotes
// ("") and — crucially — newlines: a single cell can span multiple physical
// lines (e.g. a multi-paragraph About text). A naive line-by-line split would
// break such a cell apart, so we must not split on newlines first.
const parseCsvRecords = (text) => {
  const records = [];
  let row = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') { cur += '"'; i += 1; } // escaped quote
        else inQuotes = false;
      } else {
        cur += ch; // newlines inside quotes are preserved
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cur); cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && next === '\n') i += 1; // treat CRLF as one break
      row.push(cur); cur = '';
      records.push(row); row = [];
    } else {
      cur += ch;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); records.push(row); } // trailing field/row
  return records;
};

// CSV text -> array of row objects keyed by the header row (lower-cased).
const parseCsv = (csvText) => {
  const records = parseCsvRecords(csvText)
    .filter((r) => r.some((v) => v.trim() !== '')); // drop fully empty records
  if (records.length < 2) return [];
  const headers = records[0].map((h) => h.trim().toLowerCase().replace(/^﻿/, ''));
  const rows = [];
  for (let i = 1; i < records.length; i += 1) {
    const values = records[i];
    const row = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
};

// --- Google Drive media helpers --------------------------------------------
// The sheet stores a Drive share link (or a bare file id, or an external URL)
// for images. These turn that into something the browser can actually load.

const extractDriveId = (value) => {
  if (!value) return null;
  const s = String(value).trim();
  const m = s.match(/\/d\/([a-zA-Z0-9_-]+)/) || s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s; // looks like a bare file id
  return null;
};

const isExternalUrl = (s) => /^https?:\/\//i.test(String(s || '').trim());

/**
 * A Drive *share* link renders an HTML page, not an image, so an <img> pointed
 * at one shows as broken. Rewrite anything Drive-shaped to the thumbnail
 * endpoint, which returns actual image bytes; pass other URLs through.
 */
export const toMediaUrl = (value, width = 1000) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const id = extractDriveId(raw);
  if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w${width}`;
  return isExternalUrl(raw) ? raw : '';
};

// --- Fetch -----------------------------------------------------------------

/** Every sheet uses a_in = 1 to mean "show this row". */
export const isActive = (r) => String((r && r.a_in) ?? '1').trim() === '1';

/**
 * Fetch one sheet URL and return its active rows.
 * Returns [] rather than throwing when the sheet isn't configured, so a
 * section simply falls back to its built-in text.
 */
export const fetchSheetRows = async (url) => {
  const parsed = parseSheetUrl(url);
  if (!parsed) return [];

  let lastError = null;
  for (const csvUrl of buildCsvUrls(parsed)) {
    try {
      const res = await fetch(csvUrl, { redirect: 'follow' });
      if (!res.ok) { lastError = new Error(`HTTP ${res.status}`); continue; }
      const text = await res.text();
      // A sheet that isn't shared publicly answers with a sign-in *page*
      // rather than an error status, so check the shape, not just res.ok.
      if (/^\s*</.test(text)) { lastError = new Error('Sheet is not shared publicly'); continue; }
      return parseCsv(text).filter(isActive);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Could not read the sheet');
};

/* --------------------------------------------------------------- gallery */

/**
 * Reads the Drive gallery tree from the Apps Script Web App
 * (apps-script/GOOGLE_APPS_SCRIPT_GALLERY.js).
 *
 * Returns { years: ['2026','2025'], byYear: { 2026: [{id,url,name}] } }, or
 * null when the gallery isn't configured or the call fails — the caller keeps
 * whatever it already had rather than blanking the section.
 *
 * The script hands back bare Drive file ids and the URL is built here, so the
 * one form that actually renders lives in a single place. See toMediaUrl:
 * `uc?export=view` is blocked by Chrome (ERR_BLOCKED_BY_ORB), and every <img>
 * showing one of these needs referrerPolicy="no-referrer".
 */
export const fetchGalleryTree = async (webAppUrl) => {
  if (!webAppUrl) return null;
  try {
    const res = await fetch(webAppUrl, { cache: 'no-store', redirect: 'follow' });
    if (!res.ok) return null;

    const text = await res.text();
    // An undeployed or unauthorised Web App answers with an HTML page.
    if (/^\s*</.test(text)) return null;

    const data = JSON.parse(text);
    if (!data || data.ok === false || !Array.isArray(data.years)) return null;

    const byYear = {};
    const years = [];
    data.years.forEach((entry) => {
      const year = String((entry && entry.year) || '').trim();
      if (!year) return;
      const images = ((entry && entry.images) || [])
        .map((im) => ({
          id: im.id,
          name: im.name || '',
          // Two sizes on purpose. The grid renders these a few hundred pixels
          // wide, so serving it the 1600px file wastes roughly 3x the bytes;
          // only the lightbox, which fills the screen, actually needs that.
          thumb: toMediaUrl(im.id, 600),
          url: toMediaUrl(im.id, 1600),
        }))
        .filter((im) => im.id && im.url);
      // A year folder with no photos in it yet isn't offered at all.
      if (!images.length) return;
      byYear[year] = images;
      years.push(year);
    });
    years.sort((a, b) => (parseInt(b, 10) || 0) - (parseInt(a, 10) || 0));

    return { years, byYear };
  } catch (err) {
    console.error('Could not read the gallery folder:', err);
    return null;
  }
};

/**
 * Reads the committee list from the Members Web App instead of the sheet's CSV
 * export.
 *
 * This is what lets the members workbook be Restricted. Reading it as CSV needs
 * the whole sheet shared publicly, which also exposes `email`, `access_in` and
 * `adm_in` — and `email` is the address the funds gate sends its one-time code
 * to. The Web App runs as the sheet's owner and returns only the public
 * columns, so nothing sensitive is served.
 *
 * Rows come back with the same keys the CSV had, so transformMembers needs no
 * knowledge of which source was used. Returns null on any failure, letting the
 * caller fall back rather than blanking the section.
 */
export const fetchMembersApi = async (webAppUrl) => {
  if (!webAppUrl) return null;
  try {
    const url = webAppUrl + (webAppUrl.includes('?') ? '&' : '?') + 'action=members';
    const res = await fetch(url, { cache: 'no-store', redirect: 'follow' });
    if (!res.ok) return null;
    const text = await res.text();
    // An undeployed or unauthorised Web App answers with an HTML page.
    if (/^\s*</.test(text)) return null;
    const data = JSON.parse(text);
    const rows = Array.isArray(data) ? data : (data.members || data.rows);
    if (!Array.isArray(rows)) return null;
    return rows;
  } catch (err) {
    console.error('Could not read the members Web App:', err);
    return null;
  }
};
