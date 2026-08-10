import { test, expect } from '@playwright/test';

// project-status.html is written by hand, and its summary drifted out of step
// with its own tables several times: the hero once claimed 34 of 49 while the
// tables held 46 rows, and a phase bar disagreed with the footer beneath it.
//
// The numbers are few enough now that a script to compute them would be more
// machinery than the problem deserves — but they still have to agree, and
// nothing else checks prose. These specs count the status pills in the tables
// and hold the summary to what they say.
const PAGE = '/project-status.html';

/**
 * Tallies every deliverable row on the page.
 *
 * Three states, not two: `warn` is something that was built and has since gone
 * out of step with the code. Counting it as done would overstate the board, and
 * counting it as unbuilt would understate it — so it is its own column, and the
 * headline percentage counts only what is genuinely done.
 */
const tally = (page) => page.evaluate(() => {
  const rows = [...document.querySelectorAll('tbody tr')];
  const out = { done: 0, warn: 0, todo: 0, total: 0, unstatused: [] };
  for (const tr of rows) {
    const pill = tr.querySelector('td .pill');
    const name = tr.querySelector('.name');
    if (!pill) { if (name) out.unstatused.push(name.textContent.trim()); continue; }
    if (pill.classList.contains('done')) out.done++;
    else if (pill.classList.contains('warn')) out.warn++;
    else out.todo++;
    out.total++;
  }
  return out;
});

test('the summary agrees with the tables it summarises', async ({ page }) => {
  await page.goto(PAGE);
  const t = await tally(page);

  const pct = Math.round((t.done / t.total) * 100);
  await expect(page.locator('.progress-hero-pct')).toHaveText(`${pct}%`);
  await expect(page.locator('.progress-hero-fill')).toHaveAttribute('style', `width: ${pct}%`);
  await expect(page.locator('.progress-hero-legend b')).toHaveText(`${t.done} of ${t.total}`);

  // Tiles and bar segments are read by class, not by position — a new state
  // inserted in the middle used to shift every assertion after it by one.
  const stat = (kind) => page.locator(`.stat.${kind} .n`);
  await expect(stat('done')).toHaveText(String(t.done));
  await expect(stat('todo')).toHaveText(String(t.todo));
  await expect(page.locator('.stat.warn .n')).toHaveCount(t.warn ? 1 : 0);
  if (t.warn) await expect(stat('warn')).toHaveText(String(t.warn));

  // the segmented bar is weighted by the same counts
  await expect(page.locator('.bar .s-done')).toHaveCSS('flex-grow', String(t.done));
  await expect(page.locator('.bar .s-todo')).toHaveCSS('flex-grow', String(t.todo));
  if (t.warn) await expect(page.locator('.bar .s-warn')).toHaveCSS('flex-grow', String(t.warn));
});

test('every deliverable row carries a status', async ({ page }) => {
  await page.goto(PAGE);
  const t = await tally(page);
  // A row with no pill counts toward nothing, so it silently shrinks the
  // denominator instead of showing up as unfinished work.
  expect(t.unstatused, `rows with no status pill: ${t.unstatused.join(', ')}`).toEqual([]);
});

test('each section heading counts its own rows correctly', async ({ page }) => {
  await page.goto(PAGE);

  // "9 of 11 screens", "11 sections · all done" — the counts beside each
  // heading are typed in, and they are the first thing to go stale.
  const wrong = await page.evaluate(() => {
    const bad = [];
    for (const h of document.querySelectorAll('h2')) {
      const count = h.querySelector('.count');
      const card = h.nextElementSibling;
      const rows = card ? [...card.querySelectorAll('tbody tr')] : [];
      if (!count || !rows.length) continue;

      const done = rows.filter((r) => r.querySelector('td .pill.done')).length;
      const text = count.textContent;
      const m = text.match(/(\d+)\s+of\s+(\d+)/);
      if (m) {
        if (Number(m[1]) !== done || Number(m[2]) !== rows.length) {
          bad.push(`${h.firstChild.textContent.trim()}: says "${text.trim()}", rows say ${done} of ${rows.length}`);
        }
      } else {
        // the "N sections · all done" form
        const n = text.match(/(\d+)\s+(sections?|screens?)/);
        if (n && Number(n[1]) !== rows.length) {
          bad.push(`${h.firstChild.textContent.trim()}: says ${n[1]}, has ${rows.length} rows`);
        }
        if (/all done/.test(text) && done !== rows.length) {
          bad.push(`${h.firstChild.textContent.trim()}: says "all done" but ${rows.length - done} are not`);
        }
      }
    }
    return bad;
  });

  expect(wrong, wrong.join(' | ')).toEqual([]);
});

test("What's left names every row still open", async ({ page }) => {
  await page.goto(PAGE);

  // Anything not finished, whether it was never built or has fallen out of step
  // with the code — both are work, and both have to be named at the bottom.
  const openRows = await page.evaluate(() =>
    [...document.querySelectorAll('tbody tr')]
      .filter((tr) => tr.querySelector('td .pill.todo, td .pill.warn'))
      .map((tr) => tr.querySelector('.name').textContent.trim()));

  const pending = (await page.locator('.pending').textContent()).toLowerCase();

  // Anything unfinished has to be accounted for at the bottom of the page,
  // otherwise the summary says "5 to build" and the reader is left guessing
  // which five.
  const missing = openRows.filter((name) => {
    const key = name.replace(/ (manager|Web App)$/i, '').toLowerCase();
    return !pending.includes(key.toLowerCase());
  });
  expect(missing, `not mentioned under What's left: ${missing.join(', ')}`).toEqual([]);
});
