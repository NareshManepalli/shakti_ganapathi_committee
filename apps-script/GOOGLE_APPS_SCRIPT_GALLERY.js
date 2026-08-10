/**
 * SSGC — Gallery Web App (Google Drive)
 * ---------------------------------------------------------------------------
 * The gallery lives entirely in Drive. Nothing about photos is stored in the
 * workbook — the folder tree IS the data:
 *
 *   SSGC Gallery/          <- GALLERY_FOLDER_ID points here
 *     2026/                <- a year folder, photos sit directly inside
 *       IMG_2201.jpg
 *       IMG_2202.jpg
 *     2025/
 *       ...
 *
 * If you'd rather group a year by event, put subfolders inside the year and
 * drop photos in those — this script reads one level down as well and folds
 * them into the same year, so nothing silently disappears either way.
 *
 *   GET   -> the tree as JSON, so the public site can list years and photos
 *   POST  -> upload a photo, delete a photo, create a folder, delete a folder
 *
 * LIMIT: 30 photos per year (MAX_PHOTOS_PER_YEAR). Uploads past that are
 * refused with a message naming the year and its current count.
 *
 * WHY THE SITE STILL WORKS WITHOUT THIS SCRIPT
 *   The Gallery section falls back to its empty state when the Web App URL is
 *   not set, so deploying this is additive — nothing breaks while you set it up.
 *
 * IMAGE URLS — read this before "fixing" them
 *   The script returns bare Drive file ids, and the website builds the URL as
 *      https://drive.google.com/thumbnail?id=<id>&sz=w1600
 *   with referrerPolicy="no-referrer" on the <img>.
 *   Do NOT switch to https://drive.google.com/uc?export=view&id=... — Chrome
 *   rejects that form with net::ERR_BLOCKED_BY_ORB and every photo renders
 *   broken. This was measured, not guessed.
 *
 * SETUP  (full click-by-click steps are in sheets/SETUP_STEPS.md)
 *  1. Drive -> your "SSGC Gallery" folder -> Share -> General access:
 *     "Anyone with the link" -> Viewer.
 *  2. Copy the folder id out of the URL and paste it into GALLERY_FOLDER_ID:
 *        https://drive.google.com/drive/folders/THIS_IS_THE_ID
 *  3. script.google.com -> New project -> paste this whole file -> Save.
 *  4. Run makeUploadSecret() once. It generates the write secret, saves it to
 *     Script Properties and logs it — nothing to paste into this file.
 *  5. Deploy -> New deployment -> Web app
 *        Execute as:     Me
 *        Who has access: Anyone
 *     Deploy, authorise, copy the /exec URL.
 *  6. Paste that URL into src/config/sheetsConfig.js -> media.gallery.
 *
 * WRITE PROTECTION
 *   Reads are public — the site needs them. Writes are not: every POST must
 *   carry the write secret. It is REQUIRED, not optional — with none set the
 *   script refuses every write rather than allowing them all.
 *
 *   The secret is kept in Script Properties, never in this file and never in
 *   src/config/sheetsConfig.js. Both of those are committed to a public repo
 *   or bundled into the browser, so a secret in either is a published secret.
 *   The public site only ever reads, so it needs no token at all; the admin
 *   portal holds it from Phase 6.
 * ---------------------------------------------------------------------------
 */

// The committee's "Gallery" folder in Drive (id or full URL — both work).
// https://drive.google.com/drive/folders/1OuWdBCnuMdw5Ese6R925mMARc5x3HsQO
var GALLERY_FOLDER_ID = '1OuWdBCnuMdw5Ese6R925mMARc5x3HsQO';

// One flat folder of event photos, named after the events themselves. The
// Schedule screen in the admin portal lists these by name, so a day is given
// its picture by choosing an event rather than by copying a Drive link.
//
// Add a photo to the folder and it appears in that list; remove one and it
// stops being offered. Nothing here has to change either way.
//
// Share it "Anyone with the link -> Viewer", like the gallery folder: the
// browser loads the chosen photo directly from Drive.
// https://drive.google.com/drive/folders/1nKoW6gFRRPwAY_auPRC_TLFAmQ5J6kQH
var EVENT_IMAGES_FOLDER_ID = '1nKoW6gFRRPwAY_auPRC_TLFAmQ5J6kQH';

// The write secret is NOT stored in this file. This file is committed to a
// public GitHub repo, so a secret written here would be published with it.
// It lives in Script Properties instead: Project Settings -> Script Properties.
// Run makeUploadSecret() once and it is created and saved for you.
var UPLOAD_SECRET_KEY = 'UPLOAD_SECRET';

