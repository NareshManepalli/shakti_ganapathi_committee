import { test, expect } from '@playwright/test';

// The gallery manager end to end, against the LIVE Gallery Web App and the
// real Drive folder. Nothing is mocked on the server side.
//
// Sign-in uses the members sheet's bypass_in flag: the member below must have
// bypass_in = 1, which lets the fixed code stand in for an emailed one. If it
// is 0, these tests will stop at the code screen — that is the flag doing its
// job, not a broken test.
const ADMIN_MOBILE = adminMobile();  // President — access_in 1, adm_in 1
const YEAR         = '2026';         // the empty year, so a test upload is obvious

import fs from 'node:fs';
import { adminMobile } from './config';

// Signed in once by auth.setup.js and replayed here. Signing in per test trips
// the server's own limit of one code a minute, which then looks like a broken
// app rather than a throttle working correctly.
const session = () => fs.readFileSync('tests/.session-value.json', 'utf8');

async function signIn(page, mobile = ADMIN_MOBILE) {
  if (mobile === ADMIN_MOBILE) {
    // seed the session before any app code runs
    await page.addInitScript((v) => sessionStorage.setItem('ssgc.session', v), session());
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\//, { timeout: 20000 });
    return;
  }
  await page.goto('/funds');
  await page.locator('input[type=tel]').fill(mobile);
  const captcha = (await page.locator('.auth-captcha-d').allTextContents()).join('');
  await page.locator('.auth-input-captcha').fill(captcha);
  await page.locator('.auth-submit').click();

  await expect(page).toHaveURL(/\/funds\/verify$/, { timeout: 45000 });
  await page.locator('.auth-otp-box').first().fill('111111');
  await page.locator('.auth-otp-form .auth-submit').click();
  await expect(page).toHaveURL(/\/admin\//, { timeout: 45000 });
}

test.describe.configure({ mode: 'serial' });

test('the portal chrome matches the intended dimensions', async ({ page }) => {
  await signIn(page);

  const sidebar = await page.locator('.admin-sidebar').boundingBox();
  const topbar = await page.locator('.admin-topbar').boundingBox();
  expect(Math.round(sidebar.width)).toBe(250);
  expect(Math.round(topbar.height)).toBe(74);

  // dark chrome over a light workspace
  const rootBg = await page.locator('.admin-root').evaluate((el) => getComputedStyle(el).backgroundColor);
  const [r, g, b] = rootBg.match(/\d+/g).map(Number);
  expect((0.299 * r + 0.587 * g + 0.114 * b) / 255).toBeGreaterThan(0.85);

  // Behaviour, not a snapshot of the list: the menu is still being built out,
  // and pinning its exact contents means this fails on every addition without
  // anything actually being wrong.
  // Behaviour, not a snapshot of the list: the menu is still being built out,
  // so pinning its exact contents fails on every addition without anything
  // actually being wrong. My Profile now lives in the topbar menu, not here.
  const labels = await page.locator('.admin-nav-link').allTextContents();
  expect(labels, 'an admin sees the editing screens').toEqual(
    expect.arrayContaining(['Gallery', 'Members', 'About'])
  );
  expect(labels.length, 'more than a funds-only member sees').toBeGreaterThan(2);

  // the profile and sign-out live in the topbar card
  await page.locator('.admin-profile-btn').click();
  const menu = await page.locator('.admin-profile-menu button').allTextContents();
  expect(menu.join(' ')).toMatch(/Profile/);
  expect(menu.join(' ')).toMatch(/Log ?out/i);
});

test('the gallery lists year folders from Drive', async ({ page }) => {
  await signIn(page);
  await page.locator('.admin-nav-link', { hasText: 'Gallery' }).click();

  await expect(page.locator('.admin-page-title')).toHaveText('Gallery Management');
  await expect(page.locator('.gal-panel')).toBeVisible();
  await expect(page.locator('.gal-crumb.is-current')).toHaveText('Gallery');
  await expect(page.locator('.admin-btn', { hasText: 'Refresh' })).toHaveCount(0);
  // No count at the root — it only restated the grid. The limits line stays.
  await expect(page.locator('.gal-count')).toHaveCount(0);
  await expect(page.locator('.gal-limits')).toContainText(/One folder per year/);

  const folders = page.locator('.gal-folder');
  await expect(folders.first()).toBeVisible({ timeout: 40000 });
  expect(await folders.count()).toBeGreaterThanOrEqual(2);

  // centred card: icon above the name above the count
  await expect(page.locator('.gal-folder-icon').first()).toBeVisible();
  await expect(page.locator('.gal-folder-name').first()).toBeVisible();
  await expect(page.locator('.gal-folder-meta').first()).toContainText(/photo/);
});

test('a folder opens, showing its photos and a breadcrumb', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/gallery');
  await page.locator('.gal-folder', { hasText: '2025' }).click();

  await expect(page.locator('.gal-crumb.is-current')).toHaveText('2025');
  // count and limits sit below the divider now, not inside the crumb line
  await expect(page.locator('.gal-count')).toContainText(/of 30 photos · \d+ left/);
  await expect(page.locator('.gal-limits')).toContainText(/Up to 30 photos per year/);
  await expect(page.locator('.admin-btn', { hasText: 'Back' })).toHaveCount(0);
  await expect(page.locator('.gal-file').first()).toBeVisible({ timeout: 40000 });

  // every thumbnail actually loaded from Drive
  const broken = await page.locator('.gal-thumb img').evaluateAll(
    (imgs) => imgs.filter((i) => i.complete && i.naturalWidth === 0).length
  );
  expect(broken).toBe(0);

  // the breadcrumb is the way back
  await page.locator('.gal-crumb', { hasText: 'Gallery' }).click();
  await expect(page.locator('.gal-crumb.is-current')).toHaveText('Gallery');
});

