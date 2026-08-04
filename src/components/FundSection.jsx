import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { fetchSheetData } from '../utils/sheetService';
import { generatePDF } from '../utils/pdfGenerator';
import './FundSection.css';

const FundSection = () => {
  const { language } = useLanguage();
  const t = translations[language];
  const [activeTab, setActiveTab] = useState('committee-fund');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (activeTab === 'committee-fund') {
      loadData();
    }
  }, [activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const sheetData = await fetchSheetData();
      
      if (sheetData && sheetData.length > 0) {
        setData(sheetData);
        setError(null);
      } else {
        setError(t.errorLoading);
      }
    } catch (err) {
      console.error('Error loading data:', err);
      const fallbackData = [
        { Date: '5-Oct-25', Notes: 'Final Amount', 'Cash In': '9500', 'Cash Out': '', Balance: '9500' },
        { Date: '5-Nov-25', Notes: 'November Amount', 'Cash In': '3500', 'Cash Out': '', Balance: '13000' },
        { Date: '5-Dec-25', Notes: 'December Amount', 'Cash In': '3000', 'Cash Out': '', Balance: '16000' },
        { Date: '5-Jan-26', Notes: 'January Amount', 'Cash In': '3500', 'Cash Out': '', Balance: '19500' },
        { Date: '11-Jan-26', Notes: 'Bhogi Celebrations', 'Cash In': '', 'Cash Out': '2000', Balance: '17500' },
        { Date: '5-Feb-26', Notes: 'February Amount', 'Cash In': '3500', 'Cash Out': '', Balance: '21000' }
      ];
      setData(fallbackData);
      setError(t.usingSampleData);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const tableElement = document.getElementById('cash-transfers-table');
      if (tableElement) {
        await generatePDF(tableElement);
      }
    } catch (err) {
      alert('Failed to generate PDF. Please try again.');
      console.error(err);
    }
  };

  const filteredData = data.filter(row => {
    return row.Date || row.Notes || row['Cash In'] || row['Cash Out'] || row.Balance;
  });

  // Generate years for dropdown
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

  return (
    <section id="transfers" className="fund-section">
      <div className="fund-container">
        <h2 className="section-title">{t.cashTransfersTitle}</h2>
        <p className="section-subtitle">{t.cashTransfersSubtitle}</p>
        
        {/* Tabs */}
        <div className="tabs-container">
          <button
            className={`tab-button ${activeTab === 'expenses' ? 'active' : ''}`}
            onClick={() => setActiveTab('expenses')}
          >
            {t.expenses}
          </button>
          <button
            className={`tab-button ${activeTab === 'committee-fund' ? 'active' : ''}`}
            onClick={() => setActiveTab('committee-fund')}
          >
            {t.committeeFund}
          </button>
        </div>

        {/* Expenses Tab Content */}
        {activeTab === 'expenses' && (
          <div className="tab-content">
            <div className="year-selector-wrapper">
              <label htmlFor="expense-year-select" className="year-label">{t.selectYear}:</label>
              <select
                id="expense-year-select"
                className="year-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              >
                {years.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div className="empty-card">
              <p>{t.noData}</p>
            </div>
          </div>
        )}

        {/* Committee Fund Tab Content */}
        {activeTab === 'committee-fund' && (
          <div className="tab-content">
            <div className="table-wrapper">
              {loading && <div className="loading">{t.loading}</div>}
              {error && (
                <div className="error-message">
                  <p>{error}</p>
                  <button onClick={loadData} className="retry-button">{t.retry}</button>
                </div>
              )}
              
              {!loading && filteredData.length > 0 && (
                <>
                  <div className="button-container">
                    <button onClick={handleDownloadPDF} className="download-button">
                      {t.downloadPDF}
                    </button>
                  </div>
                  
                  <div className="table-scroll">
                    <table id="cash-transfers-table" className="cash-transfers-table">
                      <thead>
                        <tr>
                          <th className="col-date">{t.date}</th>
                          <th className="col-notes">{t.notes}</th>
                          <th className="col-cash-in">{t.cashIn}</th>
                          <th className="col-cash-out">{t.cashOut}</th>
                          <th className="col-balance">{t.balance}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredData.map((row, index) => (
                          <tr key={index}>
                            <td className="col-date">{row.Date || ''}</td>
                            <td className="col-notes">{row.Notes || ''}</td>
                            <td className="col-cash-in">{row['Cash In'] || ''}</td>
                            <td className="col-cash-out">{row['Cash Out'] || ''}</td>
                            <td className="col-balance">{row.Balance || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              
              {!loading && filteredData.length === 0 && !error && (
                <div className="no-data">{t.noData}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default FundSection;