// Writes may also be authorised by a session token issued by the Auth Web App,
// which is how the admin portal uploads without ever holding the shared secret.
// Put the SAME value the auth script generated into this project's Script
// Properties under this key — Project Settings -> Script Properties. Without
// it, only the shared secret works and the portal cannot upload.
var SIGNING_KEY_PROP = 'SESSION_SIGNING_KEY';

// Refuse anything larger, so one oversized file can't exhaust the Drive quota.
//
// NOTE: this is not the only ceiling, and on videos it is not the binding one.
// A Web App POST is capped by Apps Script itself at around 50 MB, and the file
// arrives base64-encoded, which inflates it by a third — so roughly 35 MB of
// video is the most that can actually come through this endpoint whatever this
// number says. Anything bigger has to be dragged straight into the Drive year
// folder, which the gallery reads either way.
var MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

// What may be uploaded. Videos are Drive-hosted like the photos, and the same
// thumbnail endpoint serves a poster frame for them.
function isAllowedMime(mime) {
  var m = String(mime || '');
  return m.indexOf('image/') === 0 || m.indexOf('video/') === 0;
}

// Photos allowed per year. Uploads that would push a year past this are
// refused. Counted across the whole year, including any event subfolders.
//
// NOTE: this can only be enforced on uploads that come through this script.
// Dragging files straight into the Drive folder bypasses it — Drive has no
// per-folder limit of its own — so the site would then show more than 30.
var MAX_PHOTOS_PER_YEAR = 30;

/* ------------------------------------------------------------------ utils */

function getUploadSecret() {
  return String(PropertiesService.getScriptProperties().getProperty(UPLOAD_SECRET_KEY) || '');
}

/**
 * Run ONCE from the editor. Creates the write secret, saves it to Script
 * Properties, and logs it so you can give it to the admin portal.
 *
 * Safe to run again: if a secret already exists it is shown rather than
 * replaced, so a stray second run can't lock the portal out. Use
 * resetUploadSecret() when you actually intend to rotate it.
 */
function makeUploadSecret() {
  var props = PropertiesService.getScriptProperties();
  var existing = props.getProperty(UPLOAD_SECRET_KEY);
  if (existing) {
    Logger.log('UPLOAD_SECRET already set: ' + existing);
    Logger.log('Run resetUploadSecret() if you really want a new one.');
    return existing;
  }
  var secret = Utilities.getUuid().replace(/-/g, '');
  props.setProperty(UPLOAD_SECRET_KEY, secret);
  Logger.log('UPLOAD_SECRET created and saved: ' + secret);
  return secret;
}

/** Replaces the secret. Anything still using the old one stops working. */
function resetUploadSecret() {
  var secret = Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty(UPLOAD_SECRET_KEY, secret);
  Logger.log('UPLOAD_SECRET REPLACED: ' + secret);
  return secret;
}

/** Prints the current secret, for when you need it again later. */
function showUploadSecret() {
  Logger.log(getUploadSecret() || '(not set — run makeUploadSecret once)');
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Accepts a bare id or a full Drive URL. */
function resolveFolderId(value) {
  var m = String(value || '').match(/[-\w]{25,}/);
  return m ? m[0] : String(value || '');
}

function galleryRoot() {
  var id = resolveFolderId(GALLERY_FOLDER_ID);
  if (!id || id.indexOf('PASTE_') === 0) {
    throw new Error('GALLERY_FOLDER_ID is not set in the script.');
  }
  return DriveApp.getFolderById(id);
}

function findChildFolder(parent, name) {
  var wanted = String(name || '').trim().toLowerCase();
  if (!wanted) return null;
  var it = parent.getFolders();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().toLowerCase() === wanted) return f;
  }
  return null;
}

function getOrCreateChildFolder(parent, name) {
  var wanted = String(name || '').trim();
  if (!wanted) throw new Error('Folder name is required.');
  return findChildFolder(parent, wanted) || parent.createFolder(wanted);
}

/**
 * A write is allowed two ways:
 *
 *   1. the shared UPLOAD_SECRET — for scripts and one-off maintenance
 *   2. a session token signed by the Auth Web App, carrying adm_in = 1
 *
 * The second is what the admin portal uses. It means the browser never holds
 * the shared secret: it holds a token that expires in an hour, is tied to one
 * member, and cannot be edited without breaking its signature.
 */
