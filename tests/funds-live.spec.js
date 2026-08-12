import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { SHEETS_CONFIG } from '../src/config/sheetsConfig.js';

// The session lives in sessionStorage, which storageState does not carry, so it
// is put back per page the way the other live specs do it.
const session = () => fs.readFileSync('tests/.session-value.json', 'utf8');

const openFunds = async (page) => {
  await page.addInitScript((v) => sessionStorage.setItem('ssgc.session', v), session());
  await page.goto('/admin/monthly-funds');
  await expect(page).toHaveURL(/\/admin\/monthly-funds$/, { timeout: 20000 });
};

// Monthly Funds against the LIVE Funds Web App and the committee's real sheet.
//
// The only spec in the suite that writes real money, and it is deliberate: the
// stubbed run proves the screen's arithmetic, and nothing but this proves the
// deployment, the signing key, the sheet's own columns and the timezone its
// dates are read in. Everything it adds it takes away again.
//
// Kept to one entry, dated at the very end of the ledger, so a failure part way
// through leaves one identifiable row rather than a hole in the middle of the
// balances. Deletes here are soft, as everywhere else — the row stays in the
// sheet with a_in = 0 and can be read back if anything looks wrong.
const REASON = 'Playwright check — safe to delete';
const DATE_ISO = '2026-12-31';
const DATE_DMY = '31-12-2026';

const rupees = (text) => Number(String(text).replace(/[^0-9-]/g, '')) || 0;

/* ------------------------------------------------------------- the sweep */

/**
 * Removes this spec's rows from the committee's sheet, through the Web App
 * rather than through the screen.
 *
 * The restore used to be the last steps of each test, which is fine until a
 * test does not reach them. A run killed part way — a timeout, a lost answer,
 * Ctrl-C — left "Playwright check" rows in the real ledger, and enough of them
 * accumulated that the balance on the committee's own screen was wrong by
 * 1,500 rupees for a fortnight before anybody looked.
 *
 * So the cleanup does not depend on the test finishing. It runs from afterAll,
 * which Playwright runs after a failure as well, and it talks to the endpoint
 * directly: no page, no session in storage, nothing that a broken screen can
 * take down with it.
 */
const API = SHEETS_CONFIG.api.funds;
const token = () => JSON.parse(session()).token;

const readLedger = async () => {
  const res = await fetch(`${API}?token=${encodeURIComponent(token())}`, { redirect: 'follow' });
  const text = await res.text();
  if (/^\s*</.test(text)) return null;
  const data = JSON.parse(text);
  return data.ok ? (data.funds || []) : null;
};

const removeRow = async (id) => {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'deleteFund', token: token(), trnsctn_id: id }),
    redirect: 'follow',
  });
  const text = await res.text();
  return !/^\s*</.test(text) && JSON.parse(text).ok === true;
};

/** Every row this spec could have left behind, gone — however the run ended. */
const sweep = async () => {
  for (let pass = 0; pass < 12; pass += 1) {
    const rows = await readLedger();
    if (!rows) return;
    const stray = rows.find((r) => String(r.reason || '').includes(REASON));
    if (!stray) return;
    // A failure here is not worth failing the run over — it is already the
    // cleanup — but it must be said, or the next person inherits the mess
    // without knowing it is there.
    if (!await removeRow(stray.trnsctn_id)) {
      console.warn(`Could not remove ${stray.trnsctn_id} — check the funds sheet by hand.`);
      return;
    }
  }
};

const balanceTile = (page) => page.locator('.fnd-card.is-balance');
/**
 * A real data row, never the empty state.
 *
 * "No entry matches “…”" quotes the search term back, so a plain hasText match
 * finds that row too — and then waits forever for the delete button a message
 * does not have. It reads as a delete that failed when the delete is precisely
 * what emptied the table.
 *
 * `:not(.tbl-ph)` for the same class of reason. The loading placeholder is a
 * <table class="tbl tbl-ph"> with rows of its own, so a spec waiting for
 * ".tbl tbody tr" is satisfied by the skeleton and reads the screen while it is
 * still grey — which is how "the sheet should carry a balance" came to fail
 * against a sheet that plainly carries one.
 */
const rowFor = (page, reason) =>
  page.locator('.tbl:not(.tbl-ph) tbody tr:not(:has(.tbl-none))', { hasText: reason });

/**
 * Narrows the table to the test row and returns it.
 *
 * The ledger pages at eight, and an entry dated to the end of December lands on
 * the second page — correct behaviour that a spec looking only at page one
 * reads as a save that did not happen.
 */
const findRow = async (page) => {
  await page.getByRole('searchbox', { name: 'Search entries' }).fill(REASON);
  const row = rowFor(page, REASON);
  await expect(row).toBeVisible({ timeout: 20000 });
  return row;
};

