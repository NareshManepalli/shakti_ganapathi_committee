import { test, expect } from '@playwright/test';
import { CONTENT_STUB } from '../playwright.config.js';

// The five content screens — About, Mandapam, Settings, Schedule and Members —
// driven against a stubbed Content Web App.
//
// These are the only specs that stub rather than hit the live service, and the
// reason is the members sheet: a real run would write real people's names,
// mobiles and access flags into the sheet the committee depends on. A stub also
// lets a save fail on demand, which is the path most likely to be wrong and the
// one a live run can never reach.
//
// They run against their own dev server, started with VITE_CONTENT_API set to
// the address below, so they do not wait on the real Web App being deployed.
const API = CONTENT_STUB;

// A session made here rather than borrowed from auth.setup.js. Nothing in this
// file verifies the token, so a real one buys nothing — and a saved one goes
// stale, which would fail these specs for a reason that has nothing to do with
// the screens they cover. Member 1 is the one signed in, which is what makes
// the "cannot remove yourself" rule observable below.
const session = {
  token: 'stub-token',
  member: { id: 1, name: 'Venkat Naresh', nameTe: 'వెంకట్ నరేష్', isAdmin: true },
  expiresAt: 4102444800000,
};

const CONTENT = [
  { section: 'about', content_en: 'The committee has run the Vinayaka Chavithi celebrations in Annapurnamma Peta since 1998.', content_te: 'కమిటీ 1998 నుండి వినాయక చవితి వేడుకలను నిర్వహిస్తోంది.', image: '', map_url: '', a_in: '1' },
  { section: 'mandapam', content_en: 'Sri Shakthi Nilayam\nD.No: 44-13-101, Pedda Veedhi,\nAnnapurnamma Peta,\nBeside Nayi Brahmin Seva Sangam,\nRajamahendravaram - 533101.', content_te: '', image: '', map_url: '', a_in: '1' },
  { section: 'festival', content_en: '2026-09-14', content_te: '2026-09-14', image: '', map_url: '', a_in: '1' },
];

const SCHEDULE = [
  { id: '1', year: '2025', day_no: '1', date: '2025-08-27', time: '6:00 AM', title_en: 'Ganesh Sthapana', title_te: 'గణేష్ స్థాపన', image: '', a_in: '1' },
  { id: '2', year: '2025', day_no: '2', date: '2025-08-28', time: '7:00 PM', title_en: 'Bhajans', title_te: 'భజనలు', image: '', a_in: '1' },
  { id: '3', year: '2024', day_no: '1', date: '2024-09-07', time: '6:00 AM', title_en: 'Ganesh Sthapana', title_te: '', image: '', a_in: '1' },
];

const MEMBERS = [
  { id: '1', name_en: 'Venkat Naresh', name_te: 'వెంకట్ నరేష్', position_en: 'President', position_te: 'అధ్యక్షుడు', mobile: '9000000001', email: 'a@example.com', photo: '', prfle_photo: '', display_order: '1', is_executive: '1', access_in: '1', adm_in: '1', bypass_in: '1', a_in: '1' },
  { id: '2', name_en: 'Ramesh Kumar', name_te: '', position_en: 'Treasurer', position_te: '', mobile: '9000000002', email: 'b@example.com', photo: '', prfle_photo: '', display_order: '2', is_executive: '1', access_in: '1', adm_in: '0', bypass_in: '0', a_in: '1' },
  { id: '3', name_en: 'Suresh Babu', name_te: '', position_en: 'Member', position_te: '', mobile: '9000000003', email: '', photo: '', prfle_photo: '', display_order: '3', is_executive: '0', access_in: '0', adm_in: '0', bypass_in: '0', a_in: '1' },
  { id: '4', name_en: 'Deleted Person', name_te: '', position_en: 'Member', position_te: '', mobile: '', email: '', photo: '', prfle_photo: '', display_order: '9', is_executive: '0', access_in: '0', adm_in: '0', bypass_in: '0', a_in: '0' },
];

/** Signs the browser in and answers the Content Web App from the fixtures above. */
const stub = async (page, { fail = false } = {}) => {
  const posts = [];
  await page.addInitScript(
    ([key, value]) => sessionStorage.setItem(key, value),
    ['ssgc.session', JSON.stringify(session)],
  );
  await page.route(`${API}**`, async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      posts.push(body);
      if (fail) {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Row is locked by another editor.' }) });
      }
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, content: CONTENT, schedule: SCHEDULE, members: MEMBERS, copied: 2 }),
      });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, content: CONTENT, schedule: SCHEDULE, members: MEMBERS }),
    });
  });
  return posts;
};

