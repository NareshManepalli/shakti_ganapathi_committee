import { SHEETS_CONFIG } from '../config/sheetsConfig';
import { settleWrite, holdsEntry, lacksEntry } from './settleWrite';
import { readJson } from '../utils/readJson';

// The committee's money ledger, through the Funds Web App.
//
// One dated row per movement: the monthly collection, and each thing it was
// spent on. Reading needs only a session; writing needs adm_in = 1, which the
// script enforces — this file is bundled and cannot be trusted to.

const API = (SHEETS_CONFIG.api && SHEETS_CONFIG.api.funds) || null;

export const isFundsConfigured = () => Boolean(API);

const NOT_SET = 'The funds service is not connected yet.';

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
    if (/^\s*</.test(text)) return { ok: false, error: 'The funds service did not respond properly.' };
    return JSON.parse(text);
  } catch (err) {
    console.error('Funds write failed:', err);
    return { ok: false, error: 'Could not reach the funds service. Check your connection.' };
  }
};

export const fetchFunds = async (token) => {
  if (!API) return { ok: false, error: NOT_SET };
  return readJson(`${API}?token=${encodeURIComponent(token)}`, {
    label: 'funds service', cache: 'no-store',
  });
};

// Both writes settle themselves rather than reporting a failure they cannot
// vouch for. See settleWrite.js: a lost answer is decided by reading the ledger
// back, because a retry on a write that already landed is what puts an entry in
// the sheet twice.
export const saveFund = (token, entry) => settleWrite({
  attempt: () => post({ action: 'saveFund', token, entry }),
  reread: () => fetchFunds(token),
  rowsOf: (res) => res.funds,
  landed: (rows) => holdsEntry(rows, entry),
});

export const deleteFund = (token, trnsctnId) => settleWrite({
  attempt: () => post({ action: 'deleteFund', token, trnsctn_id: trnsctnId }),
  reread: () => fetchFunds(token),
  rowsOf: (res) => res.funds,
  landed: (rows) => lacksEntry(rows, trnsctnId),
});

/* ------------------------------------------------------------- shaping */

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DMY = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;

/** `11-01-2026` -> 20260111, which sorts and compares as a plain number. */
export const dateKey = (dmy) => {
  const m = DMY.exec(String(dmy || '').trim());
  return m ? Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]) : 0;
};

export const yearOf = (dmy) => {
  const m = DMY.exec(String(dmy || '').trim());
  return m ? m[3] : '';
};

export const monthOf = (dmy) => {
  const m = DMY.exec(String(dmy || '').trim());
  return m ? (MONTHS[Number(m[2]) - 1] || '') : '';
};

/** `2026-01-11` from an <input type="date"> -> `11-01-2026` for the sheet. */
export const toDmy = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

/** …and back, so a stored date can seed the date picker. */
export const toIso = (dmy) => {
  const m = DMY.exec(String(dmy || '').trim());
  return m ? `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}` : '';
};

/**
 * Indian digit grouping — 1,04,000 rather than 104,000. The committee reads
 * these aloud at meetings, and the other grouping is read wrong.
 */
