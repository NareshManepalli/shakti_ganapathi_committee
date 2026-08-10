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

setup('sign in once', async ({ page }) => {
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
