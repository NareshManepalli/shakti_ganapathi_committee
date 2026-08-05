import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { committeeMembers } from '../data/committeeMembers';
import { useSectionReady } from '../hooks/useSectionReady';
import './Committee.css';

// How many members show before "View All Members" is needed.
//   large  — 4 columns x 3 rows beside the executives
//   small  — 3 columns x 2 rows, so the section stays short on a phone
// Anything past this is revealed by the button: on large screens the area
// becomes a scroller, on small screens the list simply grows.
const LARGE_MIN_WIDTH = 969;
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
          <div
            className="member-modal-content"
            role="dialog"
            aria-modal="true"
            aria-label={getMemberName(selectedMember)}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close-btn" onClick={closeModal} aria-label="Close">
              ×
            </button>
            <div className="modal-image-wrapper">
              {selectedMember.image ? (
                <img
                  src={selectedMember.image}
                  alt={getMemberName(selectedMember)}
                  className="modal-member-image"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextElementSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <div
                className="modal-placeholder"
                style={{ display: selectedMember.image ? 'none' : 'flex' }}
              >
                <span className="plus-icon-large">+</span>
              </div>
            </div>
            <div className="modal-member-details">
              <h2 className="modal-member-name">{getMemberName(selectedMember)}</h2>
              <p className="modal-member-position">
                <strong>{t.position}:</strong> {getMemberPosition(selectedMember)}
              </p>
              <p className="modal-member-mobile">
                <strong>{t.mobileNumber}:</strong> {selectedMember.mobile}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Committee;
