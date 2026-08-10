import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// The profile screen against the LIVE auth endpoint and the real members sheet.
//
// The save tests WRITE to that sheet, so each changes a field, checks it stuck,
// and puts the original back — including when an assertion fails partway, which
// is what the finally block is for. They never touch the mobile: that is what
// the member signs in with, and a half-finished test must not be able to lock
// anyone out of the portal.
//
// Because the row is real and shared, editing the same member in a browser while
// this runs makes the read-back assertions fail on a value that is neither the
// marker nor the original. That is two writers on one row, not a broken app —
// re-run with nobody else on the profile screen before going looking for a bug.
const session = () => fs.readFileSync('tests/.session-value.json', 'utf8');

// .admin-input order on the screen: Name, Name (Telugu), Mobile, Email.
// Indices rather than labels because the labels carry a '*' node.
const NAME = 0, NAME_TE = 1, MOBILE = 2, EMAIL = 3;

async function open(page, path = '/admin/profile') {
  await page.addInitScript((v) => sessionStorage.setItem('ssgc.session', v), session());
  await page.goto(path);
  await expect(page.locator('.prof-fact').first()).toBeVisible({ timeout: 45000 });
}

const factRows = (page) => page.locator('.prof-fact').evaluateAll((els) =>
  Object.fromEntries(els.map((e) => [
    e.querySelector('dt').textContent.trim(),
    e.querySelector('dd').textContent.trim(),
  ])));

/**
 * Waits for the read-only block to show `value`, rather than reading it once.
 *
 * The toast fires when the Web App answers; the block above the form repaints
 * from the refetched profile a moment later. Reading straight after the toast
 * catches the old name often enough to make the suite flaky.
 */
const expectName = (page, value) =>
  expect.poll(async () => (await factRows(page)).Name, { timeout: 20000 }).toBe(value);

test.describe.configure({ mode: 'serial' });

test('the profile loads the real record, email included', async ({ page }) => {
  await open(page);
  await expect(page.locator('.admin-page-title')).toHaveText('My Profile');

  const rows = await factRows(page);
  expect(rows.Name).toBeTruthy();
  expect(rows.Mobile).toMatch(/^\d{10}$/);
  // The email is only here because the AUTH endpoint returns it — the public
  // members API withholds it, since it is where the sign-in code is sent.
  expect(rows.Email).toMatch(/@/);
  expect(rows.Position).toBeTruthy();

  await expect(page.locator('.admin-msg.is-error')).toHaveCount(0);
});

test('fields are read-only until Edit Profile is pressed', async ({ page }) => {
  await open(page);
  const inputs = page.locator('.admin-input');

  await expect(inputs.nth(NAME)).toBeDisabled();
  await expect(inputs.nth(MOBILE)).toBeDisabled();
  await expect(inputs.nth(EMAIL)).toBeDisabled();
  await expect(page.locator('.admin-btn', { hasText: 'Update' })).toBeDisabled();

  await page.locator('.admin-btn', { hasText: 'Edit Profile' }).click();

  await expect(inputs.nth(NAME)).toBeEnabled();
  await expect(inputs.nth(NAME_TE)).toBeEnabled();
  await expect(inputs.nth(MOBILE)).toBeEnabled();
  await expect(inputs.nth(EMAIL)).toBeEnabled();
  await expect(page.locator('.admin-btn', { hasText: 'Update' })).toBeEnabled();

  // Position is not a form field at all. The committee sets it, and a member who
  // could edit their own access could hand themselves the portal — a permanently
  // greyed box only invited the question of how to change it. It stays in the
  // read-only record above.
  await expect(inputs).toHaveCount(4);
  await expect(page.locator('.prof-grid .admin-label', { hasText: 'Position' })).toHaveCount(0);
  expect((await factRows(page)).Position).toBeTruthy();
});

