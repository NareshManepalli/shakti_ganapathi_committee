import { test, expect } from '@playwright/test';
import { SHEETS_CONFIG } from '../src/config/sheetsConfig.js';

// The sign-in's own reliability.
//
// Apps Script answers a good request with an HTML page often enough that every
// other read on this site now retries. Auth was the exception, and the worst
// place for one: a member who cannot get through the gate cannot reach anything
// to work around it. Worse, the failure was reported as "Sign-in is not set up
// yet", which describes a service nobody deployed rather than one having a
// moment — and sent an admin off to check a deployment that was healthy.
//
// The rule here is the same as everywhere else, but it has to be applied one
// call at a time, because three of the four actions are not safe to repeat:
// requestOtp emails a code and spends one of five an hour, verifyOtp burns the
// code it checks, and updateProfile is a write. Only getProfile reads.
const AUTH = SHEETS_CONFIG.auth.url;

const MEMBER = {
  id: 1, name: 'Venkat Naresh', nameTe: 'వెంకట్ నరేష్',
  position: 'President', mobile: '9000000001',
  email: 'a@example.com', isAdmin: true,
};

// Relative to the run, not to a date typed here — a pinned expiry lapses the
// moment real time passes it, and then every spec fails at the gate over
// something none of them are about.
const session = {
  token: 'stub-token',
  member: { id: 1, name: 'Venkat Naresh', isAdmin: true },
  get expiresAt() { return Date.now() + 60 * 60 * 1000; },
};

const HTML = { contentType: 'text/html', body: '<!doctype html><html>Moved Temporarily</html>' };

/** Counts what each action was asked to do, and answers however the test says. */
const stubAuth = async (page, answer) => {
  const calls = [];
  await page.route(`${AUTH}**`, async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    calls.push(body.action);
    const seen = calls.filter((a) => a === body.action).length;
    return route.fulfill(answer(body.action, seen));
  });
  return calls;
};

const asMember = (page) => page.addInitScript(
  ([k, v]) => sessionStorage.setItem(k, v), ['ssgc.session', JSON.stringify(session)]);

test.describe('the sign-in service having a moment', () => {
  test('a profile read that fails once is retried, and the member never knows', async ({ page }) => {
    const calls = await stubAuth(page, (action, seen) => {
      if (action !== 'getProfile') return HTML;
      // The page Apps Script sometimes sends instead of the answer it computed.
      if (seen === 1) return HTML;
      return { contentType: 'application/json', body: JSON.stringify({ ok: true, profile: MEMBER }) };
    });

    await asMember(page);
    await page.goto('/admin/profile');

    await expect(page.locator('.prof-fact').first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.admin-card')).toContainText('Venkat Naresh');
    await expect(page.locator('.admin-msg.is-error')).toHaveCount(0);

    expect(calls.filter((a) => a === 'getProfile').length,
      'the first answer was lost, so it should have asked again').toBeGreaterThan(1);
  });

  test('a read that never answers says what is true, not "not set up yet"', async ({ page }) => {
    await stubAuth(page, () => HTML);
    await asMember(page);
    await page.goto('/admin/profile');

    const error = page.locator('.admin-msg.is-error');
    await expect(error).toBeVisible({ timeout: 40000 });
    await expect(error).toContainText('did not answer');
    // The old wording described a service nobody had deployed. This one is
    // healthy and busy, and the difference decides what the reader does next.
    await expect(error).not.toContainText('not set up yet');
  });

  test('a lost answer does not end the session of somebody who just signed in', async ({ page }) => {
    await stubAuth(page, () => HTML);
    await asMember(page);
    await page.goto('/admin/profile');
    await expect(page.locator('.admin-msg.is-error')).toBeVisible({ timeout: 40000 });

    // Only UNAUTHORIZED means the token is spent. A service that did not answer
    // says nothing about the session, and signing out over it would throw out a
    // member who is perfectly entitled to be here.
    await page.waitForTimeout(4000);
    await expect(page).toHaveURL(/\/admin\/profile$/);
    expect(await page.evaluate(() => sessionStorage.getItem('ssgc.session'))).toBeTruthy();
  });

  test('asking for a code is never repeated on its own', async ({ page }) => {
    const calls = await stubAuth(page, () => HTML);

    await page.goto('/funds');
    await page.locator('input[type=tel]').fill('9000000001');
    const captcha = (await page.locator('.auth-captcha-d').allTextContents()).join('');
    await page.locator('.auth-input-captcha').fill(captcha);
    await page.locator('.auth-submit').click();

    await expect(page.locator('.auth-error')).toContainText('did not answer', { timeout: 30000 });

    // Once. A repeat would email a second code, or spend one of the five an
    // hour the member is allowed and refuse them for asking twice.
    expect(calls.filter((a) => a === 'requestOtp')).toHaveLength(1);
  });
});
