import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { SHEETS_CONFIG } from '../src/config/sheetsConfig.js';

// Every screen the portal offers, walked the way a member reaches them: click
// the sidebar, land on the screen, see something real.
//
// This runs LIVE — no stubs — so it is the pass that catches a route wired to
// nothing, a screen that throws on mount, a menu entry with no page behind it,
// or a screen that draws its heading and then sits in skeletons because the
// sheet never answered. It checks that real rows arrive; what it does not do is
// write anything. Editing is covered against a stubbed Content Web App in
// admin-editors.spec.js, for the reasons written at the top of that file.
const session = () => fs.readFileSync('tests/.session-value.json', 'utf8');

// While api.content is null every editor screen renders the not-connected card
// instead of a form. Both states are legitimate, so each screen states which it
// expects rather than the suite assuming one.
const CONNECTED = Boolean(SHEETS_CONFIG.api && SHEETS_CONFIG.api.content);

// `loaded` is what proves the sheet answered, not merely that the shell drew.
// Without it a screen stuck in skeletons forever still passes — the heading is
// painted before the fetch is even sent.
const SCREENS = [
  { label: 'Annual Funds',  path: 'monthly-funds', title: 'Annual Funds',         kind: 'live' },
  { label: 'Transactions',  path: 'transactions',  title: 'Transactions',         kind: 'wip' },
  { label: 'About',         path: 'about',         title: 'About Management',     kind: 'editor', loaded: '.ed-bi textarea' },
  { label: 'Members',       path: 'members',       title: 'Members Management',   kind: 'editor', loaded: '.tbl tbody tr' },
  { label: 'Gallery',       path: 'gallery',       title: 'Gallery',              kind: 'live' },
  { label: 'Schedule',      path: 'schedule',      title: 'Schedule Management',  kind: 'editor', loaded: '.tbl tbody tr, .admin-empty-title' },
  { label: 'Mandapam',      path: 'mandapam',      title: 'Mandapam Management',  kind: 'editor', loaded: '.ed-bi textarea' },
];

const openPortal = async (page) => {
  await page.addInitScript((v) => sessionStorage.setItem('ssgc.session', v), session());
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\//, { timeout: 20000 });
};

test.describe.configure({ mode: 'serial' });

test('the sidebar offers every screen, once each', async ({ page }) => {
  await openPortal(page);
  await expect(page.locator('.admin-nav-link')).toHaveCount(SCREENS.length);
  for (const s of SCREENS) {
    await expect(page.locator('.admin-nav-link', { hasText: new RegExp(`^${s.label}$`) })).toHaveCount(1);
  }
});

