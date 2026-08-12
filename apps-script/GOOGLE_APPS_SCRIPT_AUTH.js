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

// The emblem at the top of the code email — the image itself, not a link to it.
//
// Two reasons it is carried here rather than fetched. Mail clients block remote
// images until the reader asks, so a linked logo shows as an empty box on the
// one message where the committee most wants to look like themselves. And
// fetching it needed UrlFetchApp, which widens the script's OAuth scopes — a
// deployment made without re-authorising then throws on every send, silently,
// and the email goes out plain. That is exactly what happened.
//
// 108px, which is twice the 54 it is shown at. logo.png itself is 3.2 MB.
// To replace it: draw the new file to a 108x108 canvas, take the base64 out of
// toDataURL, and paste it here in the same wrapped form.
var LOGO_PNG_B64 = [
  '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',
  'WCgYXLalK35Hc2/u6699mDj/u7e1XvDjx7rvemlDonPHvv5fpv9jBLYDE2IvrIosvfHJnjsfXNR1+YfNyVO39GSOfHNN5JJ3',
  '14fva2kfWGslQqmRvhi71ac4cExarp5yHDcli/0bx5Nn5Dh5Zp6TZ9hB0tOznDg1yzGTshwyPsNeI9JMrUjit6Kp/r7B9Ss3',
  'DjzwxtroN5q6c0du7sid+sw74e9cfk/HHb97pXdxP0R36Nd/RPI/UWDbGWN9KAbKXa8PrL/xie7Xb3kh+OvFwa4zOzqzu771',
  'YXDkL5/q3vP2V4Ln/WnZ4A1vrg49uGJT+LV1LeGVG1ujW5q6oi2tPbGWlu7Yli0d0VVrmsOvL10XeejVD0I/vf+N4AW/eqZz',
  '72eX9o+OJzNzm3s6T//pk92/uObhjld/+lTn+lfWR21DYugQt70n/0Hxf7LAPs2m3Ouvk7rl9b7Yw8vi3UubUm89//7gbXe9',
  '0vvNm5/t/sINf+re54ePds289tHOMd99oHPEVfd3jLj6gY4x332wc8a1j3Ttff2TnSf+6pnuyx58Z+DWRetTrz+5ItF5zcN9',
  'sbuEpjSUk/Bf4f+cwP4rOv//Yyf/J7D/Mqn/T2D/E9h/GQf+y7r7/wAAAP//LFx3gQAAAAZJREFUAwC92DP141z6AgAAAABJ',
  'RU5ErkJggg=='
].join('');

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

/**
 * The emblem as a blob to attach — or null, and the email goes without it.
 *
 * No network and no extra scope: the bytes are in this file. A member waiting
 * on a sign-in code must never be kept waiting by a picture, so even this
 * cannot throw.
 */
function committeeLogo() {
  try {
    return Utilities.newBlob(Utilities.base64Decode(LOGO_PNG_B64), 'image/png', 'logo.png')
      .setName('logo.png');
  } catch (err) {
    Logger.log('Logo unavailable, sending without it: ' + err);
    return null;
  }
}

/**
 * Sends a real code to one member, to see the email as they will.
 *
 * Run from the editor: checkOtpEmail('9000000001'). It goes through exactly the
 * path a sign-in takes, so if the emblem is missing here it is missing for
 * everyone — and if this run prompts for authorisation, that prompt is the
 * answer to why an earlier version sent nothing.
 */
function checkOtpEmail(mobile) {
  var member = findMemberByMobile(mobile);
  if (!member) throw new Error('No single member holds ' + mobile + '.');
  if (!member.email) throw new Error(member.name + ' has no email address.');

  var logo = committeeLogo();
  Logger.log('Emblem: ' + (logo ? logo.getBytes().length + ' bytes' : 'MISSING'));
  sendOtpEmail(member, '000000');
  Logger.log('Sent to ' + maskEmail(member.email) + ' — the code in it is not a real one.');
}

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

  var logo = committeeLogo();

  var html =
    '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:460px;margin:0 auto;' +
    'background:#0e1b33;color:#eaf0fb;padding:28px 26px;border-radius:14px">' +
    // Only when there is one to show: an <img> whose source never arrives is a
    // broken-image icon at the top of the committee's own email.
    (logo
      ? '<img src="cid:ssgclogo" width="54" height="54" alt="" '
        + 'style="display:block;width:54px;height:54px;border-radius:50%;margin:0 0 14px">'
      : '') +
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
    // Keyed to the cid: the html refers to. Omitted entirely when the fetch
    // failed, so the message is a clean text-and-code email rather than one
    // with a hole where a picture should be.
    inlineImages: logo ? { ssgclogo: logo } : undefined,
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
