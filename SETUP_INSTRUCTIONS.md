# Step-by-Step Setup Instructions

## 🎯 Goal: Edit Excel file → Save → Refresh website → See latest data (NO CODE CHANGES!)

You have **TWO OPTIONS**. Choose the one that works best for you:

---

## ✅ OPTION 1: Use Google Sheets (RECOMMENDED - Easiest!)

**This is the SIMPLEST option and requires NO setup!**

### Step 1: Convert Excel to Google Sheets
1. Open your Excel file (`SSGC_Cash_Transfers.xlsx`) in Google Drive
2. Right-click on the file
3. Click **"Open with"** → **"Google Sheets"**
4. Google will automatically convert it to Sheets format
5. The file will now be a Google Sheet (you can delete the Excel file if you want)

### Step 2: Make it Public
1. Click the **"Share"** button (top right)
2. Click **"Change to anyone with the link"**
3. Set permission to **"Viewer"**
4. Click **"Done"**

### Step 3: That's It! ✅
- The Google Sheets URL is **already configured** in the code
- **Just edit the sheet, save it, and refresh your website**
- The website will automatically fetch the latest data!

### Monthly Updates:
1. Open the Google Sheet
2. Edit your data
3. Save (auto-saves in Google Sheets)
4. Refresh your website
5. Done! ✨

---

## 📋 OPTION 2: Keep Using Excel File (Requires Google Apps Script Setup)

If you prefer to keep using Excel format, follow these steps:

### Step 1: Create Google Apps Script

1. **Go to Google Apps Script:**
   - Visit: https://script.google.com
   - Sign in with your Google account

2. **Create New Project:**
   - Click **"New Project"** (or the "+" icon)

3. **Copy the Script Code:**
   - Open the file `GOOGLE_APPS_SCRIPT.js` in your project folder
   - Copy **ALL** the code from that file
   - Paste it into the Google Apps Script editor

4. **Update Configuration:**
   - In the script, find these lines:
     ```javascript
     const FOLDER_ID = '1Oe43PELTFlfw9YkG6X-Nbtu4mzrI0-6o';
     const FILE_NAME = 'SSGC_Cash_Transfers.xlsx';
     ```
   - The FOLDER_ID is already correct (your folder)
   - The FILE_NAME is already correct
   - **No changes needed!**

5. **Save the Script:**
   - Click **"Save"** (or press Ctrl+S)
   - Give it a name like "SSGC File Fetcher"

### Step 2: Deploy as Web App

1. **Deploy the Script:**
   - Click **"Deploy"** → **"New deployment"**
   - Click the gear icon ⚙️ next to "Select type"
   - Choose **"Web app"**

2. **Configure Deployment:**
   - **Description:** "SSGC Cash Transfers File Fetcher" (or any name)
   - **Execute as:** Select **"Me"** (your email)
   - **Who has access:** Select **"Anyone"** (important!)
   - Click **"Deploy"**

3. **Authorize Access:**
   - Click **"Authorize access"**
   - Choose your Google account
   - Click **"Advanced"** → **"Go to [Project Name] (unsafe)"**
   - Click **"Allow"**

4. **Copy the Web App URL:**
   - After deployment, you'll see a **"Web App URL"**
   - It looks like: `https://script.google.com/macros/s/AKfycby.../exec`
   - **Copy this URL** (you'll need it in the next step)

### Step 3: Update Website Configuration

1. **Open the config file:**
   - Navigate to: `src/config/driveConfig.js`

2. **Paste the Web App URL:**
   - Find this line:
     ```javascript
     GOOGLE_APPS_SCRIPT_URL: null,
     ```
   - Replace `null` with your Web App URL in quotes:
     ```javascript
     GOOGLE_APPS_SCRIPT_URL: 'https://script.google.com/macros/s/YOUR_URL_HERE/exec',
     ```
   - Save the file

3. **Restart your development server:**
   - Stop the server (Ctrl+C)
   - Run `npm run dev` again

### Step 4: Test It!

1. **Edit your Excel file** in Google Drive
2. **Save it** with the same name (`SSGC_Cash_Transfers.xlsx`)
3. **Refresh your website**
4. **Check the table** - it should show the latest data! ✨

### Monthly Updates:
1. Open Excel file in Google Drive
2. Edit your data
3. Save with the same name
4. Refresh your website
5. Done! ✨

---

## 🔧 Troubleshooting

### If data doesn't update:

1. **Check browser console:**
   - Press F12 → Go to "Console" tab
   - Look for error messages

2. **For Google Sheets:**
   - Make sure the sheet is set to "Anyone with the link can view"
   - Check that the URL in `driveConfig.js` matches your sheet

3. **For Excel via Apps Script:**
   - Make sure the Web App is deployed with "Anyone" access
   - Verify the file name matches exactly: `SSGC_Cash_Transfers.xlsx`
   - Check that the folder ID is correct

4. **Clear browser cache:**
   - Press Ctrl+Shift+R (hard refresh)
   - Or clear browser cache

---

## 📝 Summary

**Option 1 (Google Sheets):**
- ✅ Easiest setup
- ✅ Already configured
- ✅ Just convert Excel → Sheets
- ✅ Edit → Save → Refresh → Done!

**Option 2 (Excel via Apps Script):**
- ⚙️ Requires one-time setup
- ✅ Keep using Excel format
- ✅ Edit → Save → Refresh → Done!

**Both options work without code changes after initial setup!**

---

## 🆘 Need Help?

If you encounter any issues:
1. Check the browser console for errors
2. Verify file permissions (must be public)
3. Make sure the file name matches exactly
4. Try hard refresh (Ctrl+Shift+R)

