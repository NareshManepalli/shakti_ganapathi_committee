import axios from 'axios';
import * as XLSX from 'xlsx';
import { DRIVE_CONFIG } from '../config/driveConfig';

// Convert Google Drive folder/file URL to direct download URL
const getDriveFileDownloadURL = (fileId) => {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
};

// Parse Excel file
const parseExcelFile = (excelData) => {
  try {
    const workbook = XLSX.read(excelData, { type: 'array' });
    
    // Get the first sheet
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    
    return jsonData;
  } catch (error) {
    console.error('Error parsing Excel file:', error);
    throw error;
  }
};

// Parse CSV data - handles quoted fields with commas
const parseCSV = (csvText) => {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  
  // Parse CSV line handling quoted fields
  const parseCSVLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };
  
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ''));
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]).map(v => v.replace(/^"|"$/g, ''));
    if (values.some(v => v !== '')) { // Only add rows with at least one value
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      data.push(row);
    }
  }
  
  return data;
};

// Fallback data based on the image provided
const getFallbackData = () => {
  return [
    { Date: '5-Oct-25', Notes: 'Final Amount', 'Cash In': '9500', 'Cash Out': '', Balance: '9500' },
  ];
};

// Fetch Excel file from Google Drive via Google Apps Script
const fetchExcelViaAppsScript = async (scriptUrl) => {
  try {
    console.log('Fetching Excel file via Google Apps Script:', scriptUrl);
    
    const response = await axios.get(scriptUrl, {
      responseType: 'text',
      timeout: 20000,
      withCredentials: false
    });
    
    if (response.data) {
      // Decode base64 data
      const base64Data = response.data.trim();
      
      // Handle JSON response (if script returns JSON)
      try {
        const jsonResponse = JSON.parse(base64Data);
        if (jsonResponse.error) {
          console.warn('Google Apps Script error:', jsonResponse.message);
          return null;
        }
        if (jsonResponse.data) {
          // Use the data field if it's a JSON response
          const binaryString = atob(jsonResponse.data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const data = parseExcelFile(bytes.buffer);
          if (data && data.length > 0) {
            console.log('Successfully fetched Excel file via Google Apps Script');
            return data;
          }
        }
      } catch (e) {
        // Not JSON, treat as direct base64
      }
      
      // Direct base64 string
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const data = parseExcelFile(bytes.buffer);
      if (data && data.length > 0) {
        console.log('Successfully fetched Excel file via Google Apps Script');
        return data;
      }
    }
  } catch (error) {
    console.warn('Failed to fetch via Google Apps Script:', error.message);
    if (error.response) {
      console.warn('Response status:', error.response.status);
      console.warn('Response data:', error.response.data);
    }
  }
  return null;
};

// Fetch Excel file from Google Drive
const fetchExcelFromDrive = async (fileId) => {
  try {
    const downloadUrl = getDriveFileDownloadURL(fileId);
    console.log('Fetching Excel file from:', downloadUrl);
    
    const response = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      withCredentials: false
    });
    
    if (response.data) {
      const data = parseExcelFile(response.data);
      if (data && data.length > 0) {
        console.log('Successfully fetched and parsed Excel file');
        return data;
      }
    }
  } catch (error) {
    console.warn('Failed to fetch Excel file:', error.message);
    // If direct download fails, try with confirm parameter
    try {
      const downloadUrlWithConfirm = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
      const response = await axios.get(downloadUrlWithConfirm, {
        responseType: 'arraybuffer',
        timeout: 15000,
        withCredentials: false
      });
      
      if (response.data) {
        const data = parseExcelFile(response.data);
        if (data && data.length > 0) {
          console.log('Successfully fetched Excel file with confirm parameter');
          return data;
        }
      }
    } catch (retryError) {
      console.warn('Retry with confirm parameter also failed:', retryError.message);
    }
  }
  return null;
};

// Convert Google Sheets sharing URL to CSV export URL
const getCSVExportURL = (sheetUrl) => {
  const sheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!sheetIdMatch) {
    throw new Error('Invalid Google Sheets URL');
  }
  const sheetId = sheetIdMatch[1];
  
  // Extract gid (sheet tab ID) from URL if present
  // Look for gid=XXXXX or #gid=XXXXX
  const gidMatch = sheetUrl.match(/[#&?]gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : '0'; // Default to 0 if not found
  
  return {
    primary: `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`,
    alternative: `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`
  };
};

// Main function to fetch data - tries multiple methods
export const fetchSheetData = async (sheetUrl = null) => {
  // Method 1: Try Google Apps Script (for Excel files in folder - automatic!)
  if (DRIVE_CONFIG.GOOGLE_APPS_SCRIPT_URL) {
    console.log('Attempting to fetch Excel file via Google Apps Script...');
    const excelData = await fetchExcelViaAppsScript(DRIVE_CONFIG.GOOGLE_APPS_SCRIPT_URL);
    if (excelData && excelData.length > 0) {
      return excelData;
    }
  }
  
  // Method 2: Try direct Excel file ID
  if (DRIVE_CONFIG.EXCEL_FILE_ID) {
    console.log('Attempting to fetch Excel file from Google Drive...');
    const excelData = await fetchExcelFromDrive(DRIVE_CONFIG.EXCEL_FILE_ID);
    if (excelData && excelData.length > 0) {
      return excelData;
    }
  }
  
  // Method 3: Try Google Sheets URL (RECOMMENDED - Easiest!)
  const sheetsUrl = sheetUrl || DRIVE_CONFIG.SHEETS_URL;
  if (sheetsUrl) {
    const sheetIdMatch = sheetsUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (sheetIdMatch) {
      const urls = getCSVExportURL(sheetsUrl);
      
      // Try primary CSV URL
      try {
        console.log('Trying Google Sheets CSV URL:', urls.primary);
        const response = await axios.get(urls.primary, {
          headers: { 'Accept': 'text/csv' },
          timeout: 10000,
          withCredentials: false
        });
        
        if (response.data && response.data.trim()) {
          const data = parseCSV(response.data);
          if (data.length > 0) {
            console.log('Successfully fetched data from Google Sheets');
            return data;
          }
        }
      } catch (error) {
        console.warn('Google Sheets CSV failed:', error.message);
      }
      
      // Try alternative CSV URL
      try {
        const response = await axios.get(urls.alternative, {
          headers: { 'Accept': 'text/csv' },
          timeout: 10000,
          withCredentials: false
        });
        
        if (response.data && response.data.trim()) {
          const data = parseCSV(response.data);
          if (data.length > 0) {
            console.log('Successfully fetched data from alternative CSV URL');
            return data;
          }
        }
      } catch (error) {
        console.warn('Alternative CSV URL failed:', error.message);
      }
    }
  }
  
  // Fallback: return sample data
  console.warn('Could not fetch data automatically. Using fallback data.');
  console.warn('See SETUP_INSTRUCTIONS.md for setup guide');
  
  return getFallbackData();
};

// New function to fetch from Drive folder (requires file ID)
export const fetchDataFromDriveFolder = async (fileId = null) => {
  // If file ID is provided, try to fetch Excel file
  if (fileId) {
    const excelData = await fetchExcelFromDrive(fileId);
    if (excelData) {
      return excelData;
    }
  }
  
  // Try to get file ID from folder (this requires Google Drive API)
  // For now, we'll use a workaround: user needs to provide file ID
  
  // Fallback: try to fetch using the folder URL pattern
  // This won't work directly, but we can guide the user
  
  console.warn('File ID not provided. Please get the file ID from the Excel file share link.');
  return getFallbackData();
};

