import { test, expect } from '@playwright/test';

// A single-page app has one real file. Without a host rewrite, asking the
// server for /funds returns 404 — which is what a member gets when they
// bookmark the sign-in page or press refresh on it.
//
// These deliberately use an ABSOLUTE url, not the config's baseURL: baseURL
// points at the Vite dev server, which already rewrites for you, so testing
// through it would prove nothing. This hits the BUILT output served the way
// public/_redirects, vercel.json, firebase.json and public/.htaccess tell a
// host to serve it:
//
//     npx serve -s dist -l 4322
const HOST = 'http://localhost:4322';

test('the sign-in page survives a direct visit', async ({ page }) => {
  const res = await page.goto(`${HOST}/funds`);
  expect(res.status()).toBe(200);
  await expect(page.locator('.auth-title')).toHaveText('Committee Funds');
});

test('the sign-in page survives a refresh', async ({ page }) => {
  await page.goto(`${HOST}/`);
  await page.locator('.funds-gate-card').click();
  await expect(page).toHaveURL(/\/funds$/);
  await page.reload();                       // the journey that 404s unrewritten
  await expect(page.locator('.auth-title')).toHaveText('Committee Funds');
});

test('guarded and unknown routes resolve rather than 404', async ({ page }) => {
  const admin = await page.goto(`${HOST}/admin`);
  expect(admin.status()).toBe(200);
  await expect(page).toHaveURL(/\/funds$/);        // guard sent them to sign in

  const otp = await page.goto(`${HOST}/funds/verify`);
  expect(otp.status()).toBe(200);
  await expect(page).toHaveURL(/\/funds$/);        // no pending code -> start again

  const junk = await page.goto(`${HOST}/no/such/page`);
  expect(junk.status()).toBe(200);
  await expect(page).toHaveURL(`${HOST}/`);        // falls back to the public site
});
