# Sri Shakthi Ganapathi Committee — Website

Bilingual (English / Telugu) committee website with a public site, an admin portal,
and a committee-only transactions page.

## Status

Being rebuilt from a static placeholder site into a dynamic, Google Sheets &
Drive-bound application. **Open [`project-status.html`](project-status.html) in a
browser for the full plan of action** — 8 phases, 41 deliverables, with per-phase
progress bars.

Current phase: **Phase 0 — Foundation & Cleanup**

## What it will be

| Part | Description |
|---|---|
| **Public site** | Home (static) → About → Committee Members → 9-Day Schedule → Gallery → Mandapam Location → Committee Fund button → Footer |
| **Transactions** | Committee-only page, opened by entering a registered mobile number plus a shared secret code. Verified server-side in Apps Script |
| **Admin portal** | Single admin role. Edit About, Members, Gallery uploads, the 9-day Schedule, Mandapam details, Transactions and the fund access code |

All content is stored in the committee's own Google Sheets and Drive, read and
written through Apps Script Web Apps. There is no server to run or pay for.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
npm run preview  # preview the production build
```

## Stack

React 18 · Vite 5 · Google Sheets + Drive + Apps Script

## Theme

All colours are centralised in [`src/styles/theme.css`](src/styles/theme.css) as CSS
custom properties. Change a variable there and it applies across the whole site.

## Language

Strings live in [`src/utils/translations.js`](src/utils/translations.js) under `en` and
`te`. The active language is held in `LanguageContext`, persisted to `localStorage`,
and applied as a `lang-en` / `lang-te` class on `<body>` to switch fonts
(Josefin Sans for English, Anek Telugu for Telugu).
