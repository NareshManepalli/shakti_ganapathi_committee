# Step-by-Step Setup Guide - No Code Changes Needed After Setup

## 🎯 Goal
Edit your Excel file in Google Drive monthly, save it, and the website automatically shows the latest data when you refresh the page.

---

## ✅ ONE-TIME SETUP (Choose One Option)

### **Option A: Convert Excel to Google Sheets (RECOMMENDED - Easiest)**

This is the easiest method and requires NO code changes after initial setup.

#### Step 1: Convert Excel to Google Sheets
1. Go to your Google Drive folder: https://drive.google.com/drive/folders/1Oe43PELTFlfw9YkG6X-Nbtu4mzrI0-6o
2. Open `SSGC_Cash_Transfers.xlsx`
3. Click **"Open with"** → **"Google Sheets"**
4. The file will be converted automatically
5. A new Google Sheet will open with your data

#### Step 2: Make the Sheet Public
1. In the Google Sheet, click the **"Share"** button (top right)
2. Click **"Change to anyone with the link"**
3. Set permission to **"Viewer"**
4. Click **"Done"**
5. Copy the sheet URL (it's already configured in the code!)

#### Step 3: Verify It's Working
1. Make a small test change in the Google Sheet (add a test row)
2. Save (auto-saves in Google Sheets)
3. Refresh your website
4. You should see the updated data!

**✅ DONE!** Now you can edit the Google Sheet monthly, and the website will automatically show the latest data.

---

### **Option B: Keep Using Excel File**

If you prefer to keep using Excel format, follow these steps:

#### Step 1: Get Excel File Share Link
1. Go to your Google Drive folder: https://drive.google.com/drive/folders/1Oe43PELTFlfw9YkG6X-Nbtu4mzrI0-6o
2. Right-click on `SSGC_Cash_Transfers.xlsx`
3. Click **"Get link"** or **"Share"**
4. Copy the link (looks like: `https://drive.google.com/file/d/FILE_ID/view`)

#### Step 2: Extract File ID
From the link `https://drive.google.com/file/d/FILE_ID/view`, copy the `FILE_ID` part (the long string between `/d/` and `/view`)

Example: If link is `https://drive.google.com/file/d/1abc123xyz789/view`
Then File ID is: `1abc123xyz789`

#### Step 3: Update Configuration File
1. Open `src/config/driveConfig.js` in your code editor
2. Find this line: `EXCEL_FILE_ID: null,`
3. Replace `null` with your file ID in quotes:
   ```javascript
   EXCEL_FILE_ID: '1abc123xyz789',  // Your actual file ID
   ```
4. Save the file

#### Step 4: Make File Public
1. Right-click the Excel file in Google Drive
2. Click **"Share"**
3. Set to **"Anyone with the link can view"**
4. Click **"Done"**

#### Step 5: Verify It's Working
1. Make a small test change in the Excel file
2. Save and upload/replace it in Google Drive (keep same name)
3. Refresh your website
4. You should see the updated data!

**✅ DONE!** Now you can edit the Excel file monthly, upload it to Google Drive, and the website will automatically show the latest data.

---

## 📅 MONTHLY UPDATES (No Code Changes Needed!)

### If Using Google Sheets (Option A):
1. Open your Google Sheet in Google Drive
2. Edit the data (add rows, update amounts, etc.)
3. **Save** (Google Sheets auto-saves, or press Ctrl+S)
4. **Refresh your website** - Latest data appears automatically! ✨

### If Using Excel (Option B):
1. Edit `SSGC_Cash_Transfers.xlsx` on your computer
2. Save the file
3. Go to Google Drive folder
4. **Upload the updated file** (replace the old one, keep same name)
5. **Refresh your website** - Latest data appears automatically! ✨

---

## 🔧 Troubleshooting

### Data Not Updating?
1. **Check file permissions**: Make sure file is set to "Anyone with the link can view"
2. **Clear browser cache**: Press Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
3. **Check browser console**: Press F12 → Console tab → Look for error messages
4. **Verify file name**: Must be exactly `SSGC_Cash_Transfers.xlsx` (if using Excel)

### Still Not Working?
- Try Option A (Google Sheets) - it's more reliable
- Make sure the file is saved in Google Drive
- Wait a few seconds after saving before refreshing

---

## 💡 Tips

- **Google Sheets is recommended** because:
  - Auto-saves automatically
  - Easier to edit online
  - More reliable data fetching
  - No need to upload files

- **Excel is fine if you prefer** but requires:
  - Manual upload after editing
  - One-time file ID configuration

---

## ✅ Quick Checklist

- [ ] Chose Option A (Google Sheets) OR Option B (Excel)
- [ ] Completed one-time setup steps
- [ ] Made file public ("Anyone with the link can view")
- [ ] Tested with a small change
- [ ] Verified data appears on website after refresh

**You're all set!** 🎉 Now you can update data monthly without touching any code!

