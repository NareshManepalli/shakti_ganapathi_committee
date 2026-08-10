import { SHEETS_CONFIG } from '../config/sheetsConfig';
import { toMediaUrl } from '../utils/sheetService';

// Writes to the Drive gallery, authorised by the member's session token.
//
// The token is what the browser holds — never the script's shared upload
// secret. It expires in an hour, is tied to one member, and carries adm_in
// inside its signature, so the script can refuse a funds-only member without
// trusting anything the browser says.

const API = (SHEETS_CONFIG.media && SHEETS_CONFIG.media.gallery) || null;

export const isGalleryConfigured = () => Boolean(API);

const post = async (payload) => {
  if (!API) return { ok: false, error: 'The gallery is not connected yet.' };
  try {
    const res = await fetch(API, {
      method: 'POST',
      // text/plain is a "simple request", so it never triggers a CORS
      // preflight — which Apps Script cannot answer.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    const text = await res.text();
    if (/^\s*</.test(text)) return { ok: false, error: 'The gallery service did not respond properly. Try again.' };
    return JSON.parse(text);
  } catch (err) {
    console.error('Gallery write failed:', err);
    return { ok: false, error: 'Could not reach the gallery. Check your connection.' };
  }
};

/** Year folders and their photos, newest year first. */
export const fetchTree = async () => {
  if (!API) return null;
  try {
    const res = await fetch(API, { cache: 'no-store', redirect: 'follow' });
    if (!res.ok) return null;
    const text = await res.text();
    if (/^\s*</.test(text)) return null;
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.years)) return null;
    return data.years
      .map((y) => ({
        year: String(y.year || '').trim(),
        used: Number(y.used) || (y.images || []).length,
        limit: Number(y.limit) || 30,
        images: (y.images || []).map((im) => {
          const mime = String(im.mime || '');
          return {
            id: im.id,
            name: im.name || '',
            mime,
            isVideo: mime.indexOf('video/') === 0,
            // 600px for the grid; the preview asks for a bigger one separately.
            // Drive serves a poster frame from the same endpoint for a video.
            thumb: toMediaUrl(im.id, 600),
            full: toMediaUrl(im.id, 1600),
            // A video cannot be played from the thumbnail endpoint — Drive's own
            // player is the only thing that will stream it back.
            play: `https://drive.google.com/file/d/${im.id}/preview`,
          };
        }),
      }))
      .filter((y) => y.year)
      .sort((a, b) => (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0));
  } catch (err) {
    console.error('Could not read the gallery:', err);
    return null;
  }
};

/**
 * The event photo folder, as pickable options for the schedule editor.
 *
 * `null` means the list could not be read — the folder is unset, the script has
 * not been redeployed with the eventImages action, or the network is down. The
 * caller shows a plain link box in that case rather than an empty dropdown,
 * which would look like the folder was simply empty.
 */
export const fetchEventImages = async () => {
  if (!API) return null;
  try {
    const res = await fetch(`${API}?action=eventImages`, { cache: 'no-store', redirect: 'follow' });
    if (!res.ok) return null;
    const text = await res.text();
    if (/^\s*</.test(text)) return null;
    const data = JSON.parse(text);
    if (!data || !data.ok || !Array.isArray(data.images)) return null;

    return data.images
      .filter((im) => im && im.id)
      .map((im) => {
        const name = String(im.name || '').trim();
        return {
          id: im.id,
          name,
          // The extension is a fact about the file, not about the event.
          label: name.replace(/\.[a-z0-9]{2,5}$/i, '') || im.id,
          url: `https://drive.google.com/file/d/${im.id}/view?usp=sharing`,
        };
      });
  } catch (err) {
    console.error('Could not read the event images:', err);
    return null;
  }
};

/** Reads a File into the base64 the Apps Script upload expects. */
export const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const s = String(reader.result || '');
    resolve(s.slice(s.indexOf(',') + 1));   // strip the data: prefix
  };
  reader.onerror = () => reject(new Error('Could not read ' + file.name));
  reader.readAsDataURL(file);
});

export const uploadPhoto = (token, { year, filename, mimeType, dataBase64 }) =>
  post({ action: 'upload', token, year, filename, mimeType, dataBase64 });

export const deletePhoto = (token, fileId) => post({ action: 'delete', token, fileId });

export const createYear = (token, year) => post({ action: 'createFolder', token, year });

export const deleteYear = (token, year) => post({ action: 'deleteFolder', token, year });
