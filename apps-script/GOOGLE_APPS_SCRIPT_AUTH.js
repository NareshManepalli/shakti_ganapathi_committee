/**
 * SSGC — Auth Web App (OTP sign-in for committee members)
 * ---------------------------------------------------------------------------
 * Gates the Committee Funds area. There are no passwords: a member proves who
 * they are with their mobile number plus a one-time code emailed to the address
 * held against them in the members sheet.
 *
 *   POST { action:'requestOtp', mobile }        -> emails a 6-digit code
 *   POST { action:'verifyOtp',  mobile, otp }   -> returns a session token
 *
 * WHY THIS RUNS SERVER-SIDE
 *   Everything that decides the answer happens here, inside a script the
 *   browser cannot read:
 *     - the code is generated here and never sent to the browser
 *     - the members sheet is read with SpreadsheetApp, so the email address
 *       does not have to be publicly shared to be usable
 *     - the reply carries a MASKED email (v••••@gmail.com) — enough for the
 *       member to recognise their inbox, useless to anyone else
 *     - the session token is signed here; a forged one fails the signature
 *   Doing any of this in React would put the code, or the means to mint a
 *   token, in front of every visitor.
 *
 * SETUP
 *  1. script.new -> paste this file -> Save.
 *  2. Check MEMBERS_SHEET_ID below points at the members workbook.
 *  3. Run initAuth() once. It creates the signing secret in Script Properties
 *     and sends nothing — it just proves the script can open the sheet.
 *  4. Deploy -> New deployment -> Web app
 *       Execute as:     Me            (so it can read the sheet and send mail)
 *       Who has access: Anyone        (the login page is public)
 *  5. Put the /exec URL in src/config/sheetsConfig.js -> auth.
 *
 * MAIL QUOTA: a consumer Gmail account may send ~100 emails a day from Apps
 * Script. Ample for a committee; worth knowing before a bulk test.
 * ---------------------------------------------------------------------------
 */

var MEMBERS_SHEET_ID = '1nzynJzTm72i7C0lmfR50VZ6lONArSrh7ncbejMSiYyc';
var MEMBERS_TAB_NAME = '';        // blank = the first tab

var OTP_TTL_SECONDS      = 300;   // code is valid for 5 minutes
var RESEND_GAP_SECONDS   = 60;    // "Resend OTP" unlocks after 1 minute
var MAX_VERIFY_ATTEMPTS  = 5;     // wrong guesses before the code is burned
var MAX_SENDS_PER_HOUR   = 5;     // per mobile, so nobody's inbox is flooded
var SESSION_TTL_MINUTES  = 60;

var SIGNING_KEY_PROP = 'SESSION_SIGNING_KEY';

/* ---------------------------------------------------------------------------
 * DEVELOPMENT BYPASS — per member, from the sheet
 *
 * A member whose `bypass_in` is 1 signs in with BYPASS_CODE instead of an
 * emailed one, and no email is sent for them at all. Everyone else goes
 * through the normal flow, so one row can be opened up for testing without
 * weakening sign-in for the rest of the committee.
 *
 * It skips the CODE, not the rules: access_in is still required, a non-member
 * still cannot get in, and adm_in still decides what they see.
 *
 * Set bypass_in back to 0 on every row before the site goes public. A row left
 * at 1 is a permanent way in for anyone who knows the code, and the code is in
 * this file, which is in a public repo.
 * ------------------------------------------------------------------------- */
var BYPASS_CODE = '111111';

// Shown as the sender in the member's inbox. The underlying address is the
// Google account this script is deployed under — deploy it on the committee's
// account, not a personal one, so the quota and the address belong to the
// committee and survive a change of office-bearers.
var SENDER_NAME = 'Sri Shakthi Ganapathi Committee';

// Optional. Where a reply goes if a member hits Reply; blank uses the sender.
var REPLY_TO = '';

/* ------------------------------------------------------------------ setup */

