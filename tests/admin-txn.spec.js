import { test, expect } from '@playwright/test';
import { FUNDS_STUB } from '../playwright.config.js';

// Transactions — the working pot — against a stubbed Funds Web App.
//
// Stubbed for the same reason the funds specs are: a live run would write
// invented money into the committee's own books. The stub recomputes the
// running balance the way the Apps Script does, so a spec failing here means
// the two halves have drifted apart rather than that the stub is wrong.
const API = FUNDS_STUB;

// An hour from whenever the suite runs, not an hour from a date typed here.
// Pinned, it lapsed the moment real time passed it, and every spec in the file
// then failed at the gate — a session expiring is not something these are about.
const session = {
  token: 'stub-token',
  member: { id: 1, name: 'Venkat Naresh', isAdmin: true },
  get expiresAt() { return Date.now() + 60 * 60 * 1000; },
};

const M = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const txn = (id, date, kind, amount, reason, paid_to = '', mode = 'Cash') => {
  const [, mo, y] = date.split('-');
  const spend = kind === 'spend';
  return {
    sno: 0, trnsctn_id: id, date, year: y, month: M[Number(mo) - 1],
    credit: spend ? 0 : amount, debit: spend ? amount : 0, balance: 0,
    annual_year: '2025 - 2026', annual_yr_id: '2',
    kind, reason, paid_to, mode,
  };
};

// The worked example from sheets/transactions.csv: a pot of 32,500 with 23,000
// gone, which lands at 9,500 — deliberately under the 10,000 mark, so the
// warning and the amber bar are the default state these specs see.
const SEED = [
  txn('TXN2025000001', '01-08-2026', 'opening', 30000, 'Opening amount from annual funds', '', 'Bank'),
  txn('TXN2025000002', '03-08-2026', 'spend', 6500, 'Pandal advance', 'Sri Venkateswara Decorators', 'UPI'),
  txn('TXN2025000003', '05-08-2026', 'spend', 4200, 'Sound system advance', 'Balaji Sounds'),
  txn('TXN2025000004', '06-08-2026', 'credit', 2500, 'Donation received', 'Sri Ramesh Kumar', 'UPI'),
  txn('TXN2025000005', '07-08-2026', 'spend', 5600, 'Idol advance', 'Kalakar Vinayaka Works', 'Bank'),
  txn('TXN2025000006', '08-08-2026', 'spend', 3800, 'Decoration material', 'Sri Lakshmi Traders'),
  txn('TXN2025000007', '10-08-2026', 'spend', 2900, 'Prasadam - first day', 'Annapurna Sweets'),
];

const key = (dmy) => {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(dmy);
  return m ? Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]) : 0;
};

/** The server's half of the contract, as the script does it. */
const restate = (rows) => {
  let running = 0;
  return [...rows]
    .sort((a, b) => key(a.date) - key(b.date) || Number(a.sno) - Number(b.sno))
    .map((r, i) => {
      running += (Number(r.credit) || 0) - (Number(r.debit) || 0);
      return { ...r, sno: i + 1, balance: running };
    });
};

const stub = async (page, { rows = SEED, isAdmin = true } = {}) => {
  const state = { rows: restate(rows) };
  const posts = [];

  await page.addInitScript(
    ([k, v]) => sessionStorage.setItem(k, v),
    ['ssgc.session', JSON.stringify({ ...session, member: { ...session.member, isAdmin } })],
  );

  // Day 1 of 2025 and 2026 — the celebration dates the fund years are cut on.
  await page.route(/docs\.google\.com\/spreadsheets/, (route) => route.fulfill({
    contentType: 'text/csv',
    body: [
      'id,year,day_no,date,a_in',
      '1,2025,1,2025-08-27,1',
      '2,2026,1,2026-09-14,1',
    ].join('\n'),
  }));

  await page.route(`${API}**`, async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      posts.push(body);

      if (body.action === 'saveTxn') {
        const e = body.entry || {};
        const id = String(e.trnsctn_id || `TXN2025${String(state.rows.length + 1).padStart(6, '0')}`);
        const next = txn(id, e.date, e.kind, Number(e.credit) || Number(e.debit) || 0,
          e.reason || '', e.paid_to || '', e.mode || '');
        const i = state.rows.findIndex((r) => String(r.trnsctn_id) === id);
        if (i >= 0) state.rows[i] = next; else state.rows.push(next);
      }

      if (body.action === 'deleteTxn') {
        state.rows = state.rows.filter((r) => String(r.trnsctn_id) !== String(body.trnsctn_id));
      }

      state.rows = restate(state.rows);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, txns: state.rows }) });
    }

    // Same endpoint, two ledgers — ?what=txns picks this one.
    const wantsTxns = req.url().includes('what=txns');
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(wantsTxns ? { ok: true, txns: state.rows } : { ok: true, funds: [] }),
    });
  });

  return { posts, state };
};

