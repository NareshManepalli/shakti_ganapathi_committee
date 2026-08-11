import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { useSectionContent } from '../contexts/ContentContext';
import { SectionMessage } from './SectionState';
import './About.css';

const About = () => {
  const { language } = useLanguage();
  const t = translations[language];
  const [imageFailed, setImageFailed] = useState(false);
  const { data: content, error, loading, reload } = useSectionContent('content');

  const about = (content && content.about) || {};
  // The sheet is the only source for this text — there is no built-in copy to
  // fall back on, so an unreachable sheet leaves the paragraph out rather than
  // showing something the committee never wrote.
  const body = (language === 'te' ? about.te : about.en) || '';
  const image = about.image || '';
  const showImage = image && !imageFailed;

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

        {/* The placeholder means "no image in the sheet". When the sheet could
            not be read at all it says nothing true, so it is left out. */}
        {!(error && !image) && (
        <div className="about-media">
          {showImage ? (
            <img
              src={image}
              alt={t.aboutTitle}
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
            />
          ) : (
            /* No image in the sheet, or it failed to load */
            <div className="about-media-placeholder" role="img" aria-label={t.aboutTitle}>
              <span className="plus-icon" aria-hidden="true">+</span>
            </div>
          )}
        </div>
        )}

        {/* The sheet is the only source for this paragraph, so an unreadable
            one says so rather than leaving a heading over an empty box. */}
        {body
          ? <p className="about-text">{body}</p>
          : <SectionMessage tone={error ? 'error' : 'empty'} onRetry={error ? reload : undefined} />}
      </div>
    </section>
  );
};

export default About;
