import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { GALLERY_START_YEAR, getFestivalState } from '../config/festival';
import { useSectionContent } from '../contexts/ContentContext';
import { useDialogFocus } from './useDialogFocus';
import { SHEETS_CONFIG } from '../config/sheetsConfig';
import { fetchGalleryTree, driveDownloadUrl } from '../utils/sheetService';
import { useRevalidate } from '../hooks/useRevalidate';
import './Gallery.css';

// Same split as the Peetam gallery: two scrolling rows on large screens,
// three on anything narrower.
const getRowCount = () =>
  (typeof window === 'undefined' ? 2 : window.innerWidth >= 1025 ? 2 : 3);

// The Drive gallery Web App, or null while it is still being set up.
const GALLERY_API = (SHEETS_CONFIG.media && SHEETS_CONFIG.media.gallery) || null;

const IconDownload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12" />
    <path d="M7 11l5 5 5-5" />
    <path d="M5 21h14" />
  </svg>
);

const Gallery = () => {
  const { language } = useLanguage();
  const t = translations[language];

  const currentYear = new Date().getFullYear();

  // 2025 → current year, newest first; grows on its own each January. Any year
  // folder Drive reports outside that span is merged in, so a 2024 folder is
  // still selectable rather than leaving the dropdown showing a blank value.
  const [tree, setTree] = useState(null);
  const years = useMemo(() => {
    const set = new Set();
    for (let y = currentYear; y >= GALLERY_START_YEAR; y -= 1) set.add(y);
    if (tree) tree.years.forEach((y) => { const n = Number(y); if (n) set.add(n); });
    return [...set].sort((a, b) => b - a);
  }, [currentYear, tree]);

  const [selectedYear, setSelectedYear] = useState(currentYear);
  // Set once the visitor picks a year themselves, so photos arriving from Drive
  // never yank them off the year they are looking at.
  const [yearPicked, setYearPicked] = useState(false);
  const [rowCount, setRowCount] = useState(getRowCount);
  const [selectedImage, setSelectedImage] = useState(null);
  const lightboxRef = useRef(null);
  // The picture and its controls only; Tab must not walk the page behind it.
  useDialogFocus(lightboxRef, Boolean(selectedImage));
  const { data: content, loading: contentLoading } = useSectionContent('content');
  const festivalState = getFestivalState(
    (content && content.festival && content.festival.en) || ''
  );

  // Photos live in Drive, read through the gallery Web App. Until it is
  // deployed GALLERY_API is null and every year shows its empty state.
  const [galleryLoading, setGalleryLoading] = useState(Boolean(GALLERY_API));
  const loading = contentLoading || galleryLoading;

  const loadGallery = useCallback(() => fetchGalleryTree(GALLERY_API).then((data) => {
    // null means the call failed — keep whatever is on screen rather than
    // replacing it with an error the committee can do nothing about.
    if (data) {
      setTree((cur) => (JSON.stringify(cur) === JSON.stringify(data) ? cur : data));
    }
    setGalleryLoading(false);
  }), []);

  useEffect(() => {
    if (!GALLERY_API) return;
    loadGallery();
  }, [loadGallery]);

  // Photos uploaded since the visitor last looked are simply there when they
  // come back to the tab. Silent by design: no skeleton, and the same object is
  // kept when nothing changed, so an unchanged refresh re-renders nothing.
  useRevalidate(() => { if (GALLERY_API) loadGallery(); });

  // Open on the newest year that actually has photos, so the gallery shows
  // last year's celebrations until this year's are uploaded.
  useEffect(() => {
    if (yearPicked || !tree || !tree.years.length) return;
    setSelectedYear(Number(tree.years[0]));
  }, [tree, yearPicked]);

  useEffect(() => {
    const onResize = () => setRowCount(getRowCount());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const images = useMemo(
    () => (tree && tree.byYear[String(selectedYear)]) || [],
    [tree, selectedYear]
  );

  // Before this year's festival there is normally nothing to show. If photos
  // have already been uploaded, though, they win — the notice is for an empty
  // year, not a rule about the date. Same date the hero counts down to, so the
  // two can never disagree.
  const notBegunYet =
    images.length === 0
    && selectedYear === currentYear
    && festivalState && festivalState.phase === 'upcoming';

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
    if (!selectedImage || !images.length) return;
    // Position, not id: the same Drive file can legitimately appear twice.
    const i = typeof selectedImage.index === 'number'
      ? selectedImage.index
      : images.findIndex((im) => im.id === selectedImage.id);
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
              onChange={(e) => { setYearPicked(true); setSelectedYear(Number(e.target.value)); }}
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
                      key={`${img.id}-${img.index}`}
                      onClick={() => setSelectedImage(img)}
                      aria-label={`${t.galleryTitle} ${img.index + 1}`}
                    >
                      <img src={img.thumb || img.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      {/* Drive's poster frame makes a video look like a photo
                          until something says otherwise. */}
                      {img.isVideo && <span className="gallery-play" aria-hidden="true">▶</span>}
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
          ref={lightboxRef}
          className="gallery-lightbox"
          onClick={() => setSelectedImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Photograph"
        >
          {/* Top-right: download, then close. An <a download> rather than a
              button — the browser handles the save itself, which keeps working
              when a popup blocker would have stopped a scripted one. */}
          <div className="gallery-lb-actions" onClick={(e) => e.stopPropagation()}>
            <a
              className="gallery-lb-btn gallery-lb-download"
              href={driveDownloadUrl(selectedImage.id)}
              download={selectedImage.name || undefined}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={t.galleryDownload}
              title={t.galleryDownload}
            >
              <IconDownload />
            </a>
            <button
              className="gallery-lb-btn gallery-lb-close"
              onClick={() => setSelectedImage(null)}
              aria-label={t.close}
            >
              ×
            </button>
          </div>
          <button
            className="gallery-lb-btn gallery-lb-prev"
            onClick={(e) => { e.stopPropagation(); navigate('prev'); }}
            aria-label="Previous"
          >
            ‹
          </button>
          <figure className="gallery-lb-figure" onClick={(e) => e.stopPropagation()}>
            {selectedImage.isVideo ? (
              /* Drive's own player, not a <video src>: the file is not served
                 as a plain stream, and a bare <video> pointed at Drive plays
                 nothing at all. */
              <iframe
                className="gallery-lb-video"
                src={selectedImage.play}
                title={selectedImage.name || 'Video'}
                allow="autoplay; fullscreen"
                allowFullScreen
              />
            ) : (
              <img src={selectedImage.url} alt="" referrerPolicy="no-referrer" />
            )}
            <figcaption className="gallery-lb-count">
              {(selectedImage.index ?? 0) + 1} / {images.length}
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
