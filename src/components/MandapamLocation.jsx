import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { useSectionContent } from '../contexts/ContentContext';
import { SectionMessage } from './SectionState';
// Shared with the admin screen that edits this address, so the preview the
// committee checks and the map visitors see are built by the same rules.
import { toLines, mapEmbedFor, mapDirectionsUrl } from '../utils/mapLinks';
import './MandapamLocation.css';

const TempleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2.5l2.2 3.2h-4.4L12 2.5z" />
    <path d="M8.5 8.2h7l1.4 2.3H7.1l1.4-2.3z" />
    <path d="M6 10.5h12V21H6V10.5z" />
    <path d="M10 21v-4.2a2 2 0 1 1 4 0V21" />
    <path d="M3.5 21h17" />
  </svg>
);

const PinIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

const MandapamLocation = () => {
  const { language } = useLanguage();
  const t = translations[language];
  const { data: content, error, loading, reload } = useSectionContent('content');

  const mandapam = (content && content.mandapam) || {};
  const address = (language === 'te' ? mandapam.te : mandapam.en) || mandapam.en || '';
  const lines = toLines(address);

  // The frame takes the committee's own pin when the sheet holds one, and
  // otherwise searches this same address string.
  const mapEmbed = mapEmbedFor(address, mandapam.mapUrl);
  // Directions stay on the address either way: a route needs somewhere to
  // arrive, and an embed URL is a viewport, not a destination.
  const directionsLink = mapDirectionsUrl(address);

  if (loading) {
    return (
      <section id="location" className="mandapam-section" aria-busy="true">
        <div className="mandapam-container">
          <div className="skeleton-head">
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-subtitle" />
          </div>
          <div className="mandapam-layout">
            <div className="mandapam-card mandapam-address-card">
              <div className="mandapam-brand">
                <span className="skeleton md-skel-icon" />
                <span className="skeleton skeleton-line is-mid" />
              </div>
              <div className="mandapam-address">
                <span className="skeleton skeleton-line" />
                <span className="skeleton skeleton-line" />
                <span className="skeleton skeleton-line is-mid" />
                <span className="skeleton skeleton-line is-short" />
              </div>
              <span className="skeleton md-skel-btn" />
            </div>
            <div className="mandapam-card mandapam-map-card">
              <span className="skeleton md-skel-map" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="location" className="mandapam-section">
      <div className="mandapam-container">
        <h2 className="mandapam-title">{t.mandapamLocation}</h2>
        <p className="mandapam-subtitle">{t.mandapamSubtitle}</p>

        <div className="mandapam-layout">
          {/* Left — address */}
          <div className="mandapam-card mandapam-address-card">
            <div className="mandapam-brand">
              <span className="mandapam-brand-icon"><TempleIcon /></span>
              <h3 className="mandapam-brand-name">{t.mandapamName}</h3>
            </div>

            {lines.length ? (
              <address className="mandapam-address">
                {lines.map((line, i) => (
                  <span key={`${line}-${i}`}>{line}</span>
                ))}
              </address>
            ) : (
              <SectionMessage
                tone={error ? 'error' : 'empty'}
                onRetry={error ? reload : undefined}
              />
            )}

            <a
              className="mandapam-btn"
              href={directionsLink}
              target="_blank"
              rel="noreferrer noopener"
            >
              <PinIcon />
              {t.getDirections}
            </a>
          </div>

          {/* Right — map. Nothing laid over it: Google puts its own control in
              the corner, and a second button of ours on the same frame was two
              ways to do the one thing Get Directions already does better. */}
          <div className="mandapam-card mandapam-map-card">
            <iframe
              src={mapEmbed}
              title={t.mandapamName}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default MandapamLocation;