function requireToken(body) {
  var supplied = String(body.token || '');
  var secret = getUploadSecret();

  if (secret && supplied === secret) return { via: 'secret' };

  var claims = verifySessionToken(supplied);
  if (claims) {
    // Only full-access members may change the gallery. adm_in = 0 sees the
    // funds screens and nothing else.
    if (Number(claims.adm) !== 1) throw new Error('You do not have permission to change the gallery.');
    return { via: 'session', memberId: claims.mid, name: claims.nm };
  }

  if (!secret) throw new Error('Server is not configured: run makeUploadSecret() once.');
  throw new Error('Unauthorized.');
}

/**
 * Verifies a token minted by the Auth Web App. Same HMAC, same key — the key
 * lives in Script Properties in both projects, never in either file.
 * Returns the claims, or null if the signature or the expiry fails.
 */
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
  Logger.log('Signing key stored. The admin portal can now upload with a session token.');
}

/**
 * Images directly inside `folder`, plus those one level down. `event` records
 * which subfolder a photo came from — the public site ignores it, the admin
 * portal will use it to show where a photo lives.
 */
function readImages(folder, eventName, out) {
  var acc = out || [];
  var fileIt = folder.getFiles();
  while (fileIt.hasNext()) {
    var f = fileIt.next();
    var mime = f.getMimeType() || '';
    if (!isAllowedMime(mime)) continue;   // photos and videos, nothing else
    acc.push({
      id: f.getId(),
      name: f.getName(),
      event: eventName || '',
      // The browser needs this to know whether to render a tile or a player.
      mime: mime,
    });
  }
  return acc;
}

/**
 * How many photos a year already holds, counting event subfolders. Kept
 * separate from readYear so the quota check doesn't build the whole list of
 * file objects just to measure its length.
 */
function countYearImages(yearFolder) {
  function countIn(folder) {
    var n = 0;
    var it = folder.getFiles();
    while (it.hasNext()) {
      if (isAllowedMime(it.next().getMimeType())) n += 1;
    }
    return n;
  }
  var total = countIn(yearFolder);
  var subIt = yearFolder.getFolders();
  while (subIt.hasNext()) {
    total += countIn(subIt.next());
  }
  return total;
}

function readYear(yearFolder) {
  var images = readImages(yearFolder, '');
  // Fold in any event subfolders, so photos filed one level deeper still show.
  var subIt = yearFolder.getFolders();
  while (subIt.hasNext()) {
    var sub = subIt.next();
    readImages(sub, sub.getName(), images);
  }
  images.sort(function (a, b) { return a.name.localeCompare(b.name); });
  return images;
}

/**
 * The event photos, flat, newest name order.
 *
 * The folder is a constant here rather than something the caller names in the
 * query string. This script runs as its owner, so an endpoint that read back
 * whatever folder id it was handed would let any stranger with the /exec URL
 * read any folder that Google account can see.
 */
function readEventImages() {
  var id = resolveFolderId(EVENT_IMAGES_FOLDER_ID);
  if (!id || id.indexOf('PASTE_') === 0) return [];
  var images = readImages(DriveApp.getFolderById(id), '');
  images.sort(function (a, b) { return a.name.localeCompare(b.name); });
  return images;
}

/* -------------------------------------------------------------- READ (GET) */
/**
 *  (no params)            -> every year and its photos
 *  ?action=year&year=2025 -> just that year, when the whole tree is overkill
 *  ?action=eventImages    -> the event photo folder, for the schedule editor
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    var action = String(params.action || 'tree');

    // Answered before galleryRoot(), which throws when the gallery folder is
    // unset — the two folders are unrelated and one missing must not take the
    // other down with it.
    if (action === 'eventImages') {
      return jsonOut({ ok: true, images: readEventImages() });
    }

    var root = galleryRoot();

    if (action === 'year') {
      var wanted = String(params.year || '').trim();
      var yf = findChildFolder(root, wanted);
      var yImgs = yf ? readYear(yf) : [];
      return jsonOut({
        ok: true, year: wanted, images: yImgs,
        used: yImgs.length, limit: MAX_PHOTOS_PER_YEAR,
      });
    }

    var years = [];
    var it = root.getFolders();
    while (it.hasNext()) {
      var yearFolder = it.next();
      var imgs = readYear(yearFolder);
      years.push({
        year: yearFolder.getName(), images: imgs,
        used: imgs.length, limit: MAX_PHOTOS_PER_YEAR,
      });
    }
    // Newest first, so the site can take years[0] as its default.
    years.sort(function (a, b) { return String(b.year).localeCompare(String(a.year)); });

    return jsonOut({ ok: true, years: years });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/* ------------------------------------------------------------- WRITE (POST)
 * The admin portal posts JSON as text/plain. That is deliberate: Apps Script
 * cannot answer a CORS preflight, and text/plain is a "simple request" that
 * never triggers one.
 *
 *   { action:'upload',       token, year, event?, filename, mimeType, dataBase64 }
 *   { action:'delete',       token, fileId }
 *   { action:'createFolder', token, year, event? }
 *   { action:'deleteFolder', token, year, event? }
 *
 * Deletes move items to the Drive bin rather than erasing them, so a mistaken
 * click on a whole year is recoverable from Drive -> Bin for 30 days.
 */
