// LEGACY data source — replaced in Phase 1 by the new Apps Script Web Apps.
//
// This still backs the Committee Fund table until the new backend lands. It is
// not the pattern to follow: the URL is hardcoded rather than read from .env,
// and browser-side CSV export from Drive is unreliable. Both are fixed in Phase 1.

export const DRIVE_CONFIG = {
  // Public Google Sheets / Drive file holding the cash transfers.
  SHEETS_URL: 'https://docs.google.com/spreadsheets/d/1brHXVGAqREne3bLrXgidhdYcRN2T9pZt/edit?gid=371683710#gid=371683710',

  // Apps Script Web App URL, for serving an .xlsx out of Drive.
  GOOGLE_APPS_SCRIPT_URL: null,

  // Direct Drive file ID of the .xlsx, if used instead of the Sheets URL.
  EXCEL_FILE_ID: null
};
