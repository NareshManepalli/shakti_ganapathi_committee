import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { useAuth } from '../contexts/AuthContext';
import logoImg from '../assets/logo.png';
import './AuthPages.css';

// Placeholder landing for a signed-in member. Phase 6 replaces this with the
// real portal; what it proves today is that the whole gate works — the session
// exists, the member is known, and adm_in decides what they will be able to do.
const AdminDashboard = () => {
  const { language } = useLanguage();
  const t = translations[language];
  const { member, signOut } = useAuth();

  const leave = () => {
    signOut();
    // A full navigation, not router.navigate(): clearing the session re-renders
    // RequireAuth while /admin is still the current route, and its redirect to
    // the sign-in page wins the race against an in-flight client-side navigate.
    // Signing out should land on the public site, and a reload also drops every
    // scrap of in-memory state, which is the right thing to do here anyway.
    window.location.assign('/');
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <span className="auth-emblem">
          <img src={logoImg} alt="" />
        </span>

        <h1 className="auth-committee">{t.committeeName}</h1>
        <h2 className="auth-title">{t.adminDashboardTitle}</h2>

        <p className="auth-greeting">
          {t.authHello.replace('{name}', (member && member.name) || '')}{' '}
          <span aria-hidden="true">🤝</span>
        </p>

        {/* adm_in decides this, and it is decided on the server: the flag is
            baked into the signed token, so it cannot be flipped in the browser. */}
        <p className="auth-helper">
          {member && member.isAdmin ? t.adminFullAccess : t.adminViewOnly}
        </p>

        <ul className="auth-screens">
          {(member && member.isAdmin
            ? [t.adminScrAbout, t.adminScrMembers, t.adminScrGallery,
               t.adminScrSchedule, t.adminScrMandapam, t.adminScrTransactions,
               t.adminScrFunds]
            : [t.adminScrTransactions, t.adminScrFunds]
          ).map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>

        <p className="auth-notice" role="status">{t.adminComingSoon}</p>

        <button type="button" className="auth-submit" onClick={leave}>
          {t.adminSignOut}
        </button>
      </div>
    </main>
  );
};

export default AdminDashboard;