function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    requireToken(body);

    var action = String(body.action || '').trim();
    var root = galleryRoot();

    /* ---- add a photo ---- */
    if (action === 'upload') {
      var year = String(body.year || '').trim();
      var evt = String(body.event || '').trim(); // optional event subfolder
      var data = String(body.dataBase64 || '');
      if (!year) throw new Error('year is required.');
      if (!data) throw new Error('No file data received.');

      var mimeType = String(body.mimeType || 'image/jpeg');
      if (!isAllowedMime(mimeType)) throw new Error('Only photos and videos can be uploaded.');

      var bytes = Utilities.base64Decode(data);
      if (bytes.length > MAX_UPLOAD_BYTES) {
        throw new Error('File is larger than ' + Math.round(MAX_UPLOAD_BYTES / 1048576) + ' MB.');
      }

      var yearFolder = getOrCreateChildFolder(root, year);

      // Checked before the file is written, so a refused upload leaves nothing
      // behind. Counted per year, not per event folder.
      var already = countYearImages(yearFolder);
      if (already >= MAX_PHOTOS_PER_YEAR) {
        throw new Error(
          year + ' already has ' + already + ' files and the limit is ' +
          MAX_PHOTOS_PER_YEAR + ' per year. Delete some before adding more.'
        );
      }

      var target = evt ? getOrCreateChildFolder(yearFolder, evt) : yearFolder;

      var blob = Utilities.newBlob(bytes, mimeType, String(body.filename || 'photo.jpg'));
      var file = target.createFile(blob);

      // Share the file itself rather than relying on folder inheritance, so
      // tightening the folder later can't silently break published photos.
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (shareErr) { /* shared drives manage sharing themselves */ }

      return jsonOut({
        ok: true,
        image: { id: file.getId(), name: file.getName(), event: evt },
        // So the admin portal can show "18 of 30 used" without a second call.
        used: already + 1,
        limit: MAX_PHOTOS_PER_YEAR,
        remaining: MAX_PHOTOS_PER_YEAR - (already + 1),
      });
    }

    /* ---- remove a photo ---- */
    if (action === 'delete') {
      var fileId = String(body.fileId || '').trim();
      if (!fileId) throw new Error('fileId is required.');
      DriveApp.getFileById(fileId).setTrashed(true);
      return jsonOut({ ok: true, id: fileId });
    }

    /* ---- create a year folder, or an event folder inside a year ---- */
    if (action === 'createFolder') {
      var cy = String(body.year || '').trim();
      var ce = String(body.event || '').trim();
      if (!cy) throw new Error('year is required.');
      var yFolder = getOrCreateChildFolder(root, cy);
      if (ce) {
        return jsonOut({ ok: true, year: yFolder.getName(), event: getOrCreateChildFolder(yFolder, ce).getName() });
      }
      return jsonOut({ ok: true, year: yFolder.getName() });
    }

    /* ---- bin a whole year, or one event folder inside a year ---- */
    if (action === 'deleteFolder') {
      var dy = String(body.year || '').trim();
      var de = String(body.event || '').trim();
      if (!dy) throw new Error('year is required.');
      var dYear = findChildFolder(root, dy);
      if (!dYear) throw new Error('Year folder not found: ' + dy);
      if (de) {
        var dEvent = findChildFolder(dYear, de);
        if (!dEvent) throw new Error('Event folder not found: ' + de);
        dEvent.setTrashed(true);
        return jsonOut({ ok: true, year: dy, event: de, trashed: true });
      }
      dYear.setTrashed(true);
      return jsonOut({ ok: true, year: dy, trashed: true });
    }

    throw new Error('Unknown action: ' + action);
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}