/** Run once from the editor. Creates the signing key and checks sheet access. */
function initAuth() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty(SIGNING_KEY_PROP)) {
    props.setProperty(SIGNING_KEY_PROP, Utilities.getUuid().replace(/-/g, ''));
    Logger.log('Signing key created.');
  } else {
    Logger.log('Signing key already present.');
  }
  var members = readMembers();
  Logger.log('Members sheet reachable: ' + members.length + ' active row(s).');
  var withEmail = members.filter(function (m) { return m.email; }).length;
  Logger.log('Rows with an email address: ' + withEmail);
  var canSignIn = members.filter(function (m) { return m.accessIn && m.email; }).length;
  Logger.log('Rows that can actually sign in (access_in = 1 AND an email): ' + canSignIn);
}




/* ------------------------------------------------------------------ utils */

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function fail(code, message, extra) {
  var out = { ok: false, code: code, error: message };
  if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
  return jsonOut(out);
}

/**
 * Mobile numbers are typed inconsistently (+91 90000 00001, 09000000001,
 * 90000 00001). Reduce every form to the last 10 digits so the sheet and the
 * login box always agree.
 */
function normaliseMobile(value) {
  var digits = String(value || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** venkatnaresh142@gmail.com -> ve••••••••••2@gmail.com */
function maskEmail(email) {
  var s = String(email || '').trim();
  var at = s.indexOf('@');
  if (at < 1) return '';
  var name = s.slice(0, at);
  var domain = s.slice(at);
  if (name.length <= 3) return name.charAt(0) + '••••' + domain;
  return name.slice(0, 2) + new Array(name.length - 2).join('•') + name.slice(-1) + domain;
}

function sheetCache() { return CacheService.getScriptCache(); }

/* ---------------------------------------------------------------- members */

/**
 * Reads the members sheet with SpreadsheetApp — the script's own access, not a
 * public share. Only a_in = 1 rows count, matching the rest of the site.
 */
function readMembers() {
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var sheet = MEMBERS_TAB_NAME ? ss.getSheetByName(MEMBERS_TAB_NAME) : ss.getSheets()[0];
  if (!sheet) throw new Error('Members tab not found.');

  var values = sheet.getDataRange().getValues();
  if (!values.length) return [];

  var header = values[0].map(function (h) { return String(h || '').trim().toLowerCase(); });
  var col = function (name) { return header.indexOf(name); };
  var iId = col('id'), iName = col('name_en'), iNameTe = col('name_te');
  var iMobile = col('mobile'), iEmail = col('email');
  var iAccess = col('access_in'), iAdm = col('adm_in'), iActive = col('a_in');
  var iBypass = col('bypass_in');   // -1 when the column is absent, i.e. off

  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var active = iActive < 0 ? '1' : String(row[iActive]).trim();
    if (active !== '1') continue;
    out.push({
      id: iId < 0 ? r : row[iId],
      name: iName < 0 ? '' : String(row[iName] || '').trim(),
      nameTe: iNameTe < 0 ? '' : String(row[iNameTe] || '').trim(),
      mobile: normaliseMobile(iMobile < 0 ? '' : row[iMobile]),
      email: iEmail < 0 ? '' : String(row[iEmail] || '').trim(),
      accessIn: String(iAccess < 0 ? '0' : row[iAccess]).trim() === '1',
      admIn: String(iAdm < 0 ? '0' : row[iAdm]).trim() === '1',
      bypassIn: String(iBypass < 0 ? '0' : row[iBypass]).trim() === '1',
    });
  }
  return out;
}

/** Every active member holding this number. Normally one; see below. */
function membersWithMobile(mobile) {
  var wanted = normaliseMobile(mobile);
  if (wanted.length !== 10) return [];
  var members = readMembers();
  var out = [];
  for (var i = 0; i < members.length; i++) {
    if (members[i].mobile === wanted) out.push(members[i]);
  }
  return out;
}

/**
 * The one member this number identifies, or null.
 *
 * Null when two rows share it, rather than the first of them. The mobile IS the
 * identity here — there is no password to tell the rows apart — so picking the
 * first would sign somebody in as whoever happens to sort earliest, carrying
 * that row's adm_in rather than their own. Row order is not a fact anyone
 * maintains: sorting the sheet or deactivating one row silently changes who a
 * number resolves to. Refusing is the only answer that cannot be wrong.
 */
function findMemberByMobile(mobile) {
  var hits = membersWithMobile(mobile);
  return hits.length === 1 ? hits[0] : null;
}

/** The refusal for a number that names more than one member. */
function ambiguousMobileFail() {
  return fail('MOBILE_AMBIGUOUS',
    'This mobile number is listed against more than one committee member, so we cannot tell '
    + 'who is signing in. Please contact the committee admin.');
}

/* ------------------------------------------------------------------ token */

function signingKey() {
  var k = PropertiesService.getScriptProperties().getProperty(SIGNING_KEY_PROP);
  if (!k) throw new Error('Auth is not configured: run initAuth() once.');
  return k;
}

function b64url(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

/**
 * A signed session token: <payload>.<signature>. The payload is readable —
 * it holds no secret — but it cannot be edited, because changing a single
 * character invalidates the HMAC that only this script can produce.
 */
function issueToken(member) {
  var payload = {
    mid: member.id,
    nm: member.name,
    adm: member.admIn ? 1 : 0,
    exp: Date.now() + SESSION_TTL_MINUTES * 60 * 1000,
  };
  var body = b64url(Utilities.newBlob(JSON.stringify(payload)).getBytes());
  var sig = b64url(Utilities.computeHmacSha256Signature(body, signingKey()));
  return body + '.' + sig;
}

/** Used by the other Web Apps later, to trust a token this script issued. */
function verifyToken(token) {
  var parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  var expected = b64url(Utilities.computeHmacSha256Signature(parts[0], signingKey()));
  if (expected !== parts[1]) return null;
  var payload;
  try {
    payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  } catch (e) { return null; }
  if (!payload || !payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

/* -------------------------------------------------------------------- OTP */

function otpKey(mobile) { return 'otp_' + mobile; }
function sendLogKey(mobile) { return 'sent_' + mobile; }

function sendOtpEmail(member, code) {
  var subject = 'Your Sri Shakthi Ganapathi Committee code: ' + code;
  var text =
    'Namaskaram ' + (member.name || 'committee member') + ',\n\n' +
    'Your one-time code for the Committee Funds area is:\n\n' +
    '    ' + code + '\n\n' +
    'It is valid for 5 minutes and can be used once.\n\n' +
    'If you did not ask for this code, you can ignore this email — nobody can ' +
    'get in without it.\n\n' +
    '— Sri Shakthi Ganapathi Committee';

  var html =
    '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:460px;margin:0 auto;' +
    'background:#0e1b33;color:#eaf0fb;padding:28px 26px;border-radius:14px">' +
    '<p style="margin:0 0 4px;color:#e5b94e;font-size:13px;letter-spacing:.14em;' +
    'text-transform:uppercase">Sri Shakthi Ganapathi Committee</p>' +
    '<p style="margin:0 0 18px;font-size:15px">Namaskaram ' +
    (member.name || 'committee member') + ',</p>' +
    '<p style="margin:0 0 10px;font-size:14px;color:#b9c6de">Your one-time code for the ' +
    'Committee Funds area:</p>' +
    '<div style="font-size:34px;font-weight:700;letter-spacing:.34em;color:#e5b94e;' +
    'background:#0a1428;border:1px solid #23375d;border-radius:10px;padding:16px;' +
    'text-align:center;margin:0 0 16px">' + code + '</div>' +
    '<p style="margin:0 0 6px;font-size:13px;color:#b9c6de">Valid for 5 minutes, and it ' +
    'can be used once.</p>' +
    '<p style="margin:0;font-size:12px;color:#7f8fab">If you did not ask for this code you ' +
    'can ignore this email — nobody can get in without it.</p>' +
    '</div>';

  MailApp.sendEmail({
    to: member.email,
    subject: subject,
    body: text,
    htmlBody: html,
    // The address is whichever Google account deployed this script; `name`
    // decides what members actually see in their inbox, so the code arrives
    // from the committee rather than from a person.
    name: SENDER_NAME,
    replyTo: REPLY_TO || undefined,
  });
}

/* ------------------------------------------------------------------- POST */

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
    var action = String(body.action || '').trim();

    if (action === 'requestOtp') return handleRequestOtp(body);
    if (action === 'verifyOtp') return handleVerifyOtp(body);
    if (action === 'getProfile') return handleGetProfile(body);
    if (action === 'updateProfile') return handleUpdateProfile(body);
    return fail('UNKNOWN_ACTION', 'Unknown action: ' + action);
  } catch (err) {
    return fail('SERVER_ERROR', String(err && err.message ? err.message : err));
  }
}

function handleRequestOtp(body) {
  // Checked first, before a code is generated or an email leaves. Without the
  // signing key nothing could be verified afterwards, so sending mail would
  // waste the member's time and the daily quota on a code that can never work.
  signingKey();

  var mobile = normaliseMobile(body.mobile);
  if (mobile.length !== 10) {
    return fail('BAD_MOBILE', 'Enter the 10-digit mobile number registered with the committee.');
  }

  var cache = sheetCache();

  // Resend throttle — the page also counts down, but the server is what decides.
  var log = JSON.parse(cache.get(sendLogKey(mobile)) || '{"count":0,"last":0}');
  var sinceLast = Math.floor((Date.now() - log.last) / 1000);
  if (log.last && sinceLast < RESEND_GAP_SECONDS) {
    return fail('RESEND_TOO_SOON', 'Please wait before asking for another code.',
                { retryInSec: RESEND_GAP_SECONDS - sinceLast });
  }
  if (log.count >= MAX_SENDS_PER_HOUR) {
    return fail('TOO_MANY_SENDS', 'Too many codes requested. Try again in an hour.');
  }

  var member = findMemberByMobile(mobile);
  if (!member) {
    if (membersWithMobile(mobile).length > 1) return ambiguousMobileFail();
    return fail('NOT_A_MEMBER', 'This mobile number is not on the committee list.');
  }
  // Checked BEFORE any email goes out: a member whose access_in is 0 is on the
  // list but not allowed in, and is told so plainly rather than being left to
  // wait for a code that would never arrive.
  if (!member.accessIn) {
    return fail('NO_PERMISSION', 'You do not have permission to sign in. Please contact the committee admin.');
  }
  if (!member.email) {
    return fail('NO_EMAIL', 'No email address is set against this member. Ask the admin to add one.');
  }

  // bypass_in = 1: no code is generated and no email is sent. The reply is the
  // same shape, so the page after this behaves identically either way.
  if (member.bypassIn) {
    Logger.log('BYPASS sign-in offered to ' + mobile + ' (' + member.name + ') — no email sent');
    return jsonOut({
      ok: true,
      bypass: true,
      name: member.name,
      maskedEmail: maskEmail(member.email),
      expiresInSec: OTP_TTL_SECONDS,
      resendInSec: 0,
    });
  }

  var code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put(otpKey(mobile), JSON.stringify({
    code: code,
    memberId: member.id,
    attempts: 0,
    expires: Date.now() + OTP_TTL_SECONDS * 1000,
  }), OTP_TTL_SECONDS);

  sendOtpEmail(member, code);

  cache.put(sendLogKey(mobile), JSON.stringify({
    count: log.count + 1, last: Date.now(),
  }), 3600);

  return jsonOut({
    ok: true,
    name: member.name,
    maskedEmail: maskEmail(member.email),   // never the full address
    expiresInSec: OTP_TTL_SECONDS,
    resendInSec: RESEND_GAP_SECONDS,
  });
}

function handleVerifyOtp(body) {
  var mobile = normaliseMobile(body.mobile);
  var entered = String(body.otp || '').replace(/\D/g, '');
  var cache = sheetCache();

  // Refused up front, before either route below can resolve the number to a
  // row. Otherwise the bypass path would fall through to the cache and answer
  // with a code error, which reads as "wrong code" for a sheet problem.
  if (membersWithMobile(mobile).length > 1) return ambiguousMobileFail();

  // bypass_in = 1: the fixed code stands in for an emailed one. Checked before
  // the cache, because no code was ever generated for this member.
  var early = findMemberByMobile(mobile);
  if (early && early.bypassIn && entered === BYPASS_CODE) {
    if (!early.accessIn) {
      return fail('NO_PERMISSION', 'You do not have permission to sign in. Please contact the committee admin.');
    }
    Logger.log('BYPASS USED for ' + mobile + ' (' + early.name + ')');
    cache.remove(otpKey(mobile));
    return jsonOut({
      ok: true,
      bypass: true,
      token: issueToken(early),
      member: { id: early.id, name: early.name, nameTe: early.nameTe, isAdmin: early.admIn },
      expiresInMin: SESSION_TTL_MINUTES,
    });
  }

  var raw = cache.get(otpKey(mobile));
  if (!raw) {
    return fail('OTP_EXPIRED', 'That code has expired. Please request a new one.');
  }
  var rec = JSON.parse(raw);

  if (Date.now() > rec.expires) {
    cache.remove(otpKey(mobile));
    return fail('OTP_EXPIRED', 'That code has expired. Please request a new one.');
  }
  if (rec.attempts >= MAX_VERIFY_ATTEMPTS) {
    cache.remove(otpKey(mobile));
    return fail('TOO_MANY_ATTEMPTS', 'Too many wrong codes. Please request a new one.');
  }
  if (entered.length !== 6 || entered !== rec.code) {
    rec.attempts += 1;
    var left = Math.max(0, Math.round((rec.expires - Date.now()) / 1000));
    cache.put(otpKey(mobile), JSON.stringify(rec), left || 1);
    return fail('OTP_INVALID', 'That code is not correct.',
                { attemptsLeft: MAX_VERIFY_ATTEMPTS - rec.attempts });
  }

  // Correct — burn the code so it cannot be replayed.
  cache.remove(otpKey(mobile));
  cache.remove(sendLogKey(mobile));

  var member = findMemberByMobile(mobile);
  if (!member) {
    return fail('NOT_A_MEMBER', 'This mobile number is not on the committee list.');
  }
  // Re-checked here as well: access_in may have been set to 0 in the minutes
  // between the code being emailed and it being entered.
  if (!member.accessIn) {
    return fail('NO_PERMISSION', 'You do not have permission to sign in. Please contact the committee admin.');
  }

  return jsonOut({
    ok: true,
    token: issueToken(member),
    member: {
      id: member.id,
      name: member.name,
      nameTe: member.nameTe,
      isAdmin: member.admIn,   // adm_in = 1 -> full portal, 0 -> funds screens only
    },
    expiresInMin: SESSION_TTL_MINUTES,
  });
}

/* ---------------------------------------------------------------- profile */

/**
 * The signed-in member's own record, including the email address the public
 * API deliberately withholds. Identified by the id inside the signed token,
 * never by anything the caller sends — a member can only ever read themselves.
 */
function handleGetProfile(body) {
  var claims = verifyToken(body.token);
  if (!claims) return fail('UNAUTHORIZED', 'Your session has ended. Please sign in again.');

  var members = readMembers();
  var me = null;
  for (var i = 0; i < members.length; i++) {
    if (String(members[i].id) === String(claims.mid)) { me = members[i]; break; }
  }
  if (!me) return fail('NOT_A_MEMBER', 'This member is no longer on the committee list.');
  if (!me.accessIn) return fail('NO_PERMISSION', 'You do not have permission to sign in.');

  return jsonOut({ ok: true, profile: profileOf(me) });
}

/** Also returns position and photos, so the profile screen needs one call. */
function profileOf(m) {
  var row = rawRowFor(m.id) || {};
  return {
    id: m.id,
    name: m.name,
    nameTe: m.nameTe,
    position: row.position_en || '',
    positionTe: row.position_te || '',
    mobile: m.mobile,
    email: m.email,
    photo: row.photo || '',
    profilePhoto: row.prfle_photo || '',
    isAdmin: m.admIn,
  };
}

/** The columns readMembers() does not carry, fetched by id. */
function rawRowFor(id) {
  var sheet = membersTab();
  var values = sheet.getDataRange().getValues();
  var header = values[0].map(function (h) { return String(h || '').trim().toLowerCase(); });
  var iId = header.indexOf('id');
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][iId]) === String(id)) {
      var out = {};
      for (var c = 0; c < header.length; c++) out[header[c]] = values[r][c];
      return out;
    }
  }
  return null;
}

