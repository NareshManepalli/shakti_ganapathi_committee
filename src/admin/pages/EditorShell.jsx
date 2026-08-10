import React from 'react';
import { isContentConfigured } from '../contentApi';

/** Shown on every editor screen while the Content Web App is not deployed. */
export const NotConnected = ({ title }) => (
  <>
    <div className="admin-page-head">
      <h1 className="admin-page-title">{title}</h1>
    </div>
    <div className="admin-card admin-wip">
      <span className="admin-wip-icon" aria-hidden="true">🔌</span>
      <h2 className="admin-wip-title">Not connected</h2>
      <p className="admin-wip-text">
        The editing service is not set up yet, so nothing here can be saved.
        Deploy <code>GOOGLE_APPS_SCRIPT_CONTENT.js</code> and put its URL in
        <code>sheetsConfig.js</code> under <code>api.content</code>.
      </p>
    </div>
  </>
);

/** Title, subtitle, and the not-connected / loading / error states in one place. */
export const EditorPage = ({ title, subtitle, loading, error, actions, children }) => {
  if (!isContentConfigured()) return <NotConnected title={title} />;
  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">{title}</h1>
          {subtitle && <p className="admin-page-sub">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {error && <p className="admin-msg is-error" role="alert">{error}</p>}
      {loading ? <div className="admin-card"><FormSkeleton /></div> : children}
    </>
  );
};

export const FormSkeleton = () => (
  <div className="ed-skel">
    <span className="admin-skel" style={{ width: '22%', height: 12 }} />
    <span className="admin-skel" style={{ height: 120 }} />
    <span className="admin-skel" style={{ width: '22%', height: 12 }} />
    <span className="admin-skel" style={{ height: 120 }} />
  </div>
);

/** Side-by-side English and Telugu, as the public site stores them. */
export const Bilingual = ({ label, en, te, onEn, onTe, rows = 8, placeholder = '' }) => (
  <div className="ed-field">
    <span className="admin-label">{label}</span>
    <div className="ed-bi">
      <label className="ed-bi-col">
        <span className="ed-bi-tag">English</span>
        <textarea className="admin-input ed-textarea" rows={rows} value={en}
                  onChange={(e) => onEn(e.target.value)} placeholder={placeholder} />
      </label>
      <label className="ed-bi-col">
        <span className="ed-bi-tag">తెలుగు</span>
        <textarea className="admin-input ed-textarea" lang="te" rows={rows} value={te}
                  onChange={(e) => onTe(e.target.value)} placeholder={placeholder} />
      </label>
    </div>
  </div>
);
