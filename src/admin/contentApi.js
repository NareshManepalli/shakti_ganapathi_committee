import { SHEETS_CONFIG } from '../config/sheetsConfig';
import { readJson } from '../utils/readJson';

// Reads and writes the three data sheets through the Content Web App.
//
// Every call carries the member's session token; the script refuses anything
// without adm_in = 1. This endpoint returns the private member columns too
// (email and the access flags), which is exactly why it is gated — the public
// members API deliberately withholds them.

const API = (SHEETS_CONFIG.api && SHEETS_CONFIG.api.content) || null;

export const isContentConfigured = () => Boolean(API);

const NOT_SET = 'The editing service is not connected yet.';

const post = async (payload) => {
  if (!API) return { ok: false, error: NOT_SET };
  try {
    const res = await fetch(API, {
      method: 'POST',
      // text/plain avoids the CORS preflight Apps Script cannot answer
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    const text = await res.text();
    if (/^\s*</.test(text)) return { ok: false, error: 'The editing service did not respond properly.' };
    return JSON.parse(text);
  } catch (err) {
    console.error('Content write failed:', err);
    return { ok: false, error: 'Could not reach the editing service. Check your connection.' };
  }
};

/** Everything the editor screens need, in one call. */
export const fetchAll = async (token) => {
  if (!API) return { ok: false, error: NOT_SET };
  return readJson(`${API}?token=${encodeURIComponent(token)}`, {
    label: 'editing service', cache: 'no-store',
  });
};

export const saveContent = (token, section, fields) =>
  post({ action: 'saveContent', token, section, ...fields });

export const saveScheduleDay = (token, day) => post({ action: 'saveSchedule', token, day });
export const deleteScheduleDay = (token, id) => post({ action: 'deleteSchedule', token, id });

export const saveMember = (token, member) => post({ action: 'saveMember', token, member });
export const deleteMember = (token, id) => post({ action: 'deleteMember', token, id });

/** Rows the public site would show — a_in = 1, in display order where it exists. */
export const activeRows = (rows, orderKey) => {
  const live = (rows || []).filter((r) => String(r.a_in ?? '1').trim() === '1');
  if (!orderKey) return live;
  return live.sort((a, b) => (Number(a[orderKey]) || 0) - (Number(b[orderKey]) || 0));
};
