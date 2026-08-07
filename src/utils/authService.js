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
  NOT_CONFIGURED: 'Sign-in is not set up yet. Please try again later.',
  NETWORK: 'Could not reach the committee server. Check your connection and try again.',
};

export const messageFor = (code, fallback) => MESSAGES[code] || fallback || MESSAGES.NETWORK;

/**
 * Apps Script cannot answer a CORS preflight, so the body goes as text/plain —
 * a "simple request" that never triggers one. The payload is still JSON.
 */
const post = async (payload) => {
  if (!AUTH_API) return { ok: false, code: 'NOT_CONFIGURED', error: MESSAGES.NOT_CONFIGURED };
  try {
    const res = await fetch(AUTH_API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    const text = await res.text();
    // An undeployed or unauthorised Web App answers with an HTML page.
    if (/^\s*</.test(text)) return { ok: false, code: 'NOT_CONFIGURED', error: MESSAGES.NOT_CONFIGURED };
    const data = JSON.parse(text);
    if (!data.ok && !data.error) data.error = messageFor(data.code);
    return data;
  } catch (err) {
    console.error('Auth request failed:', err);
    return { ok: false, code: 'NETWORK', error: MESSAGES.NETWORK };
  }
};

/** Step 1 — look the mobile up and email a code. Never returns the code. */
export const requestOtp = (mobile) => post({ action: 'requestOtp', mobile });

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
