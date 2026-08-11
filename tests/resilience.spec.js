import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// What the page does when things go wrong.
//
// Every other spec checks the happy path. These break something on purpose:
// the sheets refuse to answer, or a section throws while rendering. Both used
// to fail silently — an unreadable sheet left a heading over an empty box, and
// a thrown render left a blank white page with no header and nothing to click.
const session = () => fs.readFileSync('tests/.session-value.json', 'utf8');

// Every source the public page reads: the CSV exports and the members Web App.
// Blocking only docs.google.com leaves Committee working, because that section
// reads through a Web App so the members sheet can stay Restricted.
const ALL_SOURCES = /docs\.google\.com|googleusercontent\.com|script\.google\.com/;

const breakSheets = (page) => page.route(ALL_SOURCES, (route) => route.abort('failed'));

test.describe('when a sheet cannot be read', () => {
  test('each section says so and offers a retry, rather than showing a bare heading', async ({ page }) => {
    await breakSheets(page);
    await page.goto('/');

    // every section whose content comes from a sheet
    await expect(page.locator('#about .sec-state')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#about .sec-state-retry')).toBeVisible();
    await expect(page.locator('#committee .sec-state')).toBeVisible();
    await expect(page.locator('#schedule .sec-state')).toBeVisible();
    await expect(page.locator('.mandapam-section .sec-state')).toBeVisible();

    // and it is the error wording, not the "nothing here yet" wording
    await expect(page.locator('#about .sec-state')).toHaveClass(/is-error/);
    await expect(page.locator('#about .sec-state-title')).toHaveText('This section could not be loaded');
  });

  test('the rest of the page still works', async ({ page }) => {
    await breakSheets(page);
    await page.goto('/');
    await expect(page.locator('#about .sec-state')).toBeVisible({ timeout: 30000 });

    // header, hero and the funds doorway do not depend on a sheet
    await expect(page.locator('.main-header')).toBeVisible();
    await expect(page.locator('.funds-gate-card')).toBeVisible();
    await expect(page.locator('.countdown-label').first()).toBeVisible();
  });

  test('Retry re-reads the sheets and fills the section in', async ({ page }) => {
    let block = true;
    await page.route(ALL_SOURCES, (route) => (block ? route.abort('failed') : route.continue()));

    await page.goto('/');
    await expect(page.locator('#about .sec-state-retry')).toBeVisible({ timeout: 30000 });

    block = false;
    await page.locator('#about .sec-state-retry').click();

    await expect(page.locator('#about .about-text')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#about .sec-state')).toHaveCount(0);
  });

  test('the message is in Telugu when the site is', async ({ page }) => {
    await breakSheets(page);
    await page.goto('/');
    await expect(page.locator('#about .sec-state')).toBeVisible({ timeout: 30000 });

    await page.locator('.lang-switch').first().click();
    await expect(page.locator('#about .sec-state-title')).not.toHaveText('This section could not be loaded');
    await expect(page.locator('#about .sec-state-retry')).not.toHaveText('Try again');
  });
});

test.describe('when a section throws', () => {
  // Forces About to throw during render by handing it a shape it cannot use.
  // The CSV parser builds the section from the sheet, so a row with the right
  // header and an impossible body is the honest way in.
  const poison = (page) =>
    page.route(/docs\.google\.com\/spreadsheets.*1KYhZ/, (route) =>
      route.fulfill({ contentType: 'text/csv', body: 'not,a,valid\nsheet' }));

  test('the page survives, and the header and other sections still render', async ({ page }) => {
    await poison(page);
    await page.goto('/');

    // whatever About does with that, the page is not blank
    await expect(page.locator('.main-header')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#committee')).toBeVisible();
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('the admin portal', () => {
  test('a screen that throws leaves the sidebar usable', async ({ page }) => {
    await page.addInitScript((v) => sessionStorage.setItem('ssgc.session', v), session());

    // break the editor's own endpoint, not the whole of Google
    await page.route(/script\.google\.com.*token=/, (route) => route.abort('failed'));
    await page.goto('/admin/members');

    // the screen reports it; the chrome around it is untouched
    await expect(page.locator('.admin-msg.is-error, .sec-state')).toBeVisible({ timeout: 45000 });
    await expect(page.locator('.admin-nav-link')).toHaveCount(7);

    // and another screen is still reachable
    await page.locator('.admin-nav-link', { hasText: /^Gallery$/ }).click();
    await expect(page).toHaveURL(/\/admin\/gallery$/);
    await expect(page.locator('.admin-page-title')).toContainText('Gallery');
  });
});

test.describe('public dialogs', () => {
  // The lightbox and the identity card already closed on Escape and said
  // role="dialog", but neither held the keyboard: Tab walked out into the page
  // behind, which is still rendered and still clickable.
  test('the gallery lightbox keeps the keyboard inside it', async ({ page }) => {
    await page.goto('/');
    // button.gallery-item, not .gallery-item — the loading skeleton wears the
    // same class on a <span>, and clicking that does nothing at all
    const thumb = page.locator('button.gallery-item').first();
    await expect(thumb).toBeVisible({ timeout: 45000 });
    await thumb.scrollIntoViewIfNeeded();
    await thumb.click();

    const box = page.locator('.gallery-lightbox');
    await expect(box).toBeVisible({ timeout: 20000 });

    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() =>
        document.querySelector('.gallery-lightbox').contains(document.activeElement));
      expect(inside, `focus left the lightbox after ${i + 1} tabs`).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(box).toHaveCount(0);
  });

  test('the identity card returns focus to the member that opened it', async ({ page }) => {
    await page.goto('/');
    // .member-card, so this waits for a real card rather than a skeleton
    const card = page.locator('#committee .member-card.executive-card').first();
    await expect(card).toBeVisible({ timeout: 45000 });
    await card.scrollIntoViewIfNeeded();
    await card.click();

    await expect(page.locator('.idcard')).toBeVisible({ timeout: 20000 });
    const inside = await page.evaluate(() =>
      document.querySelector('.idcard').contains(document.activeElement));
    expect(inside, 'focus should start inside the card').toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.locator('.idcard')).toHaveCount(0);
    // back where it came from, not at the top of the page
    const restored = await page.evaluate(() =>
      document.activeElement !== document.body && document.activeElement.closest('#committee') !== null);
    expect(restored, 'focus should return to the committee section').toBe(true);
  });
});
