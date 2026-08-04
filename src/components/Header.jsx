import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import './Header.css';

const Header = () => {
  const { language, setLanguageTo } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const t = translations[language];

  const closeMenu = () => {
    setMobileMenuOpen(false);
  };

  // Handle smooth scroll with offset for menu links
  const handleNavClick = (e, targetId) => {
    e.preventDefault();
    closeMenu();
    const element = document.querySelector(targetId);
    if (element) {
      const headerHeight = 70;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerHeight;
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [mobileMenuOpen]);

  return (
    <>
      <header className="main-header">
        <div className="header-content">
          <div className="header-logo">
            <div className="golden-emblem">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="20" fill="#9c27b0" fontFamily="Arial">ॐ</text>
              </svg>
            </div>
          </div>
          <div className="header-right">
            <div className="language-toggle">
              <button 
                className={`lang-btn ${language === 'en' ? 'active' : ''}`}
                onClick={() => setLanguageTo('en')}
                aria-label="Switch to English"
              >
                EN
              </button>
              <button 
                className={`lang-btn ${language === 'te' ? 'active' : ''}`}
                onClick={() => setLanguageTo('te')}
                aria-label="Switch to Telugu"
              >
                తె
              </button>
            </div>
            <button 
              className="mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Toggle menu"
            >
              <span></span>
              <span></span>
              <span></span>
            </button>
            <nav className="header-nav desktop-nav">
              <a href="#home" onClick={(e) => handleNavClick(e, '#home')}>{t.home}</a>
              <a href="#about" onClick={(e) => handleNavClick(e, '#about')}>{t.aboutUs}</a>
              <a href="#committee" onClick={(e) => handleNavClick(e, '#committee')}>{t.committee}</a>
              <a href="#gallery" onClick={(e) => handleNavClick(e, '#gallery')}>{t.photoGallery}</a>
              <a href="#transfers" onClick={(e) => handleNavClick(e, '#transfers')}>{t.committeeFund}</a>
              <a href="#location" onClick={(e) => handleNavClick(e, '#location')}>{t.mandapamLocation}</a>
            </nav>
          </div>
        </div>
      </header>

      {/* Mobile Menu Modal */}
      {mobileMenuOpen && (
        <div className="mobile-menu-modal" onClick={closeMenu}>
          <div className="mobile-menu-content" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-menu-header">
              <h3>{t.committeeName}</h3>
              <button className="close-menu-btn" onClick={closeMenu} aria-label="Close menu">
                ×
              </button>
            </div>
            <nav className="mobile-menu-nav">
              <a href="#home" onClick={(e) => handleNavClick(e, '#home')}>{t.home}</a>
              <a href="#about" onClick={(e) => handleNavClick(e, '#about')}>{t.aboutUs}</a>
              <a href="#committee" onClick={(e) => handleNavClick(e, '#committee')}>{t.committee}</a>
              <a href="#gallery" onClick={(e) => handleNavClick(e, '#gallery')}>{t.photoGallery}</a>
              <a href="#transfers" onClick={(e) => handleNavClick(e, '#transfers')}>{t.committeeFund}</a>
              <a href="#location" onClick={(e) => handleNavClick(e, '#location')}>{t.mandapamLocation}</a>
            </nav>
          </div>
        </div>
      )}
    </>
  );
};

export default Header;
