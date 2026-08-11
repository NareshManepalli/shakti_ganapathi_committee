import { test, expect } from '@playwright/test';
import { FUNDS_STUB } from '../playwright.config.js';

// Monthly Funds, driven against a stubbed Funds Web App.
//
// Stubbed rather than live for the same reason the content screens are: a real
// run would write invented money into the committee's own ledger. The stub is
// also the only way to check what matters most here — that a balance is
// arithmetic and not something the sheet remembers. It recomputes the running
// total the way the Apps Script does, so a spec failing here means the two
// halves have drifted apart.
const API = FUNDS_STUB;

const session = {
  token: 'stub-token',
  member: { id: 1, name: 'Venkat Naresh', isAdmin: true },
  expiresAt: 4102444800000,
};

// The committee's own history, as it stood before the portal existed.
const M = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const entry = (trnsctn_id, date, reason, credit, debit, fund_persons = '') => {
  const [d, mo, y] = date.split('-');
  return {
    sno: 0, trnsctn_id, date, year: y, month: M[Number(mo) - 1],
    credit, debit, balance: 0, reason, fund_persons,
  };
};

const SEED = [
  entry('SSGC2025000001', '05-10-2025', 'Final Amount', 9500, 0),
  entry('SSGC2025000002', '05-11-2025', 'November Amount', 3500, 0, 'Naresh, Rajesh, Gautham'),
  entry('SSGC2025000003', '05-12-2025', 'December Amount', 3000, 0, 'Naresh, Rajesh'),
  entry('SSGC2025000004', '05-01-2026', 'January Amount', 3500, 0, 'Naresh, Pawan, Rajesh, Prasad, Chintu, Gautham, Ganesh'),
  entry('SSGC2025000005', '11-01-2026', 'Bhogi Celebrations', 0, 2000),
  entry('SSGC2025000006', '05-02-2026', 'February Amount', 3500, 0, 'Naresh, Rajesh, Gautham'),
];

const key = (dmy) => {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(dmy);
  return m ? Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]) : 0;
};

/**
 * The server's half of the contract: renumber sno 1..N in date order and
 * rewrite the running balance along it. A spec failing here means the script
 * and the screen have drifted apart.
 */
const restate = (rows) => {
  let running = 0;
  return [...rows]
    .sort((a, b) => key(a.date) - key(b.date) || Number(a.sno) - Number(b.sno))
    .map((r, i) => {
      running += (Number(r.credit) || 0) - (Number(r.debit) || 0);
      return { ...r, sno: i + 1, balance: running };
    });
};

/**
 * Signs in and answers the Funds Web App from an in-memory ledger that behaves
 * like the sheet — saves land, deletes soft-delete, and every reply carries the
 * whole restated ledger back.
 */
const stub = async (page, { rows = SEED, isAdmin = true } = {}) => {
  const state = { rows: restate(rows) };
  const posts = [];

  await page.addInitScript(
    ([key, value]) => sessionStorage.setItem(key, value),
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

      if (body.action === 'saveFund') {
        const e = body.entry || {};
        const id = String(e.trnsctn_id || `SSGC2025${String(state.rows.length + 1).padStart(6, '0')}`);
        const next = {
          ...entry(id, e.date, e.reason || '', Number(e.credit) || 0, Number(e.debit) || 0, e.fund_persons || ''),
        };
        const i = state.rows.findIndex((r) => String(r.trnsctn_id) === id);
        if (i >= 0) state.rows[i] = next; else state.rows.push(next);
      }

      if (body.action === 'deleteFund') {
        state.rows = state.rows.filter((r) => String(r.trnsctn_id) !== String(body.trnsctn_id));
      }

      state.rows = restate(state.rows);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, funds: state.rows }) });
    }

    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, funds: state.rows }) });
  });

  return { posts, state };
};

/**
 * The balance cell of one row, by its reason — turning the page to reach it.
 *
 * Five rows a page, and these seeds run past that, so the entry a spec is about
 * is often not on the page the screen lands on. Paging to it keeps every spec
 * below about the arithmetic rather than about where the pager happens to sit.
 */
const balanceOf = async (page, reason) => {
  const row = page.locator('.tbl:not(.tbl-ph) tbody tr', { hasText: reason });
  if (await row.count()) return row.locator('td.is-balance');

  const next = page.getByRole('button', { name: 'Next page' });
  while (await next.isEnabled().catch(() => false)) {
    await next.click();
    if (await row.count()) return row.locator('td.is-balance');
  }
  return row.locator('td.is-balance');   // absent: let the assertion say so
};

