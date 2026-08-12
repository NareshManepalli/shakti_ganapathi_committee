// The last good copy of the site's content, kept in the browser.
//
// Every visit used to start from nothing: four sheets fetched before a word
// appeared, one of them through an Apps Script Web App that takes five to
// fifteen seconds to wake. On a phone that is a screen of grey boxes for long
// enough to look broken, and long enough that a visitor gives up.
//
// So the last successful read is kept and shown at once, and the fetch happens
// behind it. A returning visitor sees the site immediately and the fresh copy
// replaces it a few seconds later — usually identically, because the sheets do
// not change most days. A first-time visitor sees exactly what they saw before.
//
// This is why nothing here is allowed to be clever. A cache that serves the
// wrong thing is worse than no cache, so it is versioned against the shape of
// the data, capped in age, and thrown away whole at the first sign of trouble.

const KEY = 'ssgc.content.v1';

/**
 * How long a copy may be shown before the site would rather show nothing.
 *
 * Not a freshness policy — the fetch runs on every load regardless, so what is
 * on screen is never more than a few seconds behind. This is the other case: a
 * visitor whose sheets have been unreachable for a fortnight is better served
 * by a blank section that says so than by a schedule that quietly belongs to
 * last year's festival.
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** The stored copy, or null — never a throw, whatever is in there. */
export const readCache = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;

    const held = JSON.parse(raw);
    if (!held || held.v !== KEY) return null;
    if (!held.at || Date.now() - held.at > MAX_AGE_MS) return null;
    if (!held.sections || typeof held.sections !== 'object') return null;

    return held.sections;
  } catch {
    // Private browsing, a full quota, a half-written entry from a tab that was
    // closed mid-write. None of them are worth a broken page.
    return null;
  }
};

/**
 * Keeps a copy, unless there is nothing worth keeping.
 *
 * A section that failed to load arrives here as null, and storing that would
 * teach the cache to show an empty page quickly. Only a read where something
 * came back is kept, and the sections that failed keep whatever was already
 * held for them.
 */
export const writeCache = (sections) => {
  try {
    const worth = Object.values(sections || {}).some((v) => v !== null && v !== undefined);
    if (!worth) return;

    const merged = { ...(readCache() || {}) };
    for (const [name, value] of Object.entries(sections)) {
      if (value !== null && value !== undefined) merged[name] = value;
    }

    localStorage.setItem(KEY, JSON.stringify({ v: KEY, at: Date.now(), sections: merged }));
  } catch {
    // A quota error here must not take the page down with it: the copy is a
    // convenience, and the site works without one.
  }
};

export const clearCache = () => {
  try { localStorage.removeItem(KEY); } catch { /* nothing to do */ }
};
