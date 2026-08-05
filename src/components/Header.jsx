import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import logoImg from '../assets/logo.jpeg';
import './Header.css';

// Section ids in page order — drives both the nav links and the scroll-spy.
const MENU_ITEMS = [
  {
    key: 'home',
    target: '#home',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
        <path d="M9.5 21v-6h5v6" />
      </svg>
    ),
  },
  {
    key: 'aboutUs',
    target: '#about',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5" />
        <path d="M12 7.5h.01" />
      </svg>
    ),
  },
  {
    key: 'committee',
    target: '#committee',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8.5" r="3" />
        <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
        <circle cx="17" cy="9.5" r="2.4" />
        <path d="M15 14.4c2.6-.5 5.5 1.1 5.5 4.1" />
      </svg>
    ),
  },
  {
    key: 'gallery',
    target: '#gallery',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="M4 17l4.5-4.5 4 4 3-3 4.5 4.5" />
      </svg>
    ),
  },
  {
    key: 'mandapam',
    target: '#location',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    ),
  },
];

const Header = () => {
  const { language, toggleLanguage } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('home');
  const t = translations[language];

  const closeMenu = () => setMobileMenuOpen(false);

  const handleNavClick = (e, targetId) => {
    e.preventDefault();
    closeMenu();
    const element = document.querySelector(targetId);
    if (!element) return;
    // Land the section flush under the sticky header, using its real height
    // rather than a hardcoded number that drifts across breakpoints.
    const headerEl = document.querySelector('.main-header');
    const headerHeight = headerEl ? headerEl.offsetHeight : 72;
    const offsetPosition =
      element.getBoundingClientRect().top + window.pageYOffset - headerHeight;
    window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
  };

  // Lock the page behind the drawer.
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : 'unset';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [mobileMenuOpen]);

  // Close the drawer if the viewport grows past the mobile breakpoint.
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 968) setMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close on Escape.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileMenuOpen]);

  // Scroll-spy — highlight the section currently under the header.
  useEffect(() => {
    const handleScroll = () => {
      const offset = 90;
      let current = MENU_ITEMS[0].target.slice(1);
      for (const item of MENU_ITEMS) {
        const el = document.getElementById(item.target.slice(1));
        if (el && el.getBoundingClientRect().top - offset <= 0) {
          current = item.target.slice(1);
        }
      }
      setActiveSection(current);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <header className="main-header">
        <div className="header-content">
          <a
            href="#home"
            className="header-brand"
            onClick={(e) => handleNavClick(e, '#home')}
          >
            <span className="brand-emblem">
              <img src={logoImg} alt="" />
            </span>
            <span className="brand-wordmark">
              <span className="brand-line-1">{t.brandLine1}</span>
              <span className="brand-line-2">{t.brandLine2}</span>
            </span>
          </a>

          <nav className="header-nav desktop-nav">
            {MENU_ITEMS.map((item) => (
              <a
                key={item.key}
                href={item.target}
                className={item.target.slice(1) === activeSection ? 'active' : ''}
                onClick={(e) => handleNavClick(e, item.target)}
              >
                {t[item.key]}
              </a>
            ))}
          </nav>

          <div className="header-right">
            <button
              className={`lang-switch ${language}`}
              onClick={toggleLanguage}
              aria-label={language === 'en' ? 'Switch to Telugu' : 'Switch to English'}
            >
              <span className="lang-switch-label">{language === 'en' ? 'EN' : 'తె'}</span>
              <span className="lang-switch-knob">
                <img src={logoImg} alt="" />
              </span>
            </button>

            <button
              className="mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={mobileMenuOpen}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile side drawer */}
      {mobileMenuOpen && (
        <div className="mobile-drawer-overlay" onClick={closeMenu}>
          <aside
            className="mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t.committeeName}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="mobile-drawer-watermark" aria-hidden="true">ॐ</span>

            <div className="mobile-drawer-header">
              <div className="mobile-drawer-profile">
                <div className="mobile-drawer-avatar">
                  <img src={logoImg} alt="" />
                </div>
                <span className="mobile-drawer-name">{t.committeeName}</span>
              </div>
              <button className="close-menu-btn" onClick={closeMenu} aria-label="Close menu">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <nav className="mobile-drawer-nav">
              {MENU_ITEMS.map((item, index) => (
                <a
                  key={item.key}
                  href={item.target}
                  className={`mobile-drawer-item${
                    item.target.slice(1) === activeSection ? ' active' : ''
                  }`}
                  style={{ '--drawer-item-delay': `${(0.08 + index * 0.05).toFixed(2)}s` }}
                  onClick={(e) => handleNavClick(e, item.target)}
                >
                  <span className="mobile-drawer-item-icon">{item.icon}</span>
                  <span className="mobile-drawer-item-label">{t[item.key]}</span>
                </a>
              ))}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
};

export default Header;
