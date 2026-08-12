import { SHEETS_CONFIG } from '../config/sheetsConfig';
import { withBalances, rupees } from './fundsApi';
import { settleWrite, holdsEntry, lacksEntry } from './settleWrite';
import { readJson } from '../utils/readJson';

// The working pot, through the same Web App the fund uses.
//
// One endpoint, two ledgers. The fund is what the committee collected over the
// year; this is the pot they spend from during the celebration, and a transfer
// out of the fund is the opening credit here. Keeping both in one script is
// what lets that transfer be a single write rather than two calls that can
// leave the books half-moved.
//
// Reading needs only a session; writing needs adm_in = 1, which the script
// enforces — this file is bundled and cannot be trusted to.

const API = (SHEETS_CONFIG.api && SHEETS_CONFIG.api.funds) || null;

export const isTxnConfigured = () => Boolean(API);

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
    console.error('Transactions write failed:', err);
    return { ok: false, error: 'Could not reach the funds service. Check your connection.' };
  }
};

export const fetchTxns = async (token) => {
  if (!API) return { ok: false, error: NOT_SET };
  return readJson(`${API}?what=txns&token=${encodeURIComponent(token)}`, {
    label: 'funds service', cache: 'no-store',
  });
};

// Settled the same way the fund's writes are — the hiccup is the transport's,
// so it belongs to both ledgers equally.
export const saveTxn = (token, entry) => settleWrite({
  attempt: () => post({ action: 'saveTxn', token, entry }),
  reread: () => fetchTxns(token),
  rowsOf: (res) => res.txns,
  landed: (rows) => holdsEntry(rows, entry),
});

export const deleteTxn = (token, trnsctnId) => settleWrite({
  attempt: () => post({ action: 'deleteTxn', token, trnsctn_id: trnsctnId }),
  reread: () => fetchTxns(token),
  rowsOf: (res) => res.txns,
  landed: (rows) => lacksEntry(rows, trnsctnId),
});

/* ------------------------------------------------------------- the pot */

/**
 * The floor the committee asked to be warned at.
 *
 * One number in one place. Fixed rather than a percentage of the pot, which is
 * what was asked for and is also the honest reading: ten thousand rupees buys
 * roughly the same amount of pandal whether the year's pot was forty thousand
 * or four hundred.
 */
export const LOW_BALANCE = 10000;

export const KINDS = [
  { key: 'opening', label: 'Opening' },
  { key: 'credit', label: 'Money in' },
  { key: 'spend', label: 'Money out' },
];

export const MODES = ['Cash', 'UPI', 'Bank', 'Cheque'];

/** The direction a kind moves money, and what to call the box that holds it. */
export const amountLabelFor = (kind) => {
  if (kind === 'opening') return 'Opening amount';
  if (kind === 'spend') return 'Amount spent';
  return 'Amount received';
};

/** "Paid to" is only true one way round, and not at all for a transfer. */
export const partyLabelFor = (kind) => (kind === 'credit' ? 'Received from' : 'Paid to');

/**
 * What the pot holds, and how much of it has gone.
 *
 * `pot` is the opening plus anything that came in afterwards — a donation
 * mid-festival is as spendable as the transfer that started it, so counting
 * only the opening would understate what there was. `spent` is every debit.
 * `left` is the difference, and is the same figure as the last row's running
 * balance; it is computed rather than read so a hand-edited sheet cannot make
 * the bar disagree with the rows underneath it.
 */
export const summariseTxns = (rows) => {
  let opening = 0;
  let credits = 0;
  let spent = 0;

  for (const r of rows) {
    const c = Number(r.credit) || 0;
    const d = Number(r.debit) || 0;
    if (String(r.kind || '').toLowerCase() === 'opening') opening += c;
    else credits += c;
    spent += d;
  }

  const pot = opening + credits;
  const left = pot - spent;

  return {
    opening,
    credits,
    spent,
    pot,
    left,
    // Clamped, because a bar cannot be drawn past its own end. An overspend is
    // said in words instead — see `state` — rather than by a bar that silently
    // stops growing and reads as merely full.
    percent: pot > 0 ? Math.min(100, Math.round((spent / pot) * 1000) / 10) : 0,
    state: left < 0 ? 'over' : left < LOW_BALANCE ? 'low' : 'healthy',
  };
};

/** The sentence under the bar, or '' when there is nothing to warn about. */
export const warningFor = (totals) => {
  if (!totals.pot) return '';
  if (totals.state === 'over') {
    return `Overspent by ₹${rupees(Math.abs(totals.left))}. The pot held ₹${rupees(totals.pot)}.`;
  }
  if (totals.state === 'low') {
    // The mark itself is not in the sentence. It explained why the warning had
    // appeared, but the warning appearing is the explanation — and a member
    // reading it needs the two figures, not the rule that produced them.
    return `₹${rupees(totals.left)} left out of ₹${rupees(totals.pot)}`;
  }
  return '';
};

/**
 * What one entry would leave in the pot, shown in the drawer before it is saved.
 *
 * Found here, a spend that empties the pot is a decision. Found on the screen
 * afterwards, it is a surprise.
 */
export const effectOf = (totals, editing) => {
  if (!editing) return null;
  const kind = String(editing.kind || 'spend');
  const amount = Number(String(editing.amount || '').replace(/\D/g, '')) || 0;
  if (!amount) return null;

  // An edit replaces its own old figure rather than adding to it, or the line
  // would claim a spend costs twice what it does every time one is corrected.
  const wasCredit = Number(editing.__wasCredit) || 0;
  const wasDebit = Number(editing.__wasDebit) || 0;

  const pot = totals.pot - wasCredit + (kind === 'spend' ? 0 : amount);
  const spent = totals.spent - wasDebit + (kind === 'spend' ? amount : 0);
  const left = pot - spent;

  return { pot, spent, left, state: left < 0 ? 'over' : left < LOW_BALANCE ? 'low' : 'healthy' };
};

/** Rows with their running balance recomputed — the same arithmetic as funds. */
export const withTxnBalances = withBalances;
