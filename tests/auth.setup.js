import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import { adminMobile } from './config';
import { SHEETS_CONFIG } from '../src/config/sheetsConfig.js';

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

/**
 * A session without asking for a code, for a member with bypass_in = 1.
 *
 * The gate's throttle is on SENDING a code — one a minute, five an hour — and
 * that is the half a bypass member does not need: verifyOtp checks the fixed
 * code before it ever looks in the cache, precisely because no code was
 * generated for them. Going straight there is the same door, minus the knock.
 *
 * This matters because the throttle has interrupted this suite repeatedly, and
 * always misleadingly — the gate reports it as "Sign-in is not set up yet",
 * which sends whoever is reading off to check a configuration that is fine.
 *
 * Returns the session, or null to fall back to the real sign-in — which is
 * still what runs for a member without the flag, and is worth keeping because
 * it is the only thing that exercises the captcha and the OTP screen.
 */
const bypassSession = async () => {
  try {
    const res = await fetch(SHEETS_CONFIG.auth.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'verifyOtp', mobile: adminMobile(), otp: '111111' }),
      redirect: 'follow',
    });
    const text = await res.text();
    if (/^\s*</.test(text)) return null;
    const data = JSON.parse(text);
    if (!data.ok || !data.token) return null;
    return {
      token: data.token,
      member: data.member,
      bypass: true,
      expiresAt: Date.now() + (Number(data.expiresInMin) || 60) * 60 * 1000,
    };
  } catch {
    return null;
  }
};

setup('sign in once', async ({ page }) => {
  if (stillValid() && fs.existsSync(FILE)) {
    setup.info().annotations.push({ type: 'note', description: 'reused the stored session' });
    return;
  }

  const quick = await bypassSession();
  if (quick) {
    setup.info().annotations.push({ type: 'note', description: 'signed in through the bypass code' });
    fs.writeFileSync('tests/.session-value.json', JSON.stringify(quick));
    // storageState still has to exist for the projects that name it, even
    // though the session itself lives in sessionStorage and is put back per
    // page by each spec.
    await page.goto('/funds');
    await page.context().storageState({ path: FILE });
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
