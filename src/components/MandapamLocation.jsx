import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { useSectionReady } from '../hooks/useSectionReady';
import './MandapamLocation.css';

// Phase 2 moves these to the `mandapam` sheet so the committee can edit them.
const ADDRESS_LINES = [
  'Sri Shakthi Nilayam',
  'D.No: 44-13-101, Annapurnamma Peta,',
  'Pedda Veedhi, Beside Nayi Brahmin Seva Sangam',
  'Rajamahendravaram - 533101',
];

// One source of truth for the location string — the embed, the directions link
// and the "open in maps" link all resolve from it, so they can never disagree.
const ADDRESS_QUERY = encodeURIComponent(ADDRESS_LINES.join(', '));
const MAP_EMBED = `https://www.google.com/maps?q=${ADDRESS_QUERY}&output=embed`;
const MAP_LINK = `https://www.google.com/maps/search/?api=1&query=${ADDRESS_QUERY}`;
const DIRECTIONS_LINK = `https://www.google.com/maps/dir/?api=1&destination=${ADDRESS_QUERY}`;

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
  const loading = useSectionReady();

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

            <address className="mandapam-address">
              {ADDRESS_LINES.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </address>

            <a
              className="mandapam-btn"
              href={DIRECTIONS_LINK}
              target="_blank"
              rel="noreferrer noopener"
            >
              <PinIcon />
              {t.getDirections}
            </a>
          </div>

          {/* Right — map */}
          <div className="mandapam-card mandapam-map-card">
            <iframe
              src={MAP_EMBED}
              title={t.mandapamName}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
            <a
              className="mandapam-btn mandapam-btn-overlay"
              href={MAP_LINK}
              target="_blank"
              rel="noreferrer noopener"
            >
              <PinIcon />
              {t.openInMaps}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default MandapamLocation;