/** Removes the test row if a previous run left one behind. */
const clearLeftovers = async (page) => {
  await page.getByRole('searchbox', { name: 'Search entries' }).fill(REASON);
  const stale = rowFor(page, REASON);
  while (await stale.count()) {
    await stale.first().locator('.tbl-icon.is-danger').click();
    await page.locator('.admin-confirm').getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.toast')).toContainText('deleted', { timeout: 45000 });
    await page.locator('.toast').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('monthly funds — live', () => {
  let opening = 0;

  // Before, in case the last run died; after, whatever this one does.
  test.beforeAll(sweep);
  test.afterAll(sweep);

  test('the ledger loads from the live sheet', async ({ page }) => {
    await openFunds(page);

    // A real row, not a painted heading: the screen is only proven once the
    // Web App has answered and the balances have been computed from it.
    await expect(page.locator('.tbl:not(.tbl-ph) tbody tr').first()).toBeVisible({ timeout: 60000 });
    await clearLeftovers(page);

    opening = rupees(await balanceTile(page).textContent());
    expect(opening, 'the sheet should carry a balance').toBeGreaterThan(0);

    // The dates survived the trip in the committee's own timezone. Read in the
    // script project's instead, every one of these would be a day early.
    const dates = await page.locator('.tbl:not(.tbl-ph) tbody tr td:nth-child(3)').allTextContents();
    for (const d of dates) expect(d).toMatch(/^\d{2}-\d{2}-\d{4}$/);
  });

  test('adding a credit raises the balance in the sheet', async ({ page }) => {
    await openFunds(page);
    await expect(page.locator('.tbl:not(.tbl-ph) tbody tr').first()).toBeVisible({ timeout: 60000 });

    await page.getByRole('button', { name: /Add entry/ }).click();
    await page.getByLabel('Date').fill(DATE_ISO);
    await page.getByLabel('Remarks').fill(REASON);
    await page.locator('.fnd-in').fill('100');
    await page.locator('.fnd-out').fill('');
    await page.getByLabel('Fund persons').fill('Playwright');
    await page.locator('.ed-drawer').getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('.toast')).toContainText('Entry saved', { timeout: 60000 });

    const row = await findRow(page);
    await expect(row.locator('td').nth(2)).toHaveText(DATE_DMY);
    await expect(row.locator('td').nth(3)).toHaveText('December');
    await expect(row.locator('td.is-credit')).toHaveText('₹100');
    // last in the ledger, so its running total is the closing balance
    expect(rupees(await row.locator('td.is-balance').textContent())).toBe(opening + 100);
    expect(rupees(await balanceTile(page).textContent())).toBe(opening + 100);

    // and the sheet gave it a generated id, not one this test invented
    await page.getByRole('button', { name: `Edit ${REASON}` }).click();
    await expect(page.locator('.ed-drawer-head h2')).toHaveText(/SSGC\d{4}\d{6}$/);
    await page.locator('.ed-drawer-x').click();
  });

  test('editing the amount restates the balance', async ({ page }) => {
    await openFunds(page);
    await findRow(page);

    await page.getByRole('button', { name: `Edit ${REASON}` }).click();
    await page.locator('.fnd-in').fill('250');
    await page.locator('.ed-drawer').getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.toast')).toContainText('Entry saved', { timeout: 60000 });

    await expect(rowFor(page, REASON).locator('td.is-credit')).toHaveText('₹250');
    expect(rupees(await balanceTile(page).textContent())).toBe(opening + 250);
  });

  test('turning it into a debit lowers the balance instead', async ({ page }) => {
    await openFunds(page);
    await findRow(page);

    await page.getByRole('button', { name: `Edit ${REASON}` }).click();
    // typing into the out box clears the in box, so this becomes money out
    await page.locator('.fnd-out').fill('250');
    await expect(page.locator('.fnd-in')).toHaveValue('');
    await page.locator('.ed-drawer').getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.toast')).toContainText('Entry saved', { timeout: 60000 });

    await expect(rowFor(page, REASON).locator('td.is-debit')).toHaveText('₹250');
    expect(rupees(await balanceTile(page).textContent())).toBe(opening - 250);
  });

  test('the statement builds as a real PDF', async ({ page }) => {
    // The bytes are taken from the blob jsPDF builds, not from a download
    // event: it hands the file over through an object URL, and whether that
    // surfaces as a download depends on the browser's own settings. The blob is
    // the file either way, and it is the file that has to be right.
    await page.addInitScript(() => {
      window.__pdfBlobs = [];
      const original = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => { window.__pdfBlobs.push(blob); return original(blob); };
    });
    await openFunds(page);
    await expect(page.locator('.tbl:not(.tbl-ph) tbody tr').first()).toBeVisible({ timeout: 60000 });

    // The range is chosen in a drawer now, so the statement is a document about
    // a period rather than whatever year the table happened to be showing.
    // The statement is the table: the fund year on screen, narrowed by search.
    await page.getByRole('button', { name: /Download statement/ }).click();
    await expect(page.locator('.toast')).toContainText('Statement downloaded', { timeout: 60000 });

    const base64 = await page.evaluate(async () => {
      const blob = window.__pdfBlobs.at(-1);
      if (!blob) return null;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    });

    expect(base64, 'the statement produced no file').toBeTruthy();
    const pdf = Buffer.from(base64, 'base64').toString('latin1');

    expect(pdf.slice(0, 5)).toBe('%PDF-');
    expect(pdf).toContain('SRI SHAKTHI GANAPATHI COMMITTEE');
    expect(pdf).toContain('Annapurnamma Peta');
    expect(pdf).toContain('FUNDS STATEMENT');
    expect(pdf).toContain('TOTAL FUND AMOUNT');
    expect(pdf).toContain('CURRENT BALANCE');
    // the emblem twice — once in the band, once as the centre watermark
    expect((pdf.match(/\/Subtype\s*\/Image/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  test('deleting it puts the sheet back exactly as it was', async ({ page }) => {
    await openFunds(page);
    await findRow(page);

    await page.getByRole('button', { name: `Delete ${REASON}` }).click();
    await expect(page.locator('.admin-confirm')).toContainText(REASON);
    await page.locator('.admin-confirm').getByRole('button', { name: 'Delete' }).click();

    await expect(page.locator('.toast')).toContainText('deleted', { timeout: 60000 });
    await expect(rowFor(page, REASON)).toHaveCount(0);
    expect(rupees(await balanceTile(page).textContent())).toBe(opening);
  });
});
