import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import './About.css';

const About = () => {
  const { language } = useLanguage();
  const t = translations[language];

  return (
    <section id="about" className="about-section">
      <div className="about-container">
        <h2 className="about-title">{t.aboutTitle}</h2>
        <p className="about-subtitle">{t.aboutSubtitle}</p>
        <div className="about-content">
          <div className="about-image-wrapper">
            <img 
              src="/assets/about-image.jpg" 
              alt="About Us" 
              className="about-image"
              onError={(e) => {
                e.target.style.display = 'none';
                const placeholder = e.target.nextElementSibling;
                if (placeholder) {
                  placeholder.style.display = 'flex';
                }
              }}
            />
            <div className="about-image-placeholder">
              <div className="placeholder-icon">🕉️</div>
            </div>
          </div>
          <div className="about-content-wrapper">
            <div className="about-text">
              <p>{t.aboutContent}</p>
              <p>{t.aboutContent}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;

