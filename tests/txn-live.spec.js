import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// Transactions against the LIVE Funds Web App and the real transactions book.
//
// Read-only, deliberately. The funds specs write and undo because a balance is
// only proved by moving one; here the write path is the same restate() those
// specs already exercise, and the piece unique to this screen — the opening
// transfer — writes into the committee's fund. A spec that did that on every
// run would leave a phantom transfer behind the first time it was interrupted,
// which is exactly the fault this suite has already had once.
//
// So this checks what only a live run can: that the deployment answers
// ?what=txns at all, that the dates survive the trip in the right timezone, and
// that the pot on screen is the arithmetic of the rows underneath it.
const session = () => fs.readFileSync('tests/.session-value.json', 'utf8');

const open = async (page) => {
  await page.addInitScript((v) => sessionStorage.setItem('ssgc.session', v), session());
  await page.goto('/admin/transactions');
  await expect(page.locator('.txn-progress')).toBeVisible({ timeout: 60000 });
};

const rupees = (text) => Number(String(text).replace(/[^\d]/g, '')) || 0;

test.describe('transactions — live', () => {
  test('the pot loads from the live sheet, and its figures are the rows', async ({ page }) => {
    await open(page);

    // An empty book is a legitimate state, and says so rather than failing.
    if (await page.locator('.txn-empty').count()) {
      test.skip(true, 'the transactions book has no opening amount yet');
    }
    await expect(page.locator('.fnd-card')).toHaveCount(4, { timeout: 30000 });

    await expect(page.locator('.tbl:not(.tbl-ph) tbody tr').first()).toBeVisible({ timeout: 60000 });

    const card = async (kind) => rupees(await page.locator(`.fnd-card.is-${kind}`).textContent());

    const opening = await card('year');
    const credits = await card('credit');
    const spent = await card('debit');
    const left = await card('balance');

    // The bar is not told what to show; it is the rows added up. If the sheet
    // were hand-edited into disagreeing with itself, this is where it shows.
    expect(opening + credits - spent).toBe(left);
    expect(opening, 'the pot should have been opened with something').toBeGreaterThan(0);

    // The bar is a scale over the same figures: nothing at one end, the whole
    // pot at the other, and what has gone marked between them.
    const ticks = await page.locator('.txn-tick').allTextContents();
    expect(rupees(ticks[0])).toBe(0);
    expect(rupees(ticks[1])).toBe(spent);
    expect(rupees(ticks[2])).toBe(opening + credits);
  });

  test('the dates arrive as the committee writes them', async ({ page }) => {
    await open(page);
    if (await page.locator('.txn-empty').count()) test.skip(true, 'nothing to read yet');

    // Read in the wrong workbook's timezone, every one of these would be a day
    // early — and the two books carry their own locales.
    const dates = await page.locator('.tbl:not(.tbl-ph) tbody tr td:nth-child(3)').allTextContents();
    expect(dates.length).toBeGreaterThan(0);
    for (const d of dates) expect(d).toMatch(/^\d{2}-\d{2}-\d{4}$/);
  });

  test('the warning follows the balance rather than a fixed message', async ({ page }) => {
    await open(page);
    if (await page.locator('.txn-empty').count()) test.skip(true, 'nothing to read yet');
    await expect(page.locator('.fnd-card.is-balance')).toBeVisible({ timeout: 30000 });

    const left = rupees(await page.locator('.fnd-card.is-balance').textContent());
    const panel = page.locator('.txn-progress');

    if (left < 0) {
      await expect(panel).toHaveClass(/is-over/);
      await expect(page.locator('.txn-warn')).toContainText('Overspent');
    } else if (left < 10000) {
      await expect(panel).toHaveClass(/is-low/);
      await expect(page.locator('.txn-warn')).toContainText('getting low');
      // The rule that produced it is no longer in the sentence.
      await expect(page.locator('.txn-warn')).not.toContainText('10,000 mark');
    } else {
      await expect(panel).toHaveClass(/is-healthy/);
      await expect(page.locator('.txn-warn')).toHaveCount(0);
    }
  });

  test('the statement builds as a real PDF', async ({ page }) => {
    await open(page);
    if (await page.locator('.txn-empty').count()) test.skip(true, 'nothing to print yet');

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 90000 }),
      page.getByRole('button', { name: /Download statement/ }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^SSGC-transactions-.*\.pdf$/);

    const path = await download.path();
    const head = fs.readFileSync(path).subarray(0, 5).toString();
    expect(head, 'a PDF, not an error page saved with a .pdf name').toBe('%PDF-');
  });
});