export const rupees = (n) => {
  const v = Math.round(Number(n) || 0);
  const neg = v < 0;
  const s = String(Math.abs(v));
  const last = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last}` : last;
  return `${neg ? '-' : ''}${grouped}`;
};

/** Oldest first: by date, then by sno for two movements on the same day. */
export const inOrder = (rows) => [...(rows || [])].sort((a, b) => {
  const ka = dateKey(a.date);
  const kb = dateKey(b.date);
  if (ka !== kb) return ka - kb;
  return (Number(a.sno) || 0) - (Number(b.sno) || 0);
});

/**
 * The running balance, recomputed rather than trusted.
 *
 * The sheet carries a balance column and has done since the committee kept it
 * by hand, but a stored running total is only correct until someone inserts a
 * row in the middle or removes one. Computing it here means the ledger on
 * screen is arithmetic, not memory — a credit adds, a debit subtracts, exactly
 * as a bank statement reads down the page. `drift` says whether the stored
 * column still agrees, so a sheet edited by hand cannot quietly disagree with
 * the statement handed out at a meeting.
 */
export const withBalances = (rows) => {
  let running = 0;
  return inOrder(rows).map((r) => {
    const credit = Number(r.credit) || 0;
    const debit = Number(r.debit) || 0;
    running += credit - debit;
    return {
      ...r,
      credit,
      debit,
      balance: running,
      drift: (Number(r.balance) || 0) !== running,
      // The date decides, so a hand-typed year or month cannot put a row in a
      // month its own date does not fall in.
      year: yearOf(r.date) || String(r.year || ''),
      month: monthOf(r.date) || String(r.month || ''),
    };
  });
};

/** Totals and per-month rollup for one year's rows. */
export const summarise = (rows) => {
  const credit = rows.reduce((t, r) => t + (Number(r.credit) || 0), 0);
  const debit = rows.reduce((t, r) => t + (Number(r.debit) || 0), 0);

  const byMonth = new Map();
  for (const r of rows) {
    const name = r.month;
    if (!name) continue;
    const at = byMonth.get(name)
      || { month: name, index: MONTHS.indexOf(name), credit: 0, debit: 0, persons: new Set() };
    at.credit += Number(r.credit) || 0;
    at.debit += Number(r.debit) || 0;
    String(r.fund_persons || '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .forEach((p) => at.persons.add(p));
    byMonth.set(name, at);
  }

  const months = [...byMonth.values()]
    .sort((a, b) => a.index - b.index)
    .map((m) => ({ ...m, persons: [...m.persons], net: m.credit - m.debit }));

  return {
    credit,
    debit,
    // The closing balance is the last row's running total, which carries any
    // opening balance from before this year. credit − debit would drop it.
    balance: rows.length ? rows[rows.length - 1].balance : 0,
    months,
  };
};

/* ------------------------------------------------------- statement range */

/** Today as `dd-mm-yyyy`, the shape every stored date takes. */
export const todayDmy = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
};

const daysIn = (year, month) => new Date(Number(year), Number(month), 0).getDate();

/**
 * Turns whatever the committee chose into two dates.
 *
 * The three ways of asking are the same question at different resolutions, so
 * they resolve to the same pair rather than each being handled separately
 * downstream. A period that has not finished is cut at today: a statement
 * records what has happened, and one headed "to 31 August" in the middle of
 * August claims a fortnight that has not been collected yet.
 */
export const resolveRange = (choice, today = todayDmy()) => {
  const now = dateKey(today);
  const clamp = (dmy) => (dateKey(dmy) > now ? today : dmy);
  const c = choice || {};

  if (c.mode === 'year' && c.year) {
    return { from: `01-01-${c.year}`, to: clamp(`31-12-${c.year}`) };
  }

  if (c.mode === 'months' && c.fromMonth && c.toMonth) {
    // <input type="month"> gives YYYY-MM
    const [fy, fm] = c.fromMonth.split('-');
    const [ty, tm] = c.toMonth.split('-');
    const last = String(daysIn(ty, tm)).padStart(2, '0');
    return { from: `01-${fm}-${fy}`, to: clamp(`${last}-${tm}-${ty}`) };
  }

  if (c.mode === 'dates' && (c.fromDate || c.toDate)) {
    return {
      from: c.fromDate ? toDmy(c.fromDate) : '',
      to: c.toDate ? toDmy(c.toDate) : '',
    };
  }

  // Nothing chosen: the whole ledger, however far back it goes.
  return { from: '', to: '' };
};

/** Rows falling inside the range, ends included. */
export const inRange = (rows, range) => {
  const from = range && range.from ? dateKey(range.from) : -Infinity;
  const to = range && range.to ? dateKey(range.to) : Infinity;
  return (rows || []).filter((r) => {
    const k = dateKey(r.date);
    return k >= from && k <= to;
  });
};

/** `05-10-2025` -> `Oct 2025`. */
export const monthYearOf = (dmy) => {
  const m = DMY.exec(String(dmy || '').trim());
  return m ? `${MONTHS[Number(m[2]) - 1].slice(0, 3)} ${m[3]}` : '';
};

/**
 * How the range reads on the statement and in the drawer that chose it.
 *
 * An unbounded statement is still a statement about a period — it just did not
 * have one typed for it. Naming the span the entries actually cover, first
 * month to this one, says more than "All records" and cannot go stale the way a
 * fixed caption would.
 */
export const rangeLabel = (range, rows) => {
  const { from, to } = range || {};
  if (from && to) return `From ${from} to ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Up to ${to}`;

  const first = rows && rows.length ? monthYearOf(rows[0].date) : '';
  return first ? `From ${first} to ${monthYearOf(todayDmy())}` : 'All records';
};
