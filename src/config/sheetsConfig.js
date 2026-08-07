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
};
