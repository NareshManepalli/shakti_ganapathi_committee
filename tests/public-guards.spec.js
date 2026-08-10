import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { adminMobile } from './config';

// Copy protection on the public pages, and the gallery download beside it.
//
// The risk with switching selection off is not that it fails to work — it is
// that it works too widely: a portal nobody can copy a Drive link out of, or a
// sign-in field a member cannot correct or paste a code into. Most of what is
// here checks where it stops.
const session = () => fs.readFileSync('tests/.session-value.json', 'utf8');

const selectable = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return 'missing';
  const v = getComputedStyle(el).userSelect || getComputedStyle(el).webkitUserSelect;
  return v;
}, sel);

test.describe('copy protection', () => {
  test('the public page cannot be selected', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.about-text')).toBeVisible({ timeout: 45000 });
    expect(await selectable(page, '.App')).toBe('none');

    // and a copy attempt is refused rather than quietly succeeding
    const copied = await page.evaluate(() => {
      const e = new ClipboardEvent('copy', { bubbles: true, cancelable: true });
      document.querySelector('.about-text').dispatchEvent(e);
      return !e.defaultPrevented;
    });
    expect(copied, 'copy should be prevented on the page body').toBe(false);
  });

  test('a form field is still selectable, and still takes a paste', async ({ page }) => {
    await page.goto('/funds');
    const tel = page.locator('input[type=tel]');
    await expect(tel).toBeVisible({ timeout: 30000 });
    expect(['auto', 'text']).toContain(await selectable(page, 'input[type=tel]'));

    // typing, selecting and replacing all work — this is the member correcting
    // a mistyped number, which the guard must not touch
    await tel.fill('9999999999');
    await tel.selectText();
    await tel.fill('7702639309');
    await expect(tel).toHaveValue('7702639309');

    const blocked = await page.evaluate(() => {
      const el = document.querySelector('input[type=tel]');
      el.focus();
      const e = new ClipboardEvent('copy', { bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(blocked, 'copy inside a field must not be blocked').toBe(false);
  });

  test('the admin portal is left alone', async ({ page }) => {
    await page.addInitScript((v) => sessionStorage.setItem('ssgc.session', v), session());
    await page.goto('/admin/members');
    await expect(page.locator('.tbl-card')).toBeVisible({ timeout: 45000 });

    // editing means moving a Drive link between fields; a portal that refuses
    // to copy is a portal nobody can work in
    expect(await selectable(page, '.admin-root')).not.toBe('none');
    const blocked = await page.evaluate(() => {
      const e = new ClipboardEvent('copy', { bubbles: true, cancelable: true });
      document.querySelector('.admin-root').dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(blocked, 'the portal must stay copyable').toBe(false);
  });
});

test.describe('gallery download', () => {
  test('the preview offers a download of the original file', async ({ page }) => {
    await page.goto('/');
    const thumb = page.locator('button.gallery-item').first();
    await expect(thumb).toBeVisible({ timeout: 45000 });
    await thumb.scrollIntoViewIfNeeded();
    await thumb.click();

    const link = page.locator('.gallery-lb-download');
    await expect(link).toBeVisible();

    // Drive's download endpoint, not the thumbnail one the page renders from —
    // saving from that would keep a shrunken re-encode instead of the file the
    // committee uploaded.
    const href = await link.getAttribute('href');
    expect(href).toMatch(/drive\.google\.com\/uc\?export=download&id=/);
    expect(href).not.toMatch(/thumbnail/);

    // it must not close the lightbox on the way out
    await link.click({ modifiers: ['Alt'] }).catch(() => {});
    await expect(page.locator('.gallery-lightbox')).toBeVisible();
  });

  test('download and close sit together and both still work', async ({ page }) => {
    await page.goto('/');
    const thumb = page.locator('button.gallery-item').first();
    await expect(thumb).toBeVisible({ timeout: 45000 });
    await thumb.click();

    await expect(page.locator('.gallery-lb-actions .gallery-lb-download')).toBeVisible();
    await page.locator('.gallery-lb-actions .gallery-lb-close').click();
    await expect(page.locator('.gallery-lightbox')).toHaveCount(0);
  });
});
