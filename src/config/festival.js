// Festival timing.
//
// Vinayaka Chavithi moves every year, so the start date is a row in the
// `content` sheet (section = "festival", the date in content_en as YYYY-MM-DD).
// The admin edits that one cell each year and the countdown re-arms itself —
// nothing here needs changing.
//
// The value below is only a fallback for when the sheet has not loaded yet or
// has no festival row.

export const FALLBACK_START = '2026-09-14';

// "9 days of celebrations" is the festival's definition, not a setting.
export const FESTIVAL_DAYS = 9;

// Earliest year the gallery offers. The dropdown runs from here to the current
// year, so it grows by itself each January.
export const GALLERY_START_YEAR = 2025;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 'YYYY-MM-DD' -> local midnight on that day.
 * Built from parts rather than new Date(string): the string form is parsed as
 * UTC, which lands on the previous evening for anyone east of Greenwich and
 * would start the countdown a day early in India.
 */
export const parseFestivalDate = (value) => {
  const m = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
};

/**
 * Where we are relative to the festival:
 *
 *   upcoming  before day 1          -> count down to it
 *   ongoing   day 1 .. day 9        -> "celebrations started"
 *   ended     after the ninth day   -> nothing, until the admin sets next year
 *
 * Returns null when there is no usable date at all.
 */
export const getFestivalState = (dateValue, now = Date.now()) => {
  const start = parseFestivalDate(dateValue) || parseFestivalDate(FALLBACK_START);
  if (!start) return null;

  const startMs = start.getTime();
  const endMs = startMs + FESTIVAL_DAYS * DAY_MS; // midnight after the ninth day

  if (now < startMs) return { phase: 'upcoming', start, msLeft: startMs - now };
  if (now < endMs) {
    return {
      phase: 'ongoing',
      start,
      // 1-based, so day 1 is the first day rather than day 0
      dayNumber: Math.floor((now - startMs) / DAY_MS) + 1,
    };
  }
  return { phase: 'ended', start };
};

/** Split a millisecond gap into the four units the countdown shows. */
export const splitDuration = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
};
