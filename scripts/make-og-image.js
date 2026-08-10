/**
 * Renders public/og-image.png — the card WhatsApp, Facebook and X show when
 * somebody shares the site.
 *
 * A script rather than a hand-made file for two reasons: the artwork in the
 * repo is still placeholder and will be replaced, and the card has to stay
 * under WhatsApp's size limit, which is easy to blow with a photo and easy to
 * hold with a rendered card. Re-run it whenever the emblem or the wording
 * changes:
 *
 *     node scripts/make-og-image.js
 *
 * The same card is kept as scripts/og-card.html, which can be opened in a
 * browser and captured by hand if this script is ever unavailable.
 *
 * 1200x630 is the size every platform crops from; anything smaller gets
 * upscaled and looks soft in the preview.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const out = path.join(root, 'public', 'og-image.png');

// Inlined, because the page is rendered from a data URL and has no server to
// fetch a file from.
const emblem = 'data:image/png;base64,'
  + fs.readFileSync(path.join(root, 'src/assets/logo.png')).toString('base64');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;600;700&family=Anek+Telugu:wght@500&display=swap');
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; display: grid; place-items: center;
    font-family: 'Josefin Sans', sans-serif; text-align: center;
    background:
      radial-gradient(120% 130% at 50% 0%, rgba(223,174,77,.20) 0%, transparent 55%),
      linear-gradient(160deg, #16274a 0%, #0e1b33 45%, #060d1b 100%);
    color: #eef4ff;
  }
  .card { display: flex; flex-direction: column; align-items: center; gap: 26px; padding: 0 80px; }
  .emblem {
    width: 168px; height: 168px; border-radius: 50%; overflow: hidden;
    clip-path: circle(50%); background: #0a1428;
    box-shadow: 0 0 0 3px rgba(223,174,77,.55), 0 24px 60px rgba(0,0,0,.6);
  }
  .emblem img { width: 100%; height: 100%; object-fit: cover; transform: scale(1.106); }
  h1 {
    font-size: 66px; font-weight: 700; line-height: 1.08; letter-spacing: .01em;
    background: linear-gradient(180deg, #f4d68e, #dfae4d);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .te { font-family: 'Anek Telugu', sans-serif; font-size: 31px; font-weight: 500; color: #cbd8f0; }
  .rule { width: 190px; height: 2px; background: linear-gradient(90deg, transparent, #dfae4d, transparent); }
  .place { font-size: 24px; font-weight: 300; letter-spacing: .22em; text-transform: uppercase; color: #93a6c9; }
</style></head><body>
  <div class="card">
    <div class="emblem"><img src="${emblem}" alt=""></div>
    <h1>Sri Shakthi Ganapathi<br>Committee</h1>
    <div class="te">శ్రీ శక్తి గణపతి కమిటీ</div>
    <div class="rule"></div>
    <div class="place">Annapurnamma Peta &middot; Rajamahendravaram</div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();

const kb = fs.statSync(out).size / 1024;
console.log(`wrote ${path.relative(root, out)} — ${kb.toFixed(0)} KB`);
// WhatsApp quietly declines to show a preview for images much over 600 KB.
if (kb > 600) console.warn('WARNING: over 600 KB — WhatsApp may not render the preview.');
