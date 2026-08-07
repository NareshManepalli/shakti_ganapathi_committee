import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// End-to-end through the real UI against the LIVE Auth Web App and the live
// members sheet. Nothing is mocked.
//
// The one thing a test cannot do is read the committee's inbox, so the run
// pauses at the OTP screen and waits for the code to be written to
// tests/.otp — see waitForOtp below. Everything before and after that point is
// fully automatic.
//
// Order matters: every failing case runs FIRST, because none of them send an
// email. Only the last test triggers a real send.

const REAL_MOBILE   = '7702639309';   // President Name — access_in 1, adm_in 1
const BLOCKED       = '9000000008';   // access_in 0 — must be refused, no email
const NOT_A_MEMBER  = '9999999999';
const OTP_FILE      = path.join(process.cwd(), 'tests', '.otp');

/** Reads the captcha off the page and types it back. */
async function solveCaptcha(page) {
  const digits = await page.locator('.auth-captcha-d').allTextContents();
  await page.locator('.auth-input-captcha').fill(digits.join(''));
  return digits.join('');
}

async function submitMobile(page, mobile) {
  await page.locator('input[type=tel]').fill(mobile);
  await solveCaptcha(page);
  await page.locator('.auth-submit').click();
}

/** Polls tests/.otp until a 6-digit code appears, or the code would expire. */
async function waitForOtp(page, timeoutMs = 270000) {
  const started = Date.now();
  fs.rmSync(OTP_FILE, { force: true });
  console.log('\n  >>> WAITING FOR THE OTP — write the 6 digits into tests/.otp <<<\n');
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(OTP_FILE)) {
      const code = fs.readFileSync(OTP_FILE, 'utf8').replace(/\D/g, '');
      if (code.length === 6) return code;
    }
    await page.waitForTimeout(2000);
  }
  throw new Error('No OTP was provided within ' + Math.round(timeoutMs / 1000) + 's');
}

test.describe.configure({ mode: 'serial' });

test('the funds card sits below Mandapam and opens the sign-in page', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.funds-gate-card');
  await expect(card).toBeVisible();
  await expect(card.locator('.funds-gate-name')).toHaveText(/Sri Shakthi Ganapathi Committee/);
  await expect(card.locator('img')).toBeVisible();

  // below Mandapam, above the footer, and absent from the nav
  const cardY = (await card.boundingBox()).y;
  const mandY = (await page.locator('#location').boundingBox()).y;
  expect(cardY).toBeGreaterThan(mandY);
  await expect(page.locator('.header-nav a', { hasText: /fund/i })).toHaveCount(0);

  await card.click();
  await expect(page).toHaveURL(/\/funds$/);
  await expect(page.locator('.auth-title')).toHaveText('Committee Funds');
  await expect(page.locator('.auth-helper')).toContainText('Only committee members');
  await expect(page.locator('.auth-captcha-d')).toHaveCount(4);
});

test('a wrong captcha is refused in the browser and regenerated', async ({ page }) => {
  await page.goto('/funds');
  const before = (await page.locator('.auth-captcha-d').allTextContents()).join('');
  await page.locator('input[type=tel]').fill(REAL_MOBILE);
  await page.locator('.auth-input-captcha').fill(String((Number(before) + 1) % 10000).padStart(4, '0'));
  await page.locator('.auth-submit').click();

  await expect(page.locator('.auth-error')).toContainText(/does not match/i);
  const after = (await page.locator('.auth-captcha-d').allTextContents()).join('');
  expect(after).not.toBe(before);      // cannot be brute-forced
  await expect(page).toHaveURL(/\/funds$/);
});

test('a short mobile never reaches the server', async ({ page }) => {
  await page.goto('/funds');
  await page.locator('input[type=tel]').fill('90000');
  await solveCaptcha(page);
  await page.locator('.auth-submit').click();
  await expect(page.locator('.auth-error')).toContainText(/10-digit/i);
});

test('a member with access_in = 0 is told they have no permission', async ({ page }) => {
  await page.goto('/funds');
  await submitMobile(page, BLOCKED);
  await expect(page.locator('.auth-error')).toContainText(/do not have permission/i, { timeout: 20000 });
  await expect(page).toHaveURL(/\/funds$/);   // no code page, because no code was sent
});

test('an unknown mobile is told it is not on the list', async ({ page }) => {
  await page.goto('/funds');
  await submitMobile(page, NOT_A_MEMBER);
  await expect(page.locator('.auth-error')).toContainText(/not on the committee list/i, { timeout: 20000 });
});

test('the OTP page and the admin dashboard, with a real emailed code', async ({ page }) => {
  test.setTimeout(360000);

  // Surface what the server actually said — a bare URL assertion cannot tell
  // an expired code from a wrong one from a throttled resend.
  page.on('response', async (res) => {
    if (!/script\.google(usercontent)?\.com/.test(res.url())) return;
    try {
      const t = await res.text();
      if (t.trim().startsWith('{')) console.log('    [auth] ' + t.slice(0, 160));
    } catch { /* redirects have no readable body */ }
  });

  await page.goto('/funds');
  await submitMobile(page, REAL_MOBILE);

  // ---- the code page ----
  await expect(page).toHaveURL(/\/funds\/verify$/, { timeout: 30000 });
  await expect(page.locator('.auth-greeting')).toContainText('President Name');
  await expect(page.locator('.auth-greeting')).toContainText('🤝');
  await expect(page.locator('.auth-email')).toContainText('•');          // masked only
  await expect(page.locator('.auth-email')).not.toContainText('nareshmanepalli');
  await expect(page.locator('.auth-otp-box')).toHaveCount(6);
  await expect(page.locator('.auth-timer')).toContainText(/valid for [0-4]:\d\d/);
  await expect(page.locator('.auth-resend')).toBeDisabled();
  await expect(page.locator('.auth-resend')).toContainText(/0:\d\d/);

  // ---- the real code ----
  const code = await waitForOtp(page);
  await expect(page.locator('.auth-otp-box').first())
    .toBeEnabled({ timeout: 5000 });   // fails loudly if the code already lapsed
  await page.locator('.auth-otp-box').first().fill(code);

  await expect(page).toHaveURL(/\/admin$/, { timeout: 30000 });
  await expect(page.locator('.auth-greeting')).toContainText('President Name');
  await expect(page.locator('.auth-helper')).toContainText(/full access/i);   // adm_in = 1
  await expect(page.locator('.auth-screens li')).toHaveCount(7);

  // the session survives a reload
  await page.reload();
  await expect(page).toHaveURL(/\/admin$/);

  // ---- sign out ----
  await page.locator('.auth-submit').click();
  await expect(page).toHaveURL(/localhost:5173\/$/, { timeout: 20000 });
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/funds$/);      // guarded again
});

test('no committee email address appears anywhere on the public site', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(6000);
  const html = await page.content();
  expect(html).not.toMatch(/@gmail\.com|@ssgc\.org/);
});
