// ---------------------------------------------------------------------------
// Google Sheets configuration
// ---------------------------------------------------------------------------
// Each section of the site is driven by its own Google Sheet (one sheet file
// per section, kept together in a Drive folder on the committee's mail id).
//
// HOW TO FILL THIS IN (see sheets/SETUP_STEPS.md for the full walkthrough):
//   1. In the committee Google account, create a Sheet for the section.
//   2. File > Share > General access > "Anyone with the link" > Viewer.
//   3. Copy the browser URL of the sheet and paste it below.
//
// The URL can be either form — both work:
//   https://docs.google.com/spreadsheets/d/SHEET_ID/edit?gid=0#gid=0
//   https://docs.google.com/spreadsheets/d/SHEET_ID/edit
//
// Leave a value as null to keep using the built-in text from translations.js
// for that section (so nothing breaks before the sheet exists).
// ---------------------------------------------------------------------------

export const SHEETS_CONFIG = {
  FOLDER_URL: null,

  // The Apps Script project's timezone, which is what a date or time cell is
  // measured in. The Content Web App hands those cells back as instants —
  // `2026-09-14T07:00:00.000Z` for a date, and a 1899-12-30 stamp for a
  // time-only cell — and reading either without this would land on the wrong
  // day, or an hour or two off the hour that was actually typed.
  //
  // It must match Extensions > Apps Script > Project Settings > Time zone.
  // 'America/Los_Angeles' is the default a new project is created with.
  sheetTimeZone: 'America/Los_Angeles',

  sections: {
    // About + Mandapam Location — two rows, keyed by `section`.
    // Columns: section | content_en | content_te | image | map_url |
    //          a_in | i_ts | u_ts | d_ts
    content: 'https://docs.google.com/spreadsheets/d/1KYhZ-3pImxBIW68f3ZljQi3RivM51O7kwKR1awC0UbA/edit?usp=sharing',

    // Committee members. Columns: id | name_en | name_te | position_en |
    //   position_te | mobile | email | photo | display_order | is_executive |
    //   access_in | adm_in | a_in | i_ts | u_ts | d_ts | prfle_photo
    // email / access_in / adm_in are never rendered publicly. `mobile` is —
    // the identity card shows it.
    members: 'https://docs.google.com/spreadsheets/d/1nzynJzTm72i7C0lmfR50VZ6lONArSrh7ncbejMSiYyc/edit?usp=sharing',

    // The nine festival days, per year. Columns: year | day_no | date |
    //   day_en | day_te | time | title_en | title_te | image |
    //   a_in | i_ts | u_ts | d_ts
    schedule: 'https://docs.google.com/spreadsheets/d/1rtsurWepUJlzebf2LczLO_2f_EZ0YXJ7M06plNLtGV8/edit?usp=sharing',
  },

  // Gallery photos, served from Drive by an Apps Script Web App
  // (apps-script/GOOGLE_APPS_SCRIPT_GALLERY.js). Paste its /exec URL here.
  // Leave null until it is deployed — the Gallery simply shows its empty state.
  //
  // The folder tree is the data: SSGC Gallery / <year> / photos.
  //
  // Read-only on purpose. The same /exec URL also accepts uploads and deletes,
  // but those require the script's UPLOAD_SECRET, which must NOT live here —
  // everything in this file is bundled and readable by anyone who opens the
  // site. The write token belongs to the admin portal in Phase 6.
  media: {
    gallery: 'https://script.google.com/macros/s/AKfycbwoAlxupP-zkEi7CtehvZgZ1yztNe450F_t6Iq7vfGjMF_tGXKVzvROp36qSeiFd6pVJQ/exec',
  },

  // Committee-member sign-in, served by the Auth Web App
  // (apps-script/GOOGLE_APPS_SCRIPT_AUTH.js). Paste its /exec URL here.
  // Leave null until it is deployed — the Funds card then says so plainly
  // instead of opening a login that cannot work.
  //
  // Safe to publish, like the gallery URL: the script decides everything. The
  // one-time code is generated, emailed and checked inside Apps Script and is
  // never sent to the browser, and the session token is signed with a key that
  // lives in Script Properties.
  auth: {
    url: 'https://script.google.com/macros/s/AKfycbzu0ocShGl1JzZCvGtyV8KMV3u0r5RXAu-X1YOObj8x0SQ2wigTYmruAjK957frGZkg/exec',
  },

  // Web Apps that serve a sheet instead of the browser reading its CSV export.
  //
  // members: deploy apps-script/GOOGLE_APPS_SCRIPT_MEMBERS.js and paste the
  //   /exec URL here, then set the members workbook back to *Restricted*.
  //   Reading it as CSV requires the whole sheet to be public, which exposes
  //   `email`, `access_in` and `adm_in` — and `email` is where the funds gate
  //   sends its one-time code. The Web App returns only the public columns.
  //   While this is null the site falls back to the CSV export, so the sheet
  //   must stay public until it is set.
  api: {
    // content: the Content Web App (apps-script/GOOGLE_APPS_SCRIPT_CONTENT.js).
    //   The admin portal's write endpoint for the content, schedule and members
    //   sheets. Every call needs a session token with adm_in = 1, so publishing
    //   the URL costs nothing. Leave null until it is deployed — the editor
    //   screens then say so rather than failing on save.
    //
    //   VITE_CONTENT_API overrides it. That exists for the browser tests, which
    //   answer the endpoint themselves rather than write real committee members
    //   into the live sheet; it means those specs run now instead of sitting
    //   skipped until the deployment lands. Paste the real /exec URL below.
    content: (import.meta.env && import.meta.env.VITE_CONTENT_API)
      || 'https://script.google.com/macros/s/AKfycbzJH8kx4HlG1Jmf-pElUnFCOgwQQvsSxv5ozncMHr5_Xy4YKbYdSB6Q4NAhmHfAllxZEQ/exec',

    members: 'https://script.google.com/macros/s/AKfycbzB_4OcL26B4SbVkfb1byNV8ZLzqPMHXc0t18hs1ZnlO7iVx7W6jqio6QTGGar-dUdHuw/exec',

    // funds: the Funds Web App (apps-script/GOOGLE_APPS_SCRIPT_FUNDS.js), which
    //   serves the money ledger behind Monthly Funds.
    //
    //   Its own endpoint rather than part of the content one, because the two
    //   answer different people: the content script refuses anyone without
    //   adm_in = 1, and Monthly Funds is the single screen a funds-only member
    //   can open. Here any signed-in member may read and only an admin may
    //   write. Leave null until it is deployed — the screen then says so
    //   instead of looking like an empty ledger.
    //
    //   VITE_FUNDS_API overrides it, as VITE_CONTENT_API does above: the browser
    //   tests answer the endpoint themselves rather than write invented money
    //   into the committee's own ledger.
    funds: (import.meta.env && import.meta.env.VITE_FUNDS_API)
      || 'https://script.google.com/macros/s/AKfycbydcYhcll0rOVoH_HGAE4hq1IVic72Mu7wRswy0vhnzzzhoxc4-HnmkD3Zg81EqGV-J0Q/exec',
  },
};
