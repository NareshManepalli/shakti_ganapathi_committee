import { test, expect } from '@playwright/test';
import { CONTENT_STUB } from '../playwright.config.js';

// Keyboard and screen-reader behaviour of the admin dialogs.
//
// These were hand-rolled divs to begin with: no Escape, nothing announcing a
// dialog, and no focus handling — so Tab left the dialog and walked the page
// behind it, where every field is still reachable. Somebody could edit a member
// through a form they could not see. All six now share src/components/Modal.jsx,
// and this is what holds that in place.
const API = CONTENT_STUB;

const session = {
  token: 'stub-token',
  member: { id: 1, name: 'Venkat Naresh', isAdmin: true },
  expiresAt: 4102444800000,
};

const MEMBERS = [
  { id: '1', name_en: 'Venkat Naresh', position_en: 'President', mobile: '9000000001', email: 'a@example.com', display_order: '1', is_executive: '1', access_in: '1', adm_in: '1', bypass_in: '0', a_in: '1' },
  { id: '2', name_en: 'Ramesh Kumar', position_en: 'Treasurer', mobile: '9000000002', email: 'b@example.com', display_order: '2', is_executive: '1', access_in: '1', adm_in: '0', bypass_in: '0', a_in: '1' },
];
const SCHEDULE = [
  { id: '1', year: '2025', day_no: '1', date: '2025-08-27', time: '6:00 AM', title_en: 'Ganesh Sthapana', title_te: '', image: '', a_in: '1' },
];

const open = async (page, path) => {
  await page.addInitScript(
    ([k, v]) => sessionStorage.setItem(k, v), ['ssgc.session', JSON.stringify(session)]);
  await page.route(`${API}**`, (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, content: [], schedule: SCHEDULE, members: MEMBERS }),
  }));
  await page.goto(path);
};

/** The dialog the browser currently considers open. */
const dialog = (page) => page.locator('[role="dialog"]');

test.describe('admin dialogs', () => {
  test('the edit dialog announces itself, by its own heading', async ({ page }) => {
    await open(page, '/admin/members');
    await page.locator('tbody tr').nth(1).getByRole('button', { name: 'Edit' }).click();

    const d = dialog(page);
    await expect(d).toHaveAttribute('aria-modal', 'true');

    // the accessible name comes from the heading, so it says which member
    const id = await d.getAttribute('aria-labelledby');
    expect(id).toBeTruthy();
    await expect(page.locator(`#${id}`)).toHaveText(/Ramesh Kumar/);
  });

  test('Escape closes it', async ({ page }) => {
    await open(page, '/admin/members');
    await page.locator('tbody tr').nth(1).getByRole('button', { name: 'Edit' }).click();
    await expect(dialog(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
  });

  test('focus moves into the dialog and back to the button that opened it', async ({ page }) => {
    await open(page, '/admin/members');
    const editBtn = page.locator('tbody tr').nth(1).getByRole('button', { name: 'Edit' });
    await editBtn.click();

    // focus is inside, not left behind on the table
    const inside = await page.evaluate(() =>
      document.querySelector('[role="dialog"]').contains(document.activeElement));
    expect(inside, 'focus should start inside the dialog').toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(editBtn).toBeFocused();
  });

  test('Tab cycles within the dialog instead of escaping into the page', async ({ page }) => {
    await open(page, '/admin/members');
    await page.locator('tbody tr').nth(1).getByRole('button', { name: 'Edit' }).click();

    // far more presses than the dialog has fields — if the trap leaks, focus
    // ends up on the sidebar or the table underneath
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() =>
        document.querySelector('[role="dialog"]').contains(document.activeElement));
      expect(inside, `focus left the dialog after ${i + 1} tabs`).toBe(true);
    }

    // and backwards past the first element wraps to the last
    for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+Tab');
    const stillInside = await page.evaluate(() =>
      document.querySelector('[role="dialog"]').contains(document.activeElement));
    expect(stillInside).toBe(true);
  });

  test('the page behind cannot scroll while a dialog is open', async ({ page }) => {
    await open(page, '/admin/members');
    await page.locator('tbody tr').nth(1).getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');

    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  });

  test('a delete confirmation is a dialog too, and Escape declines it', async ({ page }) => {
    await open(page, '/admin/members');
    await page.getByRole('button', { name: 'Remove Ramesh Kumar' }).click();

    const d = dialog(page);
    await expect(d).toContainText('Remove Ramesh Kumar?');
    await expect(d).toHaveAttribute('aria-modal', 'true');

    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    // Escape must decline, never confirm — the row is still there
    await expect(page.locator('tbody tr')).toHaveCount(2);
  });

  test('the schedule drawer behaves the same way', async ({ page }) => {
    await open(page, '/admin/schedule');
    await page.getByRole('button', { name: 'Edit day 1' }).click();

    // A drawer rather than a centred dialog, but off the same shell — so it
    // still has to answer for all of this.
    const d = dialog(page);
    await expect(d).toHaveClass(/ed-drawer/);
    await expect(d).toHaveAttribute('aria-modal', 'true');
    const id = await d.getAttribute('aria-labelledby');
    // the heading names the day the way the table does, DAY-1 rather than day 1
    await expect(page.locator(`#${id}`)).toHaveText(/day-1/i);

    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
  });

  test('Escape does not close a dialog mid-save', async ({ page }) => {
    await open(page, '/admin/members');
    // hold the save open so the dialog is genuinely busy
    let release;
    await page.route(`${API}**`, async (route) => {
      if (route.request().method() !== 'POST') {
        return route.fulfill({ contentType: 'application/json',
          body: JSON.stringify({ ok: true, content: [], schedule: SCHEDULE, members: MEMBERS }) });
      }
      await new Promise((r) => { release = r; });
      return route.fulfill({ contentType: 'application/json',
        body: JSON.stringify({ ok: true, members: MEMBERS }) });
    });

    await page.locator('tbody tr').nth(1).getByRole('button', { name: 'Edit' }).click();
    await page.locator('[role="dialog"] input').first().fill('Ramesh K');
    await page.locator('[role="dialog"]').getByRole('button', { name: 'Save' }).click();

    await page.keyboard.press('Escape');
    // still open — a half-finished write must not be dismissable by a stray key
    await expect(dialog(page)).toBeVisible();

    if (release) release();
  });
});
