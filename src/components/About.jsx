import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { useSectionReady } from '../hooks/useSectionReady';
import './About.css';

// Drop a file at public/assets/about-image.jpg and it appears here.
// Until then the framed placeholder below stands in its place.
// Phase 2 replaces this with the image field from the `about` sheet.
const ABOUT_IMAGE = '/assets/about-image.jpg';

const About = () => {
  const { language } = useLanguage();
  const t = translations[language];
  const [imageFailed, setImageFailed] = useState(false);
  const loading = useSectionReady();

  if (loading) {
    return (
      <section id="about" className="about-section" aria-busy="true">
        <div className="about-layout">
          <div className="about-head">
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-subtitle" />
          </div>
          <div className="about-media">
            <span className="skeleton about-skel-media" />
          </div>
          <div className="about-skel-text">
            <span className="skeleton skeleton-line" />
            <span className="skeleton skeleton-line" />
            <span className="skeleton skeleton-line" />
            <span className="skeleton skeleton-line is-short" />
          </div>
        </div>
      </section>
    );
  }

  // Head / media / text are siblings rather than nested, so the grid can
  // reorder them per breakpoint: image-left on desktop, but head → image →
  // text stacked on small screens.
  return (
    <section id="about" className="about-section">
      <div className="about-layout">
        <header className="about-head">
          <h2 className="about-title">{t.aboutTitle}</h2>
          <p className="about-subtitle">{t.aboutSubtitle}</p>
        </header>

        <div className="about-media">
          {imageFailed ? (
            <div className="about-media-placeholder" role="img" aria-label={t.aboutTitle}>
              <span className="plus-icon" aria-hidden="true">+</span>
            </div>
          ) : (
            <img
              src={ABOUT_IMAGE}
              alt={t.aboutTitle}
              onError={() => setImageFailed(true)}
            />
          )}
        </div>

        <p className="about-text">{t.aboutContent}</p>
      </div>
    </section>
  );
};

export default About;