const open = async (page, opts) => {
  const ctx = await stub(page, opts);
  await page.goto('/admin/transactions');
  return ctx;
};

const panel = (page) => page.locator('.txn-progress');
/** One of the four cards, by the label it carries. */
const card = (page, kind) => page.locator(`.fnd-card.is-${kind}`);

test.describe('transactions', () => {
  test('the pot is the opening plus what came in, and the bar is what has gone', async ({ page }) => {
    await open(page);
    await expect(panel(page)).toBeVisible({ timeout: 20000 });

    // 30,000 opening + 2,500 donation = 32,500 in; 23,000 out; 9,500 left.
    // The four cards carry the figures now; the bar carries none.
    await expect(page.locator('.fnd-card')).toHaveCount(4);
    await expect(card(page, 'year')).toContainText('Opening amount');
    await expect(card(page, 'year')).toContainText('₹30,000');
    await expect(card(page, 'credit')).toContainText('₹2,500');
    await expect(card(page, 'debit')).toContainText('₹23,000');
    await expect(card(page, 'balance')).toContainText('₹9,500');

    // The bar is a scale now: nothing at the left, what has gone marked at the
    // edge of the fill, everything the pot held at the right.
    const ticks = await page.locator('.txn-tick').allTextContents();
    expect(ticks).toEqual(['₹0', '₹23,000', '₹32,500']);

    // A donation is as spendable as the transfer that started the pot, so it
    // counts toward what there was — not toward what is left over after it.
    const width = await page.locator('.txn-bar span').evaluate((el) => el.style.width);
    expect(width).toBe('70.8%');
  });

  test('under ten thousand it warns, and says so in the bar as well', async ({ page }) => {
    await open(page);
    await expect(panel(page)).toHaveClass(/is-low/);
    await expect(page.locator('.txn-warn')).toContainText('Balance is getting low');
    await expect(page.locator('.txn-warn')).toContainText('₹9,500 left out of ₹32,500');
    // The rule that produced the warning is not in the sentence: the warning
    // appearing IS the explanation, and the two figures are what can be acted on.
    await expect(page.locator('.txn-warn')).not.toContainText('10,000 mark');
  });

  test('above the mark it says nothing at all', async ({ page }) => {
    // The same pot with the last two spends dropped: 12,400 left.
    await open(page, { rows: SEED.slice(0, 5) });
    await expect(panel(page)).toHaveClass(/is-healthy/);
    await expect(page.locator('.txn-warn')).toHaveCount(0);
  });

  test('spending past the pot is recorded, not refused', async ({ page }) => {
    await open(page, { rows: [...SEED, txn('TXN2025000008', '11-08-2026', 'spend', 11000, 'Generator hire')] });
    await expect(panel(page)).toHaveClass(/is-over/);
    await expect(page.locator('.txn-warn')).toContainText('Overspent by ₹1,500');
    // The bar cannot be drawn past its own end; the overspend is said in words.
    expect(await page.locator('.txn-bar span').evaluate((el) => el.style.width)).toBe('100%');
  });

  test('an empty year asks for the opening amount rather than drawing an empty bar', async ({ page }) => {
    await open(page, { rows: [] });
    await expect(page.locator('.txn-empty')).toContainText('Nothing in the pot yet');
    await expect(page.getByRole('button', { name: 'Set the opening amount' })).toBeVisible();
    await expect(page.locator('.txn-bar')).toHaveCount(0);
  });

  test('the opening row is marked, and cannot be removed while the year stands on it', async ({ page }) => {
    await open(page);
    await expect(page.locator('.tbl:not(.tbl-ph) tbody tr').first()).toBeVisible({ timeout: 20000 });

    const openingRow = page.locator('.tbl tbody tr', { hasText: 'Opening amount from annual funds' });
    await expect(openingRow.locator('.ed-chip')).toHaveText('opening');
    await expect(openingRow.getByRole('button', { name: /Remove/ })).toBeDisabled();

    // Any other row may go.
    await expect(page.locator('.tbl tbody tr', { hasText: 'Pandal advance' })
      .getByRole('button', { name: /Remove/ })).toBeEnabled();
  });

  test('a second opening is not offered while one exists', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: /Add transaction/ }).click();

    await expect(page.getByRole('radio', { name: 'Opening' })).toBeDisabled();
    await expect(page.getByRole('radio', { name: 'Money out' })).toBeChecked();
  });

  test('the drawer says what an entry will leave in the pot before it is saved', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: /Add transaction/ }).click();

    await page.getByLabel('Amount spent').fill('4000');
    // 9,500 left, less 4,000, is 5,500 — and still under the mark.
    await expect(page.locator('.txn-effect')).toContainText('Leaves ₹5,500 in the pot');
    await expect(page.locator('.txn-effect')).toHaveClass(/is-low/);

    // Turned into money in, the same figure moves the other way.
    await page.getByRole('radio', { name: 'Money in' }).check();
    await expect(page.locator('.txn-effect')).toContainText('Leaves ₹13,500 in the pot');
    await expect(page.locator('.txn-effect')).toHaveClass(/is-healthy/);
  });

  test('a spend is saved as a debit, with its kind, and the pot follows', async ({ page }) => {
    const { posts } = await open(page);
    await page.getByRole('button', { name: /Add transaction/ }).click();

    await page.getByLabel('Date').fill('2026-08-11');
    await page.getByLabel('Amount spent').fill('1500');
    await page.getByLabel('Remarks').fill('Flowers');
    await page.getByLabel('Paid to').fill('Sri Balaji Florists');
    await page.locator('.ed-drawer').getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('.toast-success')).toContainText('Transaction saved', { timeout: 20000 });

    const sent = posts.find((p) => p.action === 'saveTxn');
    expect(sent.entry.kind).toBe('spend');
    expect(sent.entry.debit).toBe(1500);
    expect(sent.entry.credit).toBe(0);
    expect(sent.entry.date).toBe('11-08-2026');

    // 23,000 spent + 1,500 = 24,500, leaving 8,000.
    await expect(card(page, 'debit')).toContainText('₹24,500');
    await expect(card(page, 'balance')).toContainText('₹8,000');
  });

  test('an opening entry offers to record the transfer out of the fund', async ({ page }) => {
    const { posts } = await open(page, { rows: [] });
    await page.getByRole('button', { name: 'Set the opening amount' }).click();

    await expect(page.getByRole('radio', { name: 'Opening' })).toBeChecked();
    // Nobody is paid in a transfer between the committee's own books.
    await expect(page.getByLabel('Paid to')).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toBeChecked();

    await page.getByLabel('Opening amount').fill('30000');
    await page.getByLabel('Remarks').fill('Opening amount from annual funds');
    await page.locator('.ed-drawer').getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('.toast-success')).toContainText('Transaction saved', { timeout: 20000 });
    const sent = posts.find((p) => p.action === 'saveTxn');
    expect(sent.entry.kind).toBe('opening');
    expect(sent.entry.mirror).toBe(true);
    expect(sent.entry.credit).toBe(30000);
  });

  test('a funds-only member reads the pot but cannot touch it', async ({ page }) => {
    await open(page, { isAdmin: false });
    await expect(card(page, 'balance')).toContainText('₹9,500');
    await expect(page.locator('.tbl:not(.tbl-ph) tbody tr').first()).toBeVisible({ timeout: 20000 });

    await expect(page.getByRole('button', { name: /Add transaction/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Edit/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Remove/ })).toHaveCount(0);
    // The statement is theirs to take, though — reading is the whole point.
    await expect(page.getByRole('button', { name: /Download statement/ })).toBeEnabled();
  });

  test('five rows a page, and the search narrows the whole year', async ({ page }) => {
    await open(page);
    await expect(page.locator('.tbl:not(.tbl-ph) tbody tr')).toHaveCount(5);
    await expect(page.locator('.tbl-count')).toHaveText('Showing 1–5 of 7');

    await page.getByRole('searchbox', { name: 'Search transactions' }).fill('Balaji');
    await expect(page.locator('.tbl:not(.tbl-ph) tbody tr')).toHaveCount(1);
    await expect(page.locator('.tbl tbody tr')).toContainText('Sound system advance');
  });

  // Apps Script sometimes answers a POST with an HTML page while the write
  // itself has already run. The browser used to report failure on a write that
  // had landed — and a committee that presses Save again then has the entry
  // twice, which is how the funds sheet came to carry five ids twice over.
  test('a write whose answer is lost is settled by reading, not by retrying', async ({ page }) => {
    const { state } = await stub(page);
    await page.goto('/admin/transactions');
    await expect(page.locator('.txn-progress')).toBeVisible({ timeout: 20000 });

    // The next POST does what it was asked and then throws the reply away.
    await page.route(`${API}**`, async (route) => {
      const req = route.request();
      if (req.method() !== 'POST') return route.fallback();
      const body = JSON.parse(req.postData() || '{}');
      const e = body.entry || {};
      state.rows.push(txn('TXN2025000099', e.date, e.kind, Number(e.debit) || Number(e.credit) || 0,
        e.reason || '', e.paid_to || '', e.mode || ''));
      state.rows = restate(state.rows);
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html>Sorry…</html>' });
    });

    await page.getByRole('button', { name: /Add transaction/ }).click();
    await page.getByLabel('Date').fill('2026-08-11');
    await page.getByLabel('Amount spent').fill('700');
    await page.getByLabel('Remarks').fill('Lost answer');
    await page.locator('.ed-drawer').getByRole('button', { name: 'Save' }).click();

    // Reported as saved, because it was — and the drawer closes rather than
    // sitting open inviting the second press that would duplicate it.
    await expect(page.locator('.toast-success')).toContainText('Transaction saved', { timeout: 20000 });
    await expect(page.locator('.ed-drawer')).toHaveCount(0);

    // Once, not twice — searched rather than read off page one, since an eighth
    // row at five a page is on the second.
    await page.getByRole('searchbox', { name: 'Search transactions' }).fill('Lost answer');
    await expect(page.locator('.tbl:not(.tbl-ph) tbody tr')).toHaveCount(1);
  });

  test('a refusal is still a refusal — it is not read back into a success', async ({ page }) => {
    await stub(page);
    await page.goto('/admin/transactions');
    await expect(page.locator('.txn-progress')).toBeVisible({ timeout: 20000 });

    // A coded failure means the script decided, and nothing was written. Reading
    // back after one of these would be asking a question already answered.
    await page.route(`${API}**`, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, code: 'OPENING_EXISTS', error: 'This fund year already has an opening amount.' }),
      });
    });

    await page.getByRole('button', { name: /Add transaction/ }).click();
    await page.getByLabel('Amount spent').fill('700');
    await page.getByLabel('Remarks').fill('Refused');
    await page.locator('.ed-drawer').getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('.toast-error')).toContainText('Could not save the transaction');
    await expect(page.locator('.toast-error')).toContainText('already has an opening amount');
    await expect(page.locator('.ed-drawer')).toBeVisible();
  });

  // Apps Script answers a good request with an HTML page often enough that the
  // committee saw "the funds service did not respond properly" on screens that
  // were fine a moment later. A read changes nothing, so it is repeated.
  test('a read that fails once is retried rather than reported', async ({ page }) => {
    const { state } = await stub(page);

    let reads = 0;
    await page.route(`${API}**`, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      reads += 1;
      // The first attempt gets the page Apps Script sometimes sends instead.
      if (reads === 1) {
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html>Moved</html>' });
      }
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, txns: state.rows }),
      });
    });

    await page.goto('/admin/transactions');

    // Second time lucky, and the committee never learns there was a first.
    await expect(card(page, 'balance')).toContainText('₹9,500', { timeout: 30000 });
    await expect(page.locator('.admin-msg.is-error')).toHaveCount(0);
    expect(reads).toBeGreaterThan(1);
  });

  test('a read that never succeeds says so plainly, and does not hang', async ({ page }) => {
    await stub(page);
    await page.route(`${API}**`, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html>Nope</html>' });
    });

    await page.goto('/admin/transactions');

    // Three attempts and their backoff, then an answer — not a skeleton left
    // spinning until the browser gives up two minutes later.
    await expect(page.locator('.admin-msg.is-error')).toContainText(/Could not reach|taking too long/, { timeout: 40000 });
  });
});
