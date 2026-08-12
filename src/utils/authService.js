import { SHEETS_CONFIG } from '../config/sheetsConfig';

// ---------------------------------------------------------------------------
// Talks to the Auth Web App (apps-script/GOOGLE_APPS_SCRIPT_AUTH.js).
//
// Nothing here decides anything. The code is generated, emailed and checked
// inside Apps Script; this file only carries the question there and the answer
// back. That is the point — anything decided in the browser can be edited in
// the browser.
// ---------------------------------------------------------------------------

const AUTH_API = (SHEETS_CONFIG.auth && SHEETS_CONFIG.auth.url) || null;

export const isAuthConfigured = () => Boolean(AUTH_API);

// Everything the server can say, phrased for a person. Kept here so the pages
// stay about layout and the wording lives in one place.
const MESSAGES = {
  BAD_MOBILE: 'Enter the 10-digit mobile number registered with the committee.',
  NOT_A_MEMBER: 'This mobile number is not on the committee list.',
  NO_PERMISSION: 'You do not have permission to sign in. Please contact the committee admin.',
  NO_EMAIL: 'No email address is set against this member. Please ask the admin to add one.',
  RESEND_TOO_SOON: 'Please wait a moment before asking for another code.',
  TOO_MANY_SENDS: 'Too many codes requested. Please try again in an hour.',
  OTP_EXPIRED: 'That code has expired. Please request a new one.',
  OTP_INVALID: 'That code is not correct.',
  TOO_MANY_ATTEMPTS: 'Too many wrong codes. Please request a new one.',
  UNAUTHORIZED: 'Your session has ended. Please sign in again.',
  BAD_NAME: 'Please enter a name.',
  BAD_EMAIL: 'Enter a valid email address — this is where your sign-in code is sent.',
  MOBILE_TAKEN: 'Another committee member already uses that mobile number.',
  NOT_CONFIGURED: 'Sign-in is not set up yet. Please try again later.',
  // Distinct from NOT_CONFIGURED on purpose. The service being unwell for a
  // moment and the service never having been set up are different problems with
  // different answers — "try again" against "somebody has work to do" — and
  // reporting the first as the second sent an admin to check a deployment that
  // was perfectly healthy.
  NO_ANSWER: 'The sign-in service did not answer. Please try again in a moment.',
  NETWORK: 'Could not reach the committee server. Check your connection and try again.',
};

export const messageFor = (code, fallback) => MESSAGES[code] || fallback || MESSAGES.NETWORK;

/**
 * Apps Script cannot answer a CORS preflight, so the body goes as text/plain —
 * a "simple request" that never triggers one. The payload is still JSON.
 *
 * `retries` is not a default anybody should raise casually: see the callers.
 * Every action here is a POST, and only one of them is safe to repeat.
 */
const post = async (payload, retries = 0) => {
  if (!AUTH_API) return { ok: false, code: 'NOT_CONFIGURED', error: MESSAGES.NOT_CONFIGURED };

  let lost = { ok: false, code: 'NO_ANSWER', error: MESSAGES.NO_ANSWER };

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt) await new Promise((r) => { setTimeout(r, attempt * 1200); });

    // A deadline per attempt. Without one a hung request holds the sign-in on
    // its spinner for as long as the browser allows, and a member watching that
    // has no way to tell it from broken.
    const control = new AbortController();
    const timer = setTimeout(() => control.abort(), 20000);
    try {
      const res = await fetch(AUTH_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: control.signal,
      });
      const text = await res.text();
      // A page rather than JSON. It may mean the Web App is not deployed — but
      // far more often the service is simply having a moment, which is why this
      // is no longer reported as "not set up".
      if (/^\s*</.test(text)) continue;
      const data = JSON.parse(text);
      if (!data.ok && !data.error) data.error = messageFor(data.code);
      return data;
    } catch (err) {
      console.error('Auth request failed:', err);
      lost = err.name === 'AbortError'
        ? { ok: false, code: 'NO_ANSWER', error: MESSAGES.NO_ANSWER }
        : { ok: false, code: 'NETWORK', error: MESSAGES.NETWORK };
    } finally {
      clearTimeout(timer);
    }
  }

  return lost;
};

// Not retried, deliberately. It emails a code and spends one of the five the
// member is allowed in an hour, so a repeat on a lost answer would send a
// second code — or trip the throttle and refuse a member who did nothing wrong.
/** Step 1 — look the mobile up and email a code. Never returns the code. */
export const requestOtp = (mobile) => post({ action: 'requestOtp', mobile });


/**
 * The bypass equivalent of requestOtp: same reply, but nothing is emailed and
 * nothing is throttled. Refused by the server unless a bypass is live.
 */

// Not retried either: the first attempt burns the code, so a second would be
// told the code is wrong — the most alarming thing a person can be told at a
// sign-in, and untrue.
/** Step 2 — check the code. On success this is where the session comes from. */
export const verifyOtp = (mobile, otp) => post({ action: 'verifyOtp', mobile, otp });

/* ------------------------------------------------------------- the captcha */

/**
 * A 4-digit challenge, drawn and checked in the browser.
 *
 * It is a speed bump, not a lock: anyone can read it in devtools. Its job is
 * to stop a script hammering "is this mobile a member?" and flooding inboxes.
 * The real limits are on the server — 1 minute between sends, 5 an hour, 5
 * wrong codes and the code is burned — and those cannot be edited from here.
 */
export const makeCaptcha = () => String(Math.floor(1000 + Math.random() * 9000));

/* ------------------------------------------------------- signed-in member */

/**
 * The signed-in member's own record, including the email address the public
 * members API deliberately withholds.
 *
 * The server identifies them from the id inside the signed token, never from
 * anything sent with the request, so a member can only ever read themselves.
 */
// The one call here worth repeating. It reads and changes nothing, and it runs
// on every arrival in the portal — so a single hiccup used to end the session
// of somebody who had just signed in.
export const getProfile = (token) => post({ action: 'getProfile', token }, 2);

/**
 * Updates the member's own name in both languages, mobile and email. Position
 * and the access flags are not writable — those are the committee's to set, and
 * letting a member edit adm_in would hand out the portal.
 */
// A write, so never repeated: see settleWrite.js for why a retry on a write
// whose answer was lost is how a record ends up saved twice.
export const updateProfile = (token, { name, nameTe, mobile, email }) =>
  post({ action: 'updateProfile', token, name, nameTe, mobile, email });
