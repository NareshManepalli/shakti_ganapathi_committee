import { SHEETS_CONFIG } from '../config/sheetsConfig';

// Reading dates and times back out of the sheet.
//
// A cell the committee formatted as a date or a time is not text by the time it
// reaches the browser. Apps Script hands back a JS Date, JSON serialises that as
// a UTC instant, and what arrives is `2026-09-14T07:00:00.000Z` for the 14th, or
// `1899-12-31T02:30:00.000Z` for half six in the evening — 1899-12-30 being the
// epoch Sheets counts a bare time from.
//
// Both are the same instant written in the wrong frame. Converting them back
// needs the timezone the sheet keeps its clock in (see sheetTimeZone), and it
// has to be a real timezone rather than a fixed offset: the 2026 dates fall in
// daylight saving and the 1899 times do not, so one constant would put the
// times an hour out while the dates looked right.
//
// Everything here also accepts the plain forms — `2026-09-14`, `6:00 PM`,
// `18:00` — because that is what this portal writes back, and a row saved here
// should read the same as one typed into the sheet by hand.

const TZ = SHEETS_CONFIG.sheetTimeZone || 'America/Los_Angeles';

const ISO_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

let formatter = null;

/** The wall-clock fields this instant reads as on the sheet's own clock. */
const inSheetZone = (value) => {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;

  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
  }

  const out = {};
  for (const part of formatter.formatToParts(at)) out[part.type] = part.value;
  // h23 should never produce 24, but some ICU builds still do at midnight.
  if (out.hour === '24') out.hour = '00';
  return out;
};

/** Any stored date → `YYYY-MM-DD`, the form <input type="date"> speaks. */
export const toIsoDate = (value) => {
  const s = String(value || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (!ISO_STAMP.test(s)) return '';
  const p = inSheetZone(s);
  return p ? `${p.year}-${p.month}-${p.day}` : '';
};

/** Any stored time → 24-hour `HH:MM`, which is what the public site parses. */
export const toIsoTime = (value) => {
  const s = String(value || '').trim();
  if (!s) return '';

  if (ISO_STAMP.test(s)) {
    const p = inSheetZone(s);
    return p ? `${p.hour}:${p.minute}` : '';
  }

  const m = /^(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?\s*m\.?)?$/i.exec(s);
  if (!m) return '';

  let h = Number(m[1]);
  const min = m[2] || '00';
  const half = (m[3] || '').toLowerCase();

  if (half) {
    if (h < 1 || h > 12) return '';
    if (h === 12) h = half === 'a' ? 0 : 12;
    else if (half === 'p') h += 12;
  }
  if (h > 23 || Number(min) > 59) return '';

  return `${String(h).padStart(2, '0')}:${min}`;
};

// Anything unrecognisable is shown as it was stored rather than blanked: a
// value nobody can parse is still a value somebody entered, and hiding it would
// leave them wondering where their entry went.

/** For display: `14-09-2026`. */
export const fmtDate = (value) => {
  const iso = toIsoDate(value);
  if (iso) return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
  return String(value || '').trim() || '—';
};

/** For display: `06:30 PM`. */
export const fmtTime = (value) => {
  const iso = toIsoTime(value);
  if (!iso) return String(value || '').trim() || '—';
  const h = Number(iso.slice(0, 2));
  return `${String(h % 12 || 12).padStart(2, '0')}:${iso.slice(3)} ${h >= 12 ? 'PM' : 'AM'}`;
};