for (const s of SCREENS) {
  test(`${s.label} opens from the sidebar and renders`, async ({ page }) => {
    const broke = [];
    page.on('pageerror', (e) => broke.push(String(e)));
    page.on('console', (m) => {
      // "Failed to load resource" carries no URL, so it cannot be judged here.
      // Failed requests are caught below, where the URL is available.
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) broke.push(m.text());
    });
    page.on('response', (r) => {
      if (r.status() >= 400) broke.push(`${r.status()} ${r.url()}`);
    });

    await openPortal(page);
    await page.locator('.admin-nav-link', { hasText: new RegExp(`^${s.label}$`) }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/${s.path}$`));

    await expect(page.locator('.admin-page-title')).toContainText(s.title);

    if (s.kind === 'editor' && !CONNECTED) {
      // the honest state while api.content is null
      await expect(page.locator('.admin-wip-title')).toHaveText('Not connected');
    } else if (s.loaded) {
      // Apps Script takes 3-4 seconds cold, so this waits properly rather than
      // asserting on whatever happened to be painted first.
      await expect(page.locator(s.loaded).first()).toBeVisible({ timeout: 60000 });
      await expect(page.locator('.admin-skel')).toHaveCount(0);
      // is-error is a failed load; the bypass notice is is-warn and is expected
      await expect(page.locator('.admin-msg.is-error')).toHaveCount(0);
    }

    // the sidebar marks where you are, so the portal never looks lost
    await expect(page.locator('.admin-nav-link.is-active')).toHaveText(new RegExp(s.label));

    // Drive 404s a thumbnail it has not generated yet, and a photo removed from
    // the folder mid-run 404s too. Neither is this screen being broken.
    const real = broke.filter((m) => !/favicon|404 https:\/\/(lh\d|drive)\./.test(m));
    expect(real, `console errors on ${s.label}: ${real.join(' | ')}`).toEqual([]);
  });
}

test('a deep link to a screen survives a reload', async ({ page }) => {
  await page.addInitScript((v) => sessionStorage.setItem('ssgc.session', v), session());
  await page.goto('/admin/schedule');
  await expect(page.locator('.admin-page-title')).toHaveText('Schedule Management');

  await page.reload();
  await expect(page.locator('.admin-page-title')).toHaveText('Schedule Management');
  await expect(page).toHaveURL(/\/admin\/schedule$/);
});

test('every screen is behind the guard', async ({ page }) => {
  // no session seeded at all
  for (const s of SCREENS) {
    await page.goto(`/admin/${s.path}`);
    await expect(page, `${s.label} should bounce when signed out`).toHaveURL(/\/funds$/, { timeout: 15000 });
  }
});

test('a funds-only member is offered neither editor screen nor its route', async ({ page }) => {
  // Seeded rather than signed in: only one row carries bypass_in, so any other
  // member needs a code from a real inbox. The menu is a client-side courtesy —
  // the enforcement that matters is the signed token, which the Content Web App
  // refuses unless adm = 1, and that half is covered by its own simulation.
  await page.addInitScript(() => {
    sessionStorage.setItem('ssgc.session', JSON.stringify({
      token: 'ui-only', member: { id: 3, name: 'Member 1', isAdmin: false },
      expiresAt: Date.now() + 3600000,
    }));
  });
  await page.goto('/admin');

  // Annual Funds and Transactions are the two a funds-only member came for;
  // everything else is an editor screen and stays out of their menu.
  const OPEN_TO_ALL = ['Annual Funds', 'Transactions'];

  await expect(page.locator('.admin-nav-link')).toHaveCount(OPEN_TO_ALL.length);
  for (const s of SCREENS.filter((x) => !OPEN_TO_ALL.includes(x.label))) {
    await expect(page.locator('.admin-nav-link', { hasText: new RegExp(`^${s.label}$`) })).toHaveCount(0);
  }
});

test('the sheets are fetched once for the whole visit, not once per screen', async ({ page }) => {
  // Apps Script takes 3-4 seconds to answer. Fetching per screen meant paying
  // that on every click of the sidebar; the rows are now kept for the visit, so
  // only the first screen waits. Counted at the network, because that is the
  // cost being avoided.
  test.skip(!CONNECTED, 'needs the Content Web App');

  // Counts the editor's own read (it carries the session token). The public
  // site must not touch this endpoint at all, which the next assertion checks.
  let calls = 0;
  let publicHits = 0;
  const endpoint = SHEETS_CONFIG.api.content;
  await page.route(`${endpoint}**`, (route) => {
    if (route.request().url().includes('token=')) calls++; else publicHits++;
    return route.continue();
  });

  await openPortal(page);
  await page.locator('.admin-nav-link', { hasText: /^Members$/ }).click();
  await expect(page.locator('.tbl tbody tr').first()).toBeVisible({ timeout: 60000 });
  expect(calls, 'the first screen should fetch').toBe(1);

  for (const label of ['Schedule', 'About', 'Mandapam', 'Settings']) {
    await page.locator('.admin-nav-link', { hasText: new RegExp(`^${label}$`) }).click();
    await expect(page.locator('.admin-skel')).toHaveCount(0);
  }
  await expect(page.locator('input[type=date]')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);

  expect(calls, 'later screens should read what is already loaded').toBe(1);
  expect(publicHits, 'only the editor screens may call the write endpoint').toBe(0);
});