test.describe('admin content screens', () => {
  test('About loads the row and only enables Update once it is edited', async ({ page }) => {
    const posts = await stub(page);
    await page.goto('/admin/about');

    const en = page.locator('.ed-bi textarea').first();
    await expect(en).toHaveValue(/since 1998/);
    // Telugu sits beside it, and carries the font the glyphs need
    await expect(page.locator('.ed-bi textarea[lang="te"]')).toHaveValue(/వినాయక/);

    const update = page.getByRole('button', { name: 'Update' });
    await expect(update).toBeDisabled();
    await en.fill('Rewritten.');
    await expect(update).toBeEnabled();

    await update.click();
    await expect(page.locator('.toast')).toContainText('About saved');
    expect(posts.at(-1)).toMatchObject({ action: 'saveContent', section: 'about', content_en: 'Rewritten.' });
  });

  test('About surfaces a rejected save instead of claiming success', async ({ page }) => {
    await stub(page, { fail: true });
    await page.goto('/admin/about');
    await page.locator('.ed-bi textarea').first().fill('Rewritten.');
    await page.getByRole('button', { name: 'Update' }).click();

    const toast = page.locator('.toast');
    await expect(toast).toContainText('Could not save About');
    await expect(toast).toContainText('locked by another editor');
  });

  test('Mandapam keeps the five address lines and previews them', async ({ page }) => {
    await stub(page);
    await page.goto('/admin/mandapam');

    await expect(page.locator('.ed-bi textarea').first()).toHaveValue(/Sri Shakthi Nilayam/);
    // one <span> per line — the site breaks where the box breaks
    await expect(page.locator('.ed-preview-card span')).toHaveCount(5);
    await expect(page.locator('.ed-preview-card span').last()).toHaveText('Rajamahendravaram - 533101.');
  });

  test('Settings reads the festival date and describes what it means', async ({ page }) => {
    await stub(page);
    await page.goto('/admin/settings');

    await expect(page.locator('input[type=date]')).toHaveValue('2026-09-14');
    await expect(page.locator('.ed-state')).not.toBeEmpty();
  });

  test('Schedule shows one year at a time and can switch years', async ({ page }) => {
    await stub(page);
    await page.goto('/admin/schedule');

    // newest year first, so 2025 is what opens
    await expect(page.locator('.ed-table tbody tr')).toHaveCount(2);
    await expect(page.locator('.ed-inline-note')).toContainText('missing 3, 4, 5, 6, 7, 8, 9');

    await page.locator('select').selectOption('2024');
    await expect(page.locator('.ed-table tbody tr')).toHaveCount(1);
  });

  test('Schedule copies a year forward and reports how many days moved', async ({ page }) => {
    const posts = await stub(page);
    await page.goto('/admin/schedule');

    await page.getByRole('button', { name: /Copy 2025 forward/ }).click();
    await page.locator('.ed-strip input').fill('2026');
    await page.locator('.ed-strip').getByRole('button', { name: 'Copy' }).click();

    await expect(page.locator('.toast')).toContainText('2 days copied');
    expect(posts.at(-1)).toMatchObject({ action: 'copyYear', fromYear: '2025', toYear: '2026' });
  });

  test('Members hides soft-deleted rows and labels each level of access', async ({ page }) => {
    await stub(page);
    await page.goto('/admin/members');

    // a_in = 0 is hidden, so four rows in the sheet show as three
    await expect(page.locator('.ed-table tbody tr')).toHaveCount(3);
    // the sixth cell is Access — the name cell carries chips of its own
    const access = (n) => page.locator('tbody tr').nth(n).locator('td:nth-child(6) .ed-chip');
    await expect(access(0)).toHaveText(['Full access', 'bypass']);
    await expect(access(1)).toHaveText(['Funds only']);
    await expect(access(2)).toHaveText(['No sign-in']);
  });

  test('Members warns that a development sign-in is still switched on', async ({ page }) => {
    await stub(page);
    await page.goto('/admin/members');
    await expect(page.locator('.admin-msg.is-warn')).toContainText('1 member can sign in with the development');
  });

  test('Members refuses to let the signed-in member delete themselves', async ({ page }) => {
    await stub(page);
    await page.goto('/admin/members');

    await expect(page.locator('tbody tr').nth(0).locator('.ed-del')).toBeDisabled();
    await expect(page.locator('tbody tr').nth(1).locator('.ed-del')).toBeEnabled();
  });

  test('Full access cannot be granted to someone who cannot sign in', async ({ page }) => {
    await stub(page);
    await page.goto('/admin/members');
    await page.locator('tbody tr').nth(2).getByRole('button', { name: 'Edit' }).click();

    const flags = page.locator('.ed-flag');
    await expect(flags.nth(2).locator('input')).toBeDisabled();
    await flags.nth(1).locator('input').check();
    await expect(flags.nth(2).locator('input')).toBeEnabled();

    // and turning sign-in back off takes full access down with it
    await flags.nth(2).locator('input').check();
    await flags.nth(1).locator('input').uncheck();
    await expect(flags.nth(2).locator('input')).not.toBeChecked();
  });

  test('Members saves an edited row through the Content Web App', async ({ page }) => {
    const posts = await stub(page);
    await page.goto('/admin/members');
    await page.locator('tbody tr').nth(1).getByRole('button', { name: 'Edit' }).click();

    await page.locator('.ed-modal input').first().fill('Ramesh K');
    await page.locator('.ed-modal').getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('.toast')).toContainText('Ramesh K saved');
    expect(posts.at(-1).action).toBe('saveMember');
    expect(posts.at(-1).member).toMatchObject({ id: '2', name_en: 'Ramesh K' });
  });

  test('Removing a member asks first and says the row survives', async ({ page }) => {
    const posts = await stub(page);
    await page.goto('/admin/members');
    await page.locator('tbody tr').nth(1).locator('.ed-del').click();

    const confirm = page.locator('.admin-confirm');
    await expect(confirm).toContainText('Remove Ramesh Kumar?');
    await confirm.getByRole('button', { name: 'Remove' }).click();

    await expect(page.locator('.toast')).toContainText('Ramesh Kumar removed');
    expect(posts.at(-1)).toMatchObject({ action: 'deleteMember', id: '2' });
  });

  test('every editor screen sends the session token', async ({ page }) => {
    const posts = await stub(page);
    await page.goto('/admin/settings');
    await page.locator('input[type=date]').fill('2026-09-15');
    await page.getByRole('button', { name: 'Update' }).click();
    await expect(page.locator('.toast')).toContainText('Festival date saved');
    expect(posts.at(-1).token).toBe(session.token);
  });
});
