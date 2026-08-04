# Google Drive Setup Instructions

To enable automatic data fetching from your Excel file in Google Drive, follow these steps:

## Option 1: Use Excel File Directly (Recommended)

1. **Get the File ID:**
   - Open your Excel file (`SSGC_Cash_Transfers.xlsx`) in Google Drive
   - Right-click on the file
   - Click "Get link" or "Share"
   - Copy the link (it will look like: `https://drive.google.com/file/d/FILE_ID/view`)
   - Extract the `FILE_ID` (the long string between `/d/` and `/view`)

2. **Update Configuration:**
   - Open `src/config/driveConfig.js`
   - Set `EXCEL_FILE_ID` to your file ID:
     ```javascript
     EXCEL_FILE_ID: 'YOUR_FILE_ID_HERE'
     ```

3. **Make sure the file is publicly accessible:**
   - Right-click the file > Share
   - Set access to "Anyone with the link can view"
   - Click "Copy link" and save it

## Option 2: Convert Excel to Google Sheets (Easier)

1. **Convert the file:**
   - Open the Excel file in Google Drive
   - Click "Open with" > "Google Sheets"
   - The file will be converted automatically

2. **Get the Sheets URL:**
   - Click "Share" button
   - Set access to "Anyone with the link can view"
   - Copy the link
   - The URL is already configured in `driveConfig.js`

3. **The app will automatically use the Google Sheets URL**

## How It Works

The app tries to fetch data in this order:
1. **Excel file** (if `EXCEL_FILE_ID` is set)
2. **Google Sheets** (from `SHEETS_URL` in config)
3. **Fallback data** (sample data if both fail)

## Monthly Updates

When you update the file monthly:
- **If using Excel:** Just replace the file in Google Drive with the same name
- **If using Google Sheets:** Just update the data in the sheet
- The website will automatically fetch the latest data

## Troubleshooting

- **File not found:** Make sure the file is set to "Anyone with the link can view"
- **CORS errors:** Try converting Excel to Google Sheets format
- **No data showing:** Check browser console for error messages

