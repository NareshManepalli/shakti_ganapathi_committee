import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { committeeMembers } from '../data/committeeMembers';
import './Committee.css';

const Committee = () => {
  const { language } = useLanguage();
  const t = translations[language];
  const [selectedMember, setSelectedMember] = useState(null);

  const openModal = (member) => {
    setSelectedMember(member);
  };

  const closeModal = () => {
    setSelectedMember(null);
  };

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (selectedMember) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedMember]);

  // Separate President/Vice President and other members
  const executives = committeeMembers.slice(0, 2);
  const members = committeeMembers.slice(2);

  const getMemberName = (member) => {
    return language === 'te' ? member.nameTe : member.name;
  };

  const getMemberPosition = (member) => {
    return language === 'te' ? member.positionTe : member.position;
  };

  return (
    <>
      <section id="committee" className="committee-section">
        <div className="committee-container">
          <h2 className="committee-section-title">{t.committeeTitle}</h2>
          <p className="committee-section-subtitle">{t.committeeSubtitle}</p>
          
          {/* Executive Row - 2 members */}
          <div className="executive-row">
            {executives.map((member) => (
              <div 
                key={member.id} 
                className="member-card executive-card"
                onClick={() => openModal(member)}
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
                  <div className="member-placeholder" style={{ display: member.image ? 'none' : 'flex' }}>
                    <span className="plus-icon">+</span>
                  </div>
                </div>
                <div className="member-info">
                  <h3 className="member-name">{getMemberName(member)}</h3>
                  <p className="member-position">{getMemberPosition(member)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Members Grid - 3 per row */}
          <div className="members-grid">
            {members.map((member) => (
              <div 
                key={member.id} 
                className="member-card"
                onClick={() => openModal(member)}
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
                  <div className="member-placeholder" style={{ display: member.image ? 'none' : 'flex' }}>
                    <span className="plus-icon">+</span>
                  </div>
                </div>
                <div className="member-info">
                  <h3 className="member-name">{getMemberName(member)}</h3>
                  <p className="member-position">{getMemberPosition(member)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Member Detail Modal */}
      {selectedMember && (
        <div className="member-modal" onClick={closeModal}>
          <div className="member-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={closeModal}>×</button>
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
              <div className="modal-placeholder" style={{ display: selectedMember.image ? 'none' : 'flex' }}>
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