test('a malformed email never leaves the browser', async ({ page }) => {
  await open(page);
  await page.locator('.admin-btn', { hasText: 'Edit Profile' }).click();

  const email = page.locator('.admin-input').nth(EMAIL);
  await email.fill('not-an-email');
  await page.locator('.admin-btn', { hasText: 'Update' }).click();

  // type="email" stops the submit outright, so nothing is sent and no toast
  // appears. The server checks it too — that half is covered by the Apps Script
  // simulation, which asserts BAD_EMAIL, BAD_NAME and MOBILE_TAKEN.
  expect(await email.evaluate((el) => el.checkValidity())).toBe(false);
  await expect(page.locator('.toast')).toHaveCount(0);
  await expect(page.locator('.admin-btn', { hasText: 'Update' })).toBeEnabled();  // still in edit mode
});

test('saving a new name reaches the sheet and survives a reload', async ({ page }) => {
  await open(page);
  const before = await factRows(page);
  const original = before.Name;
  const changed = `${original} QA`;

  try {
    await page.locator('.admin-btn', { hasText: 'Edit Profile' }).click();
    await page.locator('.admin-input').nth(NAME).fill(changed);
    await page.locator('.admin-btn', { hasText: 'Update' }).click();

    await expect(page.locator('.toast-success')).toContainText(/Profile saved/, { timeout: 45000 });
    await expectName(page, changed);

    // it really reached the sheet, not just the screen
    await page.reload();
    await expect(page.locator('.prof-fact').first()).toBeVisible({ timeout: 45000 });
    await expectName(page, changed);
  } finally {
    await page.locator('.admin-btn', { hasText: 'Edit Profile' }).click();
    await page.locator('.admin-input').nth(NAME).fill(original);
    await page.locator('.admin-btn', { hasText: 'Update' }).click();
    await expect(page.locator('.toast-success')).toContainText(/Profile saved/, { timeout: 45000 });
    await expectName(page, original);
  }
});

// The Telugu name is not in the read-only block above, so this reads it back
// out of the input. Same write-check-restore shape as the name test, and the
// same reason for the finally: a half-finished run must not leave the public
// site showing a test string as somebody's name in Telugu.
test('a Telugu name reaches the name_te column and survives a reload', async ({ page }) => {
  await open(page);
  const box = () => page.locator('.admin-input').nth(NAME_TE);
  const original = await box().inputValue();
  const changed = 'పరీక్ష పేరు';

  try {
    await page.locator('.admin-btn', { hasText: 'Edit Profile' }).click();
    await box().fill(changed);
    await page.locator('.admin-btn', { hasText: 'Update' }).click();
    await expect(page.locator('.toast-success')).toContainText(/Profile saved/, { timeout: 45000 });

    // Reloaded, so this is the sheet answering rather than the form still
    // holding what was typed into it.
    await page.reload();
    // The read-only block above appears as soon as the profile lands, but the
    // form below is seeded from it a tick later — so this needs the same
    // patience as everything else here, not the 5s default.
    await expect(page.locator('.prof-fact').first()).toBeVisible({ timeout: 45000 });
    await expect(box()).toHaveValue(changed, { timeout: 45000 });
  } finally {
    await page.locator('.admin-btn', { hasText: 'Edit Profile' }).click();
    await box().fill(original);
    await page.locator('.admin-btn', { hasText: 'Update' }).click();
    await expect(page.locator('.toast-success')).toContainText(/Profile saved/, { timeout: 45000 });
    await page.reload();
    await expect(page.locator('.prof-fact').first()).toBeVisible({ timeout: 45000 });
    await expect(box()).toHaveValue(original, { timeout: 45000 });
  }
});

test('the profile is reachable from the topbar menu', async ({ page }) => {
  await page.addInitScript((v) => sessionStorage.setItem('ssgc.session', v), session());
  await page.goto('/admin/gallery');

  await page.locator('.admin-profile-btn').click();
  await page.locator('.admin-profile-menu button', { hasText: /Profile/ }).click();

  await expect(page).toHaveURL(/\/admin\/profile$/);
  await expect(page.locator('.admin-page-title')).toHaveText('My Profile');
});
