// Google Drive Configuration
// 
// SETUP INSTRUCTIONS:
// 
// Option 1: Use Excel File (Recommended for monthly updates)
// 1. Open SSGC_Cash_Transfers.xlsx in Google Drive
// 2. Right-click > Get link > Copy link
// 3. The link looks like: https://drive.google.com/file/d/FILE_ID/view
// 4. Copy the FILE_ID and paste it below in EXCEL_FILE_ID
// 5. Make sure file sharing is set to "Anyone with the link can view"
//
// Option 2: Use Google Sheets (Easier, already configured)
// - The SHEETS_URL below is already set up
// - Just convert your Excel to Google Sheets format in Drive
// - The app will automatically fetch from Google Sheets
//
// MONTHLY UPDATES:
// - Just replace/update the file in Google Drive
// - The website will automatically fetch the latest data

export const DRIVE_CONFIG = {
  // OPTION 1: Google Sheets (RECOMMENDED - Easiest, no setup needed!)
  // Just convert your Excel to Google Sheets format in Drive
  // The file will automatically update when you edit it
  SHEETS_URL: 'https://docs.google.com/spreadsheets/d/1brHXVGAqREne3bLrXgidhdYcRN2T9pZt/edit?gid=371683710#gid=371683710',
  
  // OPTION 2: Google Apps Script URL (for Excel files)
  // After setting up Google Apps Script, paste the Web App URL here
  // See SETUP_INSTRUCTIONS.md for step-by-step guide
  GOOGLE_APPS_SCRIPT_URL: null, // Paste your Google Apps Script Web App URL here
  
  // OPTION 3: Direct Excel file ID (if you prefer)
  // Get it from: https://drive.google.com/file/d/FILE_ID/view
  EXCEL_FILE_ID: null,
  
  // Folder URL (for reference)
  FOLDER_URL: 'https://drive.google.com/drive/folders/1Oe43PELTFlfw9YkG6X-Nbtu4mzrI0-6o?usp=sharing',
  
  // File name
  FILE_NAME: 'SSGC_Cash_Transfers.xlsx'
};

// Helper function to extract file ID from Google Drive URL
export const extractFileIdFromUrl = (url) => {
  if (!url) return null;
  
  // Try different URL patterns
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9-_]+)/,  // /file/d/FILE_ID
    /\/d\/([a-zA-Z0-9-_]+)/,        // /d/FILE_ID
    /id=([a-zA-Z0-9-_]+)/           // id=FILE_ID
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
};

