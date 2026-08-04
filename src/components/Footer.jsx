import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import './Footer.css';

const Footer = () => {
  const { language } = useLanguage();
  const t = translations[language];

  return (
    <footer className="footer-section">
      <div className="footer-container">
        <div className="footer-content">
          <div className="footer-logo">
            <div className="footer-emblem">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="32" fill="#ffd700" fontFamily="Arial">ॐ</text>
              </svg>
            </div>
            <h3 className="footer-name">{t.footerText}</h3>
          </div>
          <div className="footer-text">
            <p>&copy; {new Date().getFullYear()} {t.footerText}. {t.allRightsReserved}.</p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;


