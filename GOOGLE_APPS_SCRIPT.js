/**
 * Google Apps Script to automatically find and serve Excel file from Drive folder
 * 
 * SETUP INSTRUCTIONS:
 * 1. Go to https://script.google.com
 * 2. Click "New Project"
 * 3. Paste this entire code
 * 4. Update FOLDER_ID and FILE_NAME below
 * 5. Click "Deploy" > "New deployment"
 * 6. Select type: "Web app"
 * 7. Execute as: "Me"
 * 8. Who has access: "Anyone"
 * 9. Click "Deploy"
 * 10. Copy the Web App URL
 * 11. Paste it in src/config/driveConfig.js as GOOGLE_APPS_SCRIPT_URL
 */

// CONFIGURATION - Update these values
const FOLDER_ID = '1Oe43PELTFlfw9YkG6X-Nbtu4mzrI0-6o'; // Your folder ID
const FILE_NAME = 'SSGC_Cash_Transfers.xlsx'; // Your Excel file name

/**
 * Main function to serve the Excel file
 */
function doGet() {
  try {
    // Get the folder
    const folder = DriveApp.getFolderById(FOLDER_ID);
    
    // Find the file by name
    const files = folder.getFilesByName(FILE_NAME);
    
    if (!files.hasNext()) {
      return ContentService.createTextOutput(JSON.stringify({
        error: 'File not found',
        message: `File "${FILE_NAME}" not found in folder`
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Get the first file (most recent if multiple)
    const file = files.next();
    
    // Get file blob
    const blob = file.getBlob();
    
    // Return the file
    return ContentService.createTextOutput(Utilities.base64Encode(blob.getBytes()))
      .setMimeType(ContentService.MimeType.TEXT);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      error: 'Error fetching file',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Alternative: Return file as JSON data (parsed)
 */
function doGetAsJSON() {
  try {
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const files = folder.getFilesByName(FILE_NAME);
    
    if (!files.hasNext()) {
      return ContentService.createTextOutput(JSON.stringify({
        error: 'File not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const file = files.next();
    const blob = file.getBlob();
    
    // Return base64 encoded file
    const base64Data = Utilities.base64Encode(blob.getBytes());
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      fileName: FILE_NAME,
      fileSize: blob.getBytes().length,
      data: base64Data,
      mimeType: blob.getContentType()
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      error: 'Error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

