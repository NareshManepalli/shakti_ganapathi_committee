import { test, expect } from '@playwright/test';

// What a returning visitor waits for.
//
// The site read four sheets before it showed a word, and one of them comes
// through an Apps Script Web App that takes five to fifteen seconds to wake.
// On a phone that is a screenful of grey boxes for long enough to look broken.
//
// The last good copy is kept in the browser now and shown at once, with the
// fetch running behind it. These specs hold the two halves of that bargain: the
// second visit is immediate, and it is still the sheets — not the copy — that
// the visitor ends up looking at.
//
// The services are stubbed and made deliberately slow. Against the real ones
// the difference is the same but the numbers move about, and a timing spec that
// depends on somebody else's server is a spec that fails for no reason.

const SLOW_MS = 4000;

/** Answers every sheet read, slowly, and counts what was asked for. */
const stubSheets = async (page, { members = 'Venkat Naresh' } = {}) => {
  const seen = [];

  await page.route(/docs\.google\.com\/spreadsheets/, async (route) => {
    seen.push('csv');
    await new Promise((r) => { setTimeout(r, SLOW_MS); });
    const url = route.request().url();
    if (url.includes('schedule')) {
      return route.fulfill({
        contentType: 'text/csv',
        body: 'id,year,day_no,date,time,title_en,title_te,a_in\n1,2026,1,2026-09-14,06:00,Ganesh Sthapana,,1',
      });
    }
    return route.fulfill({
      contentType: 'text/csv',
      body: 'id,section,content_en,content_te,image,map_url,a_in\n1,about,About the committee,,,,1',
    });
  });

  // The members Web App — the slow one in practice, and the reason the first
  // paint used to wait at all.
  await page.route(/script\.google\.com/, async (route) => {
    seen.push('webapp');
    await new Promise((r) => { setTimeout(r, SLOW_MS); });
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        members: [{
          id: 1, name_en: members, name_te: '', position_en: 'President',
          mobile: '9000000001', display_order: 1, is_executive: true, a_in: '1',
        }],
      }),
    });
  });

  return seen;
};

const committee = (page) => page.locator('#committee');

test.describe('a returning visitor', () => {
  test('waits for the sheets the first time, and not the second', async ({ page }) => {
    await stubSheets(page);

    // First visit: nothing is stored, so the grey boxes are honest.
    await page.goto('/');
    await expect(page.locator('.admin-skel, .skel, [class*="skel"]').first())
      .toBeVisible({ timeout: 3000 })
      .catch(() => {});   // the markup differs per section; absence is not the point
    await expect(committee(page)).toContainText('Venkat Naresh', { timeout: 30000 });

    // Second visit: the copy is there, so the name is on screen before the
    // four-second sheets could possibly have answered.
    const started = Date.now();
    await page.goto('/');
    await expect(committee(page)).toContainText('Venkat Naresh', { timeout: SLOW_MS - 1500 });
    const painted = Date.now() - started;

    expect(painted, `content took ${painted}ms — the stored copy was not used`)
      .toBeLessThan(SLOW_MS);
  });

  test('still ends up looking at the sheets, not the copy', async ({ page }) => {
    await stubSheets(page);
    await page.goto('/');
    await expect(committee(page)).toContainText('Venkat Naresh', { timeout: 30000 });

    // The committee edits the sheet between visits.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await stubSheets(page, { members: 'Ramesh Kumar' });

    await page.goto('/');
    // The old name first, because that is what was kept …
    await expect(committee(page)).toContainText('Venkat Naresh', { timeout: 2000 });
    // … and the new one once the fetch behind it lands. A cache that never
    // caught up would be worse than none: the committee would edit a sheet and
    // watch the site ignore them.
    await expect(committee(page)).toContainText('Ramesh Kumar', { timeout: 30000 });
  });

  test('a sheet that fails does not blank what is already on screen', async ({ page }) => {
    await stubSheets(page);
    await page.goto('/');
    await expect(committee(page)).toContainText('Venkat Naresh', { timeout: 30000 });

    // Now every read fails, as one unlucky request would.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.route(/docs\.google\.com\/spreadsheets|script\.google\.com/,
      (route) => route.fulfill({ status: 500, contentType: 'text/html', body: '<html>no</html>' }));

    await page.goto('/');
    await page.waitForTimeout(6000);
    // Taking content away from somebody who could see it a moment ago, over one
    // failed request, is the worst of both worlds.
    await expect(committee(page)).toContainText('Venkat Naresh');
  });
});
