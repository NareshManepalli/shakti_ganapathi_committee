import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { FESTIVAL_START, GALLERY_START_YEAR } from '../config/festival';
import { useSectionReady } from '../hooks/useSectionReady';
import './Gallery.css';

// Same split as the Peetam gallery: two scrolling rows on large screens,
// three on anything narrower.
const getRowCount = () =>
  (typeof window === 'undefined' ? 2 : window.innerWidth >= 1025 ? 2 : 3);

// PLACEHOLDER photos until Phase 4 reads the real media from Drive.
// Keyed by year so swapping in the Drive response is a drop-in change.
const PLACEHOLDER_BY_YEAR = {
  2025: 12,
};

const imagesForYear = (year) => {
  const count = PLACEHOLDER_BY_YEAR[year] || 0;
  return Array.from({ length: count }, (_, i) => ({
    id: `${year}-${i + 1}`,
    year,
    url: `https://picsum.photos/480/320?random=${year}${i + 1}`,
  }));
};

// The newest year that actually has photos. Until this year's festival
// pictures are uploaded the gallery opens on the previous year, so visitors
// land on real photos rather than an empty state. The moment the current
// year has any, it becomes the default on its own.
const latestYearWithPhotos = (currentYear) => {
  for (let y = currentYear; y >= GALLERY_START_YEAR; y -= 1) {
    if (imagesForYear(y).length > 0) return y;
  }
  return currentYear;
};

const Gallery = () => {
  const { language } = useLanguage();
  const t = translations[language];

  const currentYear = new Date().getFullYear();

  // 2025 → current year, newest first. Grows on its own each January.
  const years = useMemo(() => {
    const list = [];
    for (let y = currentYear; y >= GALLERY_START_YEAR; y -= 1) list.push(y);
    return list;
  }, [currentYear]);

  const [selectedYear, setSelectedYear] = useState(() =>
    latestYearWithPhotos(currentYear)
  );
  const [rowCount, setRowCount] = useState(getRowCount);
  const [selectedImage, setSelectedImage] = useState(null);
  const loading = useSectionReady();

  useEffect(() => {
    const onResize = () => setRowCount(getRowCount());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const images = useMemo(() => imagesForYear(selectedYear), [selectedYear]);

  // The current year has nothing to show until the festival actually starts.
  const notBegunYet =
    selectedYear === currentYear && Date.now() < FESTIVAL_START.getTime();

  // Spread the photos evenly across the rows, each row scrolling on its own.
  const perRow = Math.max(1, Math.ceil(images.length / rowCount));
  const rows = Array.from({ length: rowCount }, (_, r) =>
    images
      .slice(r * perRow, (r + 1) * perRow)
      .map((img, i) => ({ ...img, index: r * perRow + i }))
  ).filter((row) => row.length > 0);

  // Alternate where each row starts: even rows (1st, 3rd) sit at their left
  // edge so they read left-to-right, odd rows (2nd) start scrolled fully right
  // so they read right-to-left. Same staggered effect as the Peetam gallery.
  const rowRefs = useRef([]);

  const applyRowOffsets = useCallback(() => {
    rowRefs.current.forEach((el, r) => {
      if (!el) return;
      el.scrollLeft = r % 2 === 1 ? el.scrollWidth - el.clientWidth : 0;
    });
  }, []);

  useLayoutEffect(() => {
    applyRowOffsets();
  }, [applyRowOffsets, rowCount, images]);

  useEffect(() => {
    window.addEventListener('resize', applyRowOffsets);
    return () => window.removeEventListener('resize', applyRowOffsets);
  }, [applyRowOffsets]);

  useEffect(() => setSelectedImage(null), [selectedYear]);

  // Lock the page behind the lightbox.
  useEffect(() => {
    document.body.style.overflow = selectedImage ? 'hidden' : 'unset';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedImage]);

  const navigate = (dir) => {
    if (!selectedImage) return;
    const i = images.findIndex((im) => im.id === selectedImage.id);
    const next = dir === 'next'
      ? (i + 1) % images.length
      : (i - 1 + images.length) % images.length;
    setSelectedImage({ ...images[next], index: next });
  };

  // Escape / arrow keys in the lightbox.
  useEffect(() => {
    if (!selectedImage) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setSelectedImage(null);
      else if (e.key === 'ArrowRight') navigate('next');
      else if (e.key === 'ArrowLeft') navigate('prev');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (loading) {
    return (
      <section id="gallery" className="gallery-section" aria-busy="true">
        <div className="gallery-container">
          <div className="skeleton-head">
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-subtitle" />
          </div>
          <div className="gallery-year">
            <span className="skeleton gal-skel-year" />
          </div>
          <div className="gallery-rows">
            {Array.from({ length: rowCount }, (_, r) => (
              <div className="gallery-row" key={r}>
                {Array.from({ length: 6 }, (_, i) => (
                  <span className="skeleton gallery-item" key={i} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section id="gallery" className="gallery-section">
        <div className="gallery-container">
          <h2 className="gallery-title">{t.galleryTitle}</h2>
          <p className="gallery-subtitle">{t.gallerySubtitle}</p>

          <div className="gallery-year">
            <label className="gallery-year-label" htmlFor="gallery-year-select">
              {t.selectYear}:
            </label>
            <select
              id="gallery-year-select"
              className="gallery-year-select"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {notBegunYet ? (
            <div className="gallery-notice">
              <span className="gallery-notice-emoji" aria-hidden="true">🪔</span>
              <p className="gallery-notice-title">{t.celebrationsNotBegun}</p>
              <p className="gallery-notice-hint">{t.celebrationsNotBegunHint}</p>
            </div>
          ) : images.length === 0 ? (
            <p className="gallery-empty">{t.noImagesAvailable}</p>
          ) : (
            <div className="gallery-rows">
              {rows.map((row, r) => (
                <div
                  className="gallery-row"
                  key={r}
                  ref={(el) => { rowRefs.current[r] = el; }}
                >
                  {row.map((img) => (
                    <button
                      type="button"
                      className="gallery-item"
                      key={img.id}
                      onClick={() => setSelectedImage(img)}
                      aria-label={`${t.galleryTitle} ${img.index + 1}`}
                    >
                      <img src={img.url} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {selectedImage && (
        <div
          className="gallery-lightbox"
          onClick={() => setSelectedImage(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            className="gallery-lb-btn gallery-lb-close"
            onClick={() => setSelectedImage(null)}
            aria-label="Close"
          >
            ×
          </button>
          <button
            className="gallery-lb-btn gallery-lb-prev"
            onClick={(e) => { e.stopPropagation(); navigate('prev'); }}
            aria-label="Previous"
          >
            ‹
          </button>
          <figure className="gallery-lb-figure" onClick={(e) => e.stopPropagation()}>
            <img src={selectedImage.url} alt="" />
            <figcaption className="gallery-lb-count">
              {images.findIndex((im) => im.id === selectedImage.id) + 1} / {images.length}
            </figcaption>
          </figure>
          <button
            className="gallery-lb-btn gallery-lb-next"
            onClick={(e) => { e.stopPropagation(); navigate('next'); }}
            aria-label="Next"
          >
            ›
          </button>
        </div>
      )}
    </>
  );
};

export default Gallery;
