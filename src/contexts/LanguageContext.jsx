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

  // Set initial language class on mount
  useEffect(() => {
    const initialLanguage = localStorage.getItem('language') || 'en';
    document.body.classList.remove('lang-en', 'lang-te');
    document.body.classList.add(`lang-${initialLanguage}`);
    document.documentElement.setAttribute('lang', initialLanguage);
  }, []);

  useEffect(() => {
    // Save language preference to localStorage
    localStorage.setItem('language', language);
    
    // Add language class to body for CSS font switching
    document.body.classList.remove('lang-en', 'lang-te');
    document.body.classList.add(`lang-${language}`);
    document.documentElement.setAttribute('lang', language);
  }, [language]);

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'en' ? 'te' : 'en');
  };

  const setLanguageTo = (lang) => {
    if (lang === 'en' || lang === 'te') {
      setLanguage(lang);
    }
  };

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, setLanguageTo }}>
      {children}
    </LanguageContext.Provider>
  );
};