test.describe('monthly funds', () => {
  test('the ledger reads like a bank statement — credits add, debits subtract', async ({ page }) => {
    await stub(page);
    await page.goto('/admin/monthly-funds');

    // 2026 opens first, and it opens carrying 2025's closing figure rather
    // than restarting at zero.
    await expect(await balanceOf(page, 'January Amount')).toHaveText('₹19,500');
    // a debit takes it down
    await expect(await balanceOf(page, 'Bhogi Celebrations')).toHaveText('₹17,500');
    // and the next credit picks up from there
    await expect(await balanceOf(page, 'February Amount')).toHaveText('₹21,000');
  });

  test('the year summary counts money in, money out and what is left', async ({ page }) => {
    await stub(page);
    await page.goto('/admin/monthly-funds');

    // Oct 2025 to Feb 2026 is ONE fund year — celebration to celebration — so
    // the whole seed counts, where a calendar filter would have shown only the
    // three rows dated 2026.
    await expect(page.locator('.fnd-year-select')).toHaveValue('2');
    await expect(page.locator('.fnd-card.is-credit')).toContainText('23,000');
    await expect(page.locator('.fnd-card.is-debit')).toContainText('2,000');
    await expect(page.locator('.fnd-card.is-balance')).toContainText('21,000');
  });

  test('the four cards name the year they were counted from, and follow the dropdown', async ({ page }) => {
    // A row before the 2025 celebration, so there are two fund years to move
    // between — the shared seed sits entirely inside the second, and a dropdown
    // with one option cannot show that the cards follow it.
    await stub(page, {
      rows: [entry('SSGC2025000000', '10-08-2025', 'Opening Amount', 5000, 0), ...SEED],
    });
    await page.goto('/admin/monthly-funds');

    await expect(page.locator('.fnd-card')).toHaveCount(4);

    // The first card is why the other three can be trusted: it names the span
    // they were counted over, so a figure cannot be read against the wrong year.
    const year = page.locator('.fnd-card.is-year');
    await expect(year).toContainText('Annual year');
    await expect(year).toContainText('2025 - 2026');
    await expect(page.locator('.fnd-card.is-credit')).toContainText('Total funded amount');
    await expect(page.locator('.fnd-card.is-debit')).toContainText('Total spended amount');
    await expect(page.locator('.fnd-card.is-balance')).toContainText('Current balance amount');

    // Latest year first, and the balance carries the 5,000 opening in with it.
    await expect(page.locator('.fnd-card.is-credit')).toContainText('₹23,000');
    await expect(page.locator('.fnd-card.is-debit')).toContainText('₹2,000');
    await expect(page.locator('.fnd-card.is-balance')).toContainText('₹26,000');

    // All four move together, the year card included.
    await page.locator('.fnd-year-select').selectOption('1');
    await expect(year).not.toContainText('2025 - 2026');
    await expect(page.locator('.fnd-card.is-credit')).toContainText('₹5,000');
    await expect(page.locator('.fnd-card.is-debit')).toContainText('₹0');
    await expect(page.locator('.fnd-card.is-balance')).toContainText('₹5,000');
  });

  test('a new credit raises the balance and every balance after it', async ({ page }) => {
    const { posts } = await stub(page);
    await page.goto('/admin/monthly-funds');
    await expect(await balanceOf(page, 'February Amount')).toHaveText('₹21,000');

    await page.getByRole('button', { name: /Add entry/ }).click();
    await page.getByLabel('Date').fill('2026-03-05');
    await page.getByLabel('Remarks').fill('March Amount');
    await page.locator('.fnd-in').fill('2500');
    await page.locator('form.ed-drawer').getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('.toast')).toContainText('Entry saved');
    await expect(await balanceOf(page, 'March Amount')).toHaveText('₹23,500');
    await expect(page.locator('.fnd-card.is-balance')).toContainText('23,500');
    expect(posts.at(-1)).toMatchObject({ action: 'saveFund' });
    // dd-mm-yyyy on the wire, which is the shape the sheet holds
    expect(posts.at(-1).entry).toMatchObject({ credit: 2500, debit: 0, date: '05-03-2026' });
  });

  test('a new debit lowers the balance', async ({ page }) => {
    await stub(page);
    await page.goto('/admin/monthly-funds');

    await page.getByRole('button', { name: /Add entry/ }).click();
    await page.getByLabel('Date').fill('2026-02-20');
    await page.getByLabel('Remarks').fill('Mandapam repair');
    await page.locator('.fnd-out').fill('1500');
    await page.locator('form.ed-drawer').getByRole('button', { name: 'Save' }).click();

    await expect(await balanceOf(page, 'Mandapam repair')).toHaveText('₹19,500');
    await expect(page.locator('.fnd-card.is-debit')).toContainText('3,500');
    await expect(page.locator('.fnd-card.is-balance')).toContainText('19,500');
  });

  test('an entry dated into the middle restates everything after it', async ({ page }) => {
    await stub(page);
    await page.goto('/admin/monthly-funds');

    // Between the January collection and Bhogi — the case a stored running
    // total gets wrong, and the reason this one is recomputed.
    await page.getByRole('button', { name: /Add entry/ }).click();
    await page.getByLabel('Date').fill('2026-01-08');
    await page.getByLabel('Remarks').fill('Decorations');
    await page.locator('.fnd-out').fill('500');
    await page.locator('form.ed-drawer').getByRole('button', { name: 'Save' }).click();

    await expect(await balanceOf(page, 'Decorations')).toHaveText('₹19,000');
    await expect(await balanceOf(page, 'Bhogi Celebrations')).toHaveText('₹17,000');
    await expect(await balanceOf(page, 'February Amount')).toHaveText('₹20,500');
  });

  test('editing an amount restates the rows below it', async ({ page }) => {
    await stub(page);
    await page.goto('/admin/monthly-funds');

    await page.getByRole('button', { name: 'Edit Bhogi Celebrations' }).click();
    await page.locator('.fnd-out').fill('3000');
    await page.locator('form.ed-drawer').getByRole('button', { name: 'Save' }).click();

    await expect(await balanceOf(page, 'Bhogi Celebrations')).toHaveText('₹16,500');
    await expect(await balanceOf(page, 'February Amount')).toHaveText('₹20,000');
  });

  test('money in and money out cannot both be filled on one entry', async ({ page }) => {
    await stub(page);
    await page.goto('/admin/monthly-funds');

    await page.getByRole('button', { name: /Add entry/ }).click();
    await page.locator('.fnd-in').fill('1000');
    // typing into the other box clears the first, so the pair can never both hold
    await page.locator('.fnd-out').fill('400');
    await expect(page.locator('.fnd-in')).toHaveValue('');
  });

  test('deleting an entry takes its amount back out of the running total', async ({ page }) => {
    await stub(page);
    await page.goto('/admin/monthly-funds');

    await page.getByRole('button', { name: 'Delete Bhogi Celebrations' }).click();
    await page.locator('.admin-confirm').getByRole('button', { name: 'Delete' }).click();

    await expect(page.locator('.toast')).toContainText('deleted');
    // the 2,000 spend is gone, so February climbs by it
    await expect(await balanceOf(page, 'February Amount')).toHaveText('₹23,000');
    await expect(page.locator('.fnd-card.is-debit')).toContainText('₹0');
  });

  test('a funds-only member sees the ledger but none of the controls', async ({ page }) => {
    await stub(page, { isAdmin: false });
    await page.goto('/admin/monthly-funds');

    await expect(await balanceOf(page, 'February Amount')).toHaveText('₹21,000');
    await expect(page.getByRole('button', { name: /Add entry/ })).toHaveCount(0);
    await expect(page.locator('.tbl-icon')).toHaveCount(0);
    // the statement is theirs to take, though — it is what they came for
    await expect(page.getByRole('button', { name: /Download statement/ })).toBeEnabled();
  });

  test('a sheet whose stored balance disagrees is called out, not quietly fixed', async ({ page }) => {
    // one row left carrying a stale total, as a hand-edited sheet would
    const rows = restate(SEED).map((r) => (r.trnsctn_id === 'SSGC2025000006' ? { ...r, balance: 99999 } : r));
    await page.addInitScript(
      ([key, value]) => sessionStorage.setItem(key, value),
      ['ssgc.session', JSON.stringify(session)],
    );
    await page.route(`${API}**`, (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, funds: rows }),
    }));

    await page.goto('/admin/monthly-funds');
    await expect(page.locator('.admin-msg.is-warn')).toContainText('does not match the arithmetic');
    // and the figure shown is the arithmetic, not the stored one
    await expect(await balanceOf(page, 'February Amount')).toHaveText('₹21,000');
  });
});

test.describe('who reaches what', () => {
  // The sidebar leaving a screen out is tidiness; this is the part that holds.
  const ADMIN_ONLY = ['about', 'members', 'gallery', 'schedule', 'mandapam'];

  for (const path of ADMIN_ONLY) {
    test(`a funds-only member typing /admin/${path} is sent back`, async ({ page }) => {
      await stub(page, { isAdmin: false });
      await page.goto(`/admin/${path}`);
      await expect(page).toHaveURL(/\/admin\/monthly-funds$/);
    });
  }

  test('an admin reaches those same screens', async ({ page }) => {
    await stub(page);
    await page.goto('/admin/members');
    await expect(page).toHaveURL(/\/admin\/members$/);
  });

  test('a funds-only member keeps the funds screen and their profile', async ({ page }) => {
    await stub(page, { isAdmin: false });

    await page.goto('/admin/monthly-funds');
    await expect(page).toHaveURL(/\/admin\/monthly-funds$/);
    await expect(page.locator('.tbl tbody tr').first()).toBeVisible();

    await page.goto('/admin/profile');
    await expect(page).toHaveURL(/\/admin\/profile$/);
  });
});
