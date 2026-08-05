import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { committeeMembers } from '../data/committeeMembers';
import logoImg from '../assets/logo.png';
// Two cutouts stand in until real photos arrive — alternated per member so
// the cards don't all look identical.
import memberPhotoA from '../assets/naresh.png';
import memberPhotoB from '../assets/naresh2.png';
import { useSectionReady } from '../hooks/useSectionReady';
import './Committee.css';

// How many members show before "View All Members" is needed.
//   large  — 4 columns x 3 rows beside the executives
//   small  — 3 columns x 2 rows, so the section stays short on a phone
// Anything past this is revealed by the button: on large screens the area
// becomes a scroller, on small screens the list simply grows.
const LARGE_MIN_WIDTH = 969;
const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3.5v11" />
    <path d="M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4.5 19.5h15" />
  </svg>
);

const VISIBLE_LARGE = 12;
const VISIBLE_SMALL = 6;

const getVisibleCount = () =>
  (typeof window === 'undefined' || window.innerWidth >= LARGE_MIN_WIDTH
    ? VISIBLE_LARGE
    : VISIBLE_SMALL);

const Committee = () => {
  const { language } = useLanguage();
  const t = translations[language];
  const [selectedMember, setSelectedMember] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [visibleCount, setVisibleCount] = useState(getVisibleCount);

  useEffect(() => {
    const onResize = () => setVisibleCount(getVisibleCount());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // The executive column defines the height of the three member rows beside it.
  // Measuring it lets the expanded members area scroll inside exactly that
  // height, so revealing extra members never changes the section's height.
  const cardRef = useRef(null);
  const [downloading, setDownloading] = useState(false);

  // html2canvas is ~200 kB — loaded only when someone actually downloads,
  // so it never reaches the public bundle.
  const downloadCard = async () => {
    const el = cardRef.current;
    if (!el || downloading) return;
    setDownloading(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        // JPEG has no alpha, so give it the card's own backdrop rather than
        // letting transparent areas render black.
        backgroundColor: '#050a14',
      });
      const link = document.createElement('a');
      link.download = `${getMemberName(selectedMember).replace(/\s+/g, '-')}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    } catch (err) {
      console.error('Could not export the card:', err);
    } finally {
      setDownloading(false);
    }
  };

  const execRef = useRef(null);
  const [execHeight, setExecHeight] = useState(null);

  useEffect(() => {
    const el = execRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setExecHeight(el.offsetHeight));
    observer.observe(el);
    setExecHeight(el.offsetHeight);
    return () => observer.disconnect();
  }, []);

  const openModal = (member) => setSelectedMember(member);
  const closeModal = () => setSelectedMember(null);

  // Prevent body scroll when the modal is open.
  useEffect(() => {
    document.body.style.overflow = selectedMember ? 'hidden' : 'unset';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedMember]);

  // Close on Escape.
  useEffect(() => {
    if (!selectedMember) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedMember]);

  const loading = useSectionReady();

  const executives = committeeMembers.slice(0, 2);
  const members = committeeMembers.slice(2);
  const hasMore = members.length > visibleCount;
  const shownMembers = showAll ? members : members.slice(0, visibleCount);

  const getMemberName = (member) => (language === 'te' ? member.nameTe : member.name);
  const getMemberPosition = (member) =>
    (language === 'te' ? member.positionTe : member.position);

  const renderCard = (member, extraClass = '') => (
    <div
      key={member.id}
      className={`member-card${extraClass ? ` ${extraClass}` : ''}`}
      onClick={() => openModal(member)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openModal(member);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="member-image-wrapper">
        {member.image ? (
          <img
            src={member.image}
            alt={getMemberName(member)}
            className="member-image"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextElementSibling.style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className="member-placeholder"
          style={{ display: member.image ? 'none' : 'flex' }}
        >
          <span className="plus-icon">+</span>
        </div>
      </div>
      <div className="member-info">
        <h3 className="member-name">{getMemberName(member)}</h3>
        <p className="member-position">{getMemberPosition(member)}</p>
      </div>
    </div>
  );

  if (loading) {
    return (
      <section id="committee" className="committee-section" aria-busy="true">
        <div className="committee-container">
          <div className="skeleton-head">
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-subtitle" />
          </div>
          <div className="committee-layout">
            <div className="committee-executives">
              <span className="skeleton cm-skel-card is-exec" />
              <span className="skeleton cm-skel-card is-exec" />
            </div>
            <div className="committee-members">
              {Array.from({ length: visibleCount }, (_, i) => (
                <span className="skeleton cm-skel-card" key={i} />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section id="committee" className="committee-section">
        <div className="committee-container">
          <h2 className="committee-section-title">{t.committeeTitle}</h2>
          <p className="committee-section-subtitle">{t.committeeSubtitle}</p>

          <div className="committee-layout">
            {/* Left — President and Vice President, stacked */}
            <div className="committee-executives" ref={execRef}>
              {executives.map((member) => renderCard(member, 'executive-card'))}
            </div>

            {/* Right — the rest, 4 across on large screens */}
            <div
              className={`committee-members${showAll ? ' is-expanded' : ''}`}
              style={execHeight ? { '--exec-h': `${execHeight}px` } : undefined}
            >
              {shownMembers.map((member) => renderCard(member))}
            </div>
          </div>

          {hasMore && (
            <div className="committee-viewall-wrap">
              <button
                type="button"
                className="committee-viewall"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? t.showLess : t.viewAllMembers}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Member detail modal */}
      {selectedMember && (
        <div className="member-modal" onClick={closeModal}>
          <div className="modal-actions" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-action-btn"
              onClick={downloadCard}
              disabled={downloading}
              aria-label="Download card"
              title="Download card"
            >
              <DownloadIcon />
            </button>
            <button
              className="modal-action-btn modal-close-btn"
              onClick={closeModal}
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div
            ref={cardRef}
            className="idcard"
            role="dialog"
            aria-modal="true"
            aria-label={getMemberName(selectedMember)}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="idcard-rings" aria-hidden="true" />

            <header className="idcard-brand">
              <span className="idcard-logo">
                <img src={logoImg} alt="" />
              </span>
              <span className="idcard-brandtext">
                {language === 'te' ? (
                  /* Telugu reads as one phrase — split across two lines it
                     looked broken, so the card uses the full name instead. */
                  <span className="idcard-brand-single">{t.committeeName}</span>
                ) : (
                  <>
                    <span className="idcard-brand-1">{t.brandLine1}</span>
                    <span className="idcard-brand-2">{t.brandLine2}</span>
                  </>
                )}
              </span>
            </header>

            <div className="idcard-photo">
              <img
                src={selectedMember.id % 2 === 1 ? memberPhotoA : memberPhotoB}
                alt=""
              />
            </div>

            <span className="idcard-smoke" aria-hidden="true" />

            <div className="idcard-details">
              <h3 className="idcard-name">{getMemberName(selectedMember)}</h3>
              <div className="idcard-meta">
                <p className="idcard-line">{getMemberPosition(selectedMember)}</p>
                <p className="idcard-line">{selectedMember.mobile}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Committee;
