// Reading JSON out of an Apps Script Web App, which is not a reliable service.
//
// Three things go wrong with it, and all three look the same from a screen:
//
//   - a cold project takes ten or fifteen seconds to wake, and sometimes
//     longer than anybody is willing to sit and watch;
//   - it answers a perfectly good request with an HTML page — a sign-in
//     screen, a quota notice, an error page — instead of the JSON it meant to;
//   - it fails outright, briefly, for no reason it will tell you.
//
// Every one of them reached the committee as "the funds service did not respond
// properly", on a service that would have answered a moment later. A read is
// safe to repeat — it changes nothing — so it is repeated rather than reported.
//
// Writes are NOT retried here, and must not be: see settleWrite.js, where a
// lost answer is resolved by reading rather than by asking again.

/** Per attempt. Long enough for a cold start, short enough to try again. */
const ATTEMPT_MS = 20000;

/** Waits between attempts, so a service under load is not simply hit harder. */
const BACKOFF_MS = [0, 900, 2600];

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/**
 * One attempt: fetch, give up at the deadline, and insist on JSON.
 *
 * The abort matters as much as the retry. Without it a hung request holds the
 * screen on its skeleton for as long as the browser allows — two minutes in
 * Chrome — and "still loading" after two minutes is indistinguishable from
 * broken to the person waiting.
 */
const once = async (url, options) => {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), ATTEMPT_MS);
  try {
    const res = await fetch(url, { redirect: 'follow', ...options, signal: control.signal });
    const text = await res.text();
    // An undeployed, unauthorised or overloaded Web App answers with a page.
    if (/^\s*</.test(text)) return { retry: true, reason: 'html' };
    try {
      return { data: JSON.parse(text) };
    } catch {
      return { retry: true, reason: 'unparseable' };
    }
  } catch (err) {
    return { retry: true, reason: err.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Reads JSON from `url`, trying up to three times.
 *
 * Returns the parsed body, or `{ ok: false, error }` shaped like the Web Apps'
 * own failures so callers need no new branch. `label` names the service in that
 * message — "the funds service", "the gallery" — because a member reading it
 * can only act on which part of the site is unwell.
 */
export const readJson = async (url, { label = 'service', ...options } = {}) => {
  let last = 'network';

  for (let attempt = 0; attempt < BACKOFF_MS.length; attempt += 1) {
    if (BACKOFF_MS[attempt]) await sleep(BACKOFF_MS[attempt]);
    const res = await once(url, options);
    if (res.data !== undefined) return res.data;
    last = res.reason;
    // A slow service is worth waiting for; there is nothing else to try.
    console.warn(`${label}: attempt ${attempt + 1} failed (${res.reason})`);
  }

  return {
    ok: false,
    error: last === 'timeout'
      ? `The ${label} is taking too long to answer. Please try again in a moment.`
      : `Could not reach the ${label}. Please try again in a moment.`,
  };
};
