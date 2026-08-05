import React, { createContext, useContext, useState, useEffect } from 'react';

const LanguageContext = createContext();

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => {
    // Get saved language from localStorage or default to 'en'
    return localStorage.getItem('language') || 'en';
  });

  useEffect(() => {
    // Save language preference to localStorage
    localStorage.setItem('language', language);
    
    // Add language class to body for CSS font switching
    document.body.classList.remove('lang-en', 'lang-te');
    document.body.classList.add(`lang-${language}`);
    document.documentElement.setAttribute('lang', language);
  }, [language]);

  const setLanguageTo = (lang) => {
    if (lang === 'en' || lang === 'te') {
      setLanguage(lang);
    }
  };

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === 'en' ? 'te' : 'en'));
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguageTo, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

