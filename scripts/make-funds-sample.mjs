import { chromium } from '@playwright/test';
import fs from 'node:fs';

/**
 * Writes sheets/funds-statement-sample.pdf from the live ledger.
 *
 * Drives the real screen and presses the real button, so the sample is the
 * statement the committee actually gets — not a mock-up of one that could drift
 * from it. The bytes are taken from the blob jsPDF builds rather than from a
 * download event: jsPDF hands the file to the browser through an object URL,
 * and whether that surfaces as a download Playwright can see depends on the
 * browser's own settings. The blob is the file either way.
 *
 *   node scripts/make-funds-sample.mjs
 *
 * Needs tests/.session-value.json, which `npx playwright test --project=setup`
 * writes. Reads only — nothing is saved to the sheet.
 */
const OUT_DIR = 'sheets';
const BASE = process.env.SSGC_BASE || 'http://localhost:5174';

const session = fs.readFileSync('tests/.session-value.json', 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();

await page.addInitScript((value) => {
  sessionStorage.setItem('ssgc.session', value);

  // jsPDF's save() puts the file behind an object URL and clicks a link at it.
  // Wrapping the factory keeps hold of the blob itself.
  window.__pdfBlobs = [];
  const original = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    window.__pdfBlobs.push(blob);
    return original(blob);
  };
}, session);

page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));

await page.goto(`${BASE}/admin/monthly-funds`);
await page.locator('.fnd-year-select').waitFor({ timeout: 60000 });

// The range is chosen through the drawer, so the sample is produced the way a
// member produces one — not by calling the builder behind the screen's back.
const YEAR = process.env.SSGC_YEAR || '';   // the fund year's number, e.g. 1 or 2
const OUT_NAME = process.env.SSGC_OUT || 'funds-statement-sample.pdf';

if (YEAR) await page.locator('.fnd-year-select').selectOption(YEAR);
const span = (await page.locator('.fnd-year-select').textContent()) || '';
const detail = (await page.locator('.tbl-count').textContent()) || '';

await page.getByRole('button', { name: /Download statement/ }).click();
await page.getByRole('button', { name: 'Download statement' }).waitFor({ timeout: 60000 });

const base64 = await page.evaluate(async () => {
  const blob = window.__pdfBlobs.at(-1);
  if (!blob) return null;
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
});

await browser.close();

if (!base64) {
  console.error('No PDF blob was produced — the statement did not build.');
  process.exit(1);
}

const bytes = Buffer.from(base64, 'base64');
if (bytes.subarray(0, 5).toString() !== '%PDF-') {
  console.error('What came back is not a PDF.');
  process.exit(1);
}

fs.writeFileSync(`${OUT_DIR}/${OUT_NAME}`, bytes);
console.log(`${OUT_DIR}/${OUT_NAME}
  ${span.trim()}
  ${detail.trim()}
  ${(bytes.length / 1024).toFixed(1)} kB`);
