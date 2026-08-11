import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import { adminMobile } from './config';

// Signs in once and saves the session for every other spec to reuse.
//
// Without this each test signs in again, and the server's own limits push back:
// one code a minute, five an hour. Four tests in two minutes is enough to trip
// it, and the failure looks like a broken app rather than a throttle doing its
// job. Signing in once is also closer to how a member actually works.
const FILE = 'tests/.session.json';

/**
 * True when the session already on disk still has real time left on it.
 *
 * The Web App allows one code a minute and five an hour, and this file asks for
 * one on every run — so a second run inside a minute fails at the gate, and the
 * whole suite reports as broken when nothing is. Re-using a session that has not
 * lapsed costs nothing and is what a member does anyway; a run more than an hour
 * later signs in properly.
 *
 * Five minutes of headroom, so a long suite cannot expire mid-run.
 */
const stillValid = () => {
  try {
    const s = JSON.parse(fs.readFileSync('tests/.session-value.json', 'utf8'));
    return Boolean(s && s.token && s.expiresAt - Date.now() > 5 * 60 * 1000);
  } catch {
    return false;
  }
};

setup('sign in once', async ({ page }) => {
  if (stillValid() && fs.existsSync(FILE)) {
    setup.info().annotations.push({ type: 'note', description: 'reused the stored session' });
    return;
  }

  await page.goto('/funds');
  await page.locator('input[type=tel]').fill(adminMobile());
  const captcha = (await page.locator('.auth-captcha-d').allTextContents()).join('');
  await page.locator('.auth-input-captcha').fill(captcha);
  await page.locator('.auth-submit').click();

  await expect(page).toHaveURL(/\/funds\/verify$/, { timeout: 45000 });
  await page.locator('.auth-otp-box').first().fill('111111');
  await page.locator('.auth-otp-form .auth-submit').click();
  // /admin redirects to the first screen the member is allowed to open
  await expect(page).toHaveURL(/\/admin\//, { timeout: 45000 });

  // sessionStorage, not cookies — so capture it explicitly
  const session = await page.evaluate(() => sessionStorage.getItem('ssgc.session'));
  await page.context().storageState({ path: FILE });
  fs.writeFileSync('tests/.session-value.json', session);
});
