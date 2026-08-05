import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import './Footer.css';

const Footer = () => {
  const { language } = useLanguage();
  const t = translations[language];

  return (
    <footer className="site-footer">
      <div className="footer-content">
        <p className="footer-shloka">{`|| ${t.footerShloka} ||`}</p>
        <p className="footer-copyright">
          &copy; {new Date().getFullYear()} {t.footerText}. {t.allRightsReserved}.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
