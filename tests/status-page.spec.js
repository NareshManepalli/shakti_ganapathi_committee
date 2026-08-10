import { test, expect } from '@playwright/test';

// project-status.html counts its own status pills and repaints every bar from
// them, rather than carrying numbers somebody has to remember to update.
//
// This checks the values typed into the markup already agree with what that
// count produces. Two reasons it matters: the report is often opened as a file
// rather than served, where the script may not run at all; and a disagreement
// between the two means a pill was changed without the summary being refreshed,
// which is exactly the drift this replaced — the hero once claimed 34 of 49
// while the tables held 46 rows.
const grab = () => ({
  hero: document.querySelector('.progress-hero-pct').textContent,
  fill: document.querySelector('.progress-hero-fill').getAttribute('style'),
  part: document.querySelector('.progress-hero-part').getAttribute('style'),
  aria: document.querySelector('.progress-hero-track').getAttribute('aria-label'),
  legend: [...document.querySelectorAll('.progress-hero-legend b')].map((b) => b.textContent),
  stats: [...document.querySelectorAll('.stat .n')].map((n) => n.textContent),
  barAria: document.querySelector('.bar').getAttribute('aria-label'),
  bar: [...document.querySelectorAll('.bar span')].map((s) => s.style.flex),
  phases: [...document.querySelectorAll('.phase')].map((p) => [
    p.querySelector('.phase-no').textContent.trim(),
    p.querySelector('.phase-fill').getAttribute('style'),
    p.querySelector('.phase-part').getAttribute('style'),
    ...[...p.querySelectorAll('.phase-foot span')].map((s) => s.textContent.trim()),
  ]),
});

test('the numbers in the markup match the ones counted from the table', async ({ page }) => {
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));

  // strip the script, so this is what the markup says on its own
  await page.route('**/project-status.html', async (route) => {
    const res = await route.fetch();
    const html = (await res.text()).replace(/<script>[\s\S]*?<\/script>/g, '');
    await route.fulfill({ response: res, body: html, contentType: 'text/html' });
  });
  await page.goto('/project-status.html');
  const written = await page.evaluate(grab);

  await page.unroute('**/project-status.html');
  await page.goto('/project-status.html');
  const counted = await page.evaluate(grab);

  expect(errs, 'the status page threw').toEqual([]);
  expect(written, 'a status pill changed without the summary being refreshed').toEqual(counted);
});

test('a row with a phase carries a status, and the reverse', async ({ page }) => {
  await page.goto('/project-status.html');

  // A row with a phase but no pill is invisible to the counter, so it quietly
  // shrinks the denominator instead of showing up as unfinished work. A row
  // with a pill but no phase counts toward the total while belonging to no
  // phase, so the phase bars stop adding up to the hero. The decisions table
  // has neither and is untouched by both rules.
  const odd = await page.evaluate(() => {
    const name = (tr) => (tr.querySelector('.name') || {}).textContent?.trim() || '?';
    const rows = [...document.querySelectorAll('tbody tr')];
    return {
      phaseNoStatus: rows.filter((tr) => tr.querySelector('.ph') && !tr.querySelector('td .pill')).map(name),
      statusNoPhase: rows.filter((tr) => tr.querySelector('td .pill') && !tr.querySelector('.ph')).map(name),
    };
  });

  expect(odd.phaseNoStatus, 'phase but no status pill').toEqual([]);
  expect(odd.statusNoPhase, 'status pill but no phase').toEqual([]);
});