function membersTab() {
  var ss = SpreadsheetApp.openById(MEMBERS_SHEET_ID);
  var sheet = MEMBERS_TAB_NAME ? ss.getSheetByName(MEMBERS_TAB_NAME) : ss.getSheets()[0];
  if (!sheet) throw new Error('Members tab not found.');
  return sheet;
}

/**
 * Updates the signed-in member's own name (English and Telugu), mobile and
 * email. Nothing else is writable here: position and the access flags are the
 * committee's business, not the member's, and letting a member set adm_in would
 * hand out the portal.
 *
 * Changing the mobile changes how they sign in next time, so it must stay
 * unique across the sheet — otherwise two rows would answer to one number.
 *
 * name_te is optional. It is how the member's name renders on the public site
 * in Telugu, and plenty of rows have not been filled in yet; refusing a save
 * because of it would block a member from correcting their own email.
 */
function handleUpdateProfile(body) {
  var claims = verifyToken(body.token);
  if (!claims) return fail('UNAUTHORIZED', 'Your session has ended. Please sign in again.');

  var name = String(body.name || '').trim();
  var nameTe = String(body.nameTe || '').trim();
  var mobile = normaliseMobile(body.mobile);
  var email = String(body.email || '').trim();

  if (!name) return fail('BAD_NAME', 'Please enter a name.');
  if (mobile.length !== 10) return fail('BAD_MOBILE', 'Enter a 10-digit mobile number.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return fail('BAD_EMAIL', 'Enter a valid email address — this is where your sign-in code is sent.');
  }

  var members = readMembers();
  for (var i = 0; i < members.length; i++) {
    if (members[i].mobile === mobile && String(members[i].id) !== String(claims.mid)) {
      return fail('MOBILE_TAKEN', 'Another committee member already uses that mobile number.');
    }
  }

  var sheet = membersTab();
  var values = sheet.getDataRange().getValues();
  var header = values[0].map(function (h) { return String(h || '').trim().toLowerCase(); });
  var col = function (nm) { return header.indexOf(nm); };
  var iId = col('id'), iName = col('name_en'), iNameTe = col('name_te'),
      iMobile = col('mobile'), iEmail = col('email'), iUts = col('u_ts');

  for (var r = 1; r < values.length; r++) {
    if (String(values[r][iId]) !== String(claims.mid)) continue;
    if (iName >= 0)   sheet.getRange(r + 1, iName + 1).setValue(name);
    if (iNameTe >= 0) sheet.getRange(r + 1, iNameTe + 1).setValue(nameTe);
    if (iMobile >= 0) sheet.getRange(r + 1, iMobile + 1).setValue(mobile);
    if (iEmail >= 0)  sheet.getRange(r + 1, iEmail + 1).setValue(email);
    // Same audit convention as the rest of the workbook.
    if (iUts >= 0) {
      sheet.getRange(r + 1, iUts + 1)
        .setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'));
    }
    SpreadsheetApp.flush();
    var fresh = readMembers();
    for (var k = 0; k < fresh.length; k++) {
      if (String(fresh[k].id) === String(claims.mid)) {
        return jsonOut({ ok: true, profile: profileOf(fresh[k]) });
      }
    }
    return jsonOut({ ok: true });
  }
  return fail('NOT_A_MEMBER', 'This member is no longer on the committee list.');
}

/* -------------------------------------------------------------------- GET */

/** A plain GET is only ever a health check — it exposes nothing. */
function doGet() {
  var configured = !!PropertiesService.getScriptProperties().getProperty(SIGNING_KEY_PROP);
  var open = 0;
  try {
    open = readMembers().filter(function (m) { return m.bypassIn; }).length;
  } catch (e) { open = -1; }
  return jsonOut({
    ok: true,
    service: 'ssgc-auth',
    configured: configured,
    // How many rows can sign in with the fixed code. Reported on purpose: one
    // GET shows whether any bypass is live, without naming who or the code.
    bypassRows: open,
  });
}
