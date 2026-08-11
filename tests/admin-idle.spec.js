import { test, expect } from '@playwright/test';
import { CONTENT_STUB } from '../playwright.config.js';

// The portal signs itself out after ten minutes untouched, warning at nine.
//
// Nothing else here can be checked by waiting it out — nineteen minutes of real
// time for two assertions — so these drive Playwright's fake clock instead. An
// earlier attempt installed it before the app booted and React never rendered
// at all: with `now` frozen and never advanced, its scheduler sat waiting for a
// deadline that could not arrive. The fix is ordering. Install the clock, let
// the portal load and settle under normal time, and only then hand the clock
// forward — `fastForward` jumps straight to the timer, running no intermediate
// ticks, so React is never starved.
const API = CONTENT_STUB;

// Frozen "now" for the whole file, so the session's own expiry is arithmetic
// against it rather than a date far enough away to be meaningless.
const NOW = Date.parse('2026-08-11T10:00:00Z');

// An hour, as the real thing issues — not the year-2100 stamp the other stubbed
// specs use. The gap between now and that stamp is longer than a 32-bit
// millisecond count, and the expiry timer armed with it fires at once instead of
// in 2100, so the portal signed itself out during boot and every assertion here
// failed on a session that had already gone.
const session = {
  token: 'stub-token',
  member: { id: 1, name: 'Venkat Naresh', isAdmin: true },
  expiresAt: NOW + 60 * 60 * 1000,
};

const MEMBERS = [
  { id: '1', name_en: 'Venkat Naresh', position_en: 'President', mobile: '9000000001', email: 'a@example.com', display_order: '1', is_executive: '1', access_in: '1', adm_in: '1', bypass_in: '0', a_in: '1' },
];

const openPortal = async (page) => {
  // Frozen at a fixed instant so the countdown is arithmetic rather than the
  // wall clock, and installed before the portal loads: the idle timers are
  // armed the moment the session lands, and a timer armed against the real
  // clock cannot be fast-forwarded afterwards.
  await page.clock.install({ time: new Date(NOW) });
  await page.route(`${API}**`, (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, content: [], schedule: [], members: MEMBERS }),
  }));

  // The session is written after landing on the origin rather than through
  // addInitScript, which the other stubbed specs use. Installing the clock
  // makes that init script write into a document the app never sees, so the
  // portal booted with no session at all and bounced straight to the gate —
  // which looked exactly like a broken idle timer.
  //
  // The public page, not an admin one: arriving at /admin unauthenticated runs
  // the sign-out path, which clears this key a beat after it is written. The
  // write appeared to succeed and the next navigation found nothing.
  await page.goto('/');
  await page.evaluate(
    ([k, v]) => sessionStorage.setItem(k, v), ['ssgc.session', JSON.stringify(session)]);

  await page.goto('/admin/members');
  await expect(page.locator('.admin-topbar')).toBeVisible();
};

const warning = (page) => page.getByRole('dialog', { name: 'Still there?' });

test.describe('idle sign-out', () => {
  test('nine minutes untouched brings the warning up, counting down', async ({ page }) => {
    await openPortal(page);
    await expect(warning(page)).toHaveCount(0);

    await page.clock.fastForward('08:30');
    await expect(warning(page), 'not yet — the warning is at nine').toHaveCount(0);

    await page.clock.fastForward('00:45');
    await expect(warning(page)).toBeVisible();
    // The count is what makes it a warning rather than an interruption: it says
    // how long is left, so the member can decide rather than guess.
    await expect(page.locator('.idle-count')).toContainText(/Signing out in \d+s/);
  });

  test('the tenth minute signs out and returns to the gate', async ({ page }) => {
    await openPortal(page);

    await page.clock.fastForward('10:00');
    await expect(page).toHaveURL(/\/funds$/, { timeout: 15000 });
    // The session is gone, not merely navigated away from — reopening /admin
    // must not walk back in.
    expect(await page.evaluate(() => sessionStorage.getItem('ssgc.session'))).toBeNull();
  });

  test('Stay signed in dismisses the warning and buys another ten minutes', async ({ page }) => {
    await openPortal(page);
    await page.clock.fastForward('09:15');
    await expect(warning(page)).toBeVisible();

    await page.getByRole('button', { name: 'Stay signed in' }).click();
    await expect(warning(page)).toHaveCount(0);

    // Past the original deadline, and still signed in — the clock restarted
    // rather than the warning merely being hidden.
    await page.clock.fastForward('05:00');
    await expect(page).toHaveURL(/\/admin\/members$/);
    await expect(warning(page)).toHaveCount(0);
  });

  test('a keypress before the ninth minute puts the clock back to the start', async ({ page }) => {
    await openPortal(page);
    await page.clock.fastForward('08:00');

    // A deliberate action, which is what re-arms it. mousemove deliberately
    // does not: a bumped desk is not somebody working.
    await page.keyboard.press('Tab');

    await page.clock.fastForward('08:00');   // 16 minutes total, 8 since the key
    await expect(warning(page), 'the keypress should have reset it').toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/members$/);
  });

  test('closing the tab ends the session — reopening lands on the gate', async ({ page, context }) => {
    await openPortal(page);
    await expect(page.locator('.admin-topbar')).toBeVisible();

    // sessionStorage is per-tab and dies with it, so a fresh tab starts with no
    // session at all. This is what makes "closed the browser" mean "signed out"
    // without any timer being involved.
    const fresh = await context.newPage();
    await fresh.goto('/admin/members');
    await expect(fresh).toHaveURL(/\/funds$/);
    await fresh.close();
  });
});