test('upload a photo, see it, then delete it again', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/gallery');
  await page.locator('.gal-folder', { hasText: YEAR }).click();
  await expect(page.locator('.gal-crumb.is-current')).toHaveText(YEAR);

  const countBefore = await page.locator('.gal-file').count();

  // 54 KB, chosen by measurement. A 64px square gets no thumbnail from Drive
  // at all — it answers 404 — while the 3.1 MB logo is a ~4.2 MB base64 POST
  // that Apps Script takes a variable and sometimes very long time to accept.
  // This one uploads in about 4s and has a thumbnail 1s later.
  await page.setInputFiles('input[type=file]', 'public/apple-touch-icon.png');

  // uploads run one file at a time through Apps Script, so allow for the round trip
  await expect(page.locator('.toast-success')).toContainText(/1 photo uploaded/, { timeout: 90000 });
  await expect(page.locator('.gal-file')).toHaveCount(countBefore + 1);
  await expect(page.locator('.gal-count')).toContainText(`${countBefore + 1} of 30 photos`);

  // The new photo renders from Drive. Polled rather than snap-checked: Drive
  // needs a second or two to produce the thumbnail for a freshly uploaded file,
  // and the browser then has to fetch it.
  await expect.poll(
    async () => page.locator('.gal-thumb img').last().evaluate((i) => i.complete && i.naturalWidth > 0),
    { timeout: 45000, message: 'the uploaded photo never rendered' },
  ).toBe(true);

  // ---- delete it again, leaving Drive as we found it ----
  await page.locator('.gal-file').last().hover();
  await page.locator('.gal-file').last().locator('.gal-del').click();
  await expect(page.locator('.gal-confirm')).toBeVisible();
  await page.locator('.admin-btn-danger').click();

  // Filtered by text, not positional: the "uploaded" toast from earlier in this
  // test is often still on screen, so a bare .toast-success resolves to that one
  // and the assertion fails on a stale message rather than a real problem.
  const deleted = page.locator('.toast-success', { hasText: /deleted/ });
  await expect(deleted).toBeVisible({ timeout: 90000 });
  await expect(deleted).toContainText(/Drive bin/);
  await expect(page.locator('.gal-file')).toHaveCount(countBefore);

  // the toast can be dismissed rather than only timing out
  await page.locator('.toast-close').first().click();
  await expect(page.locator('.toast')).toHaveCount(0);
});

test('a funds-only member is not offered the gallery', async ({ page }) => {
  // The session is seeded rather than signed in for real: only one row has
  // bypass_in = 1, so any other member needs a code from an actual inbox, which
  // a test cannot read.
  //
  // Seeding is honest here because what is under test is the MENU, which is a
  // client-side courtesy. The enforcement that matters lives in the signed
  // token and is covered server-side — a token with adm = 0 is refused by the
  // gallery script, and one that has been edited fails its signature.
  await page.addInitScript(() => {
    sessionStorage.setItem('ssgc.session', JSON.stringify({
      token: 'ui-only', member: { id: 3, name: 'Member 1', isAdmin: false },
      expiresAt: Date.now() + 3600000,
    }));
  });
  await page.goto('/admin');

  // Monthly Funds and Transactions — nothing that edits the site
  await expect(page.locator('.admin-nav-link')).toHaveCount(2);
  await expect(page.locator('.admin-nav-link', { hasText: 'Gallery' })).toHaveCount(0);

  // Typing the URL still renders the screen. That is deliberate: hiding a route
  // is not security, and the server refuses the write regardless.
  await page.goto('/admin/gallery');
  await expect(page.locator('.admin-page-title')).toHaveText('Gallery Management');
});
