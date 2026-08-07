import React from 'react';
import { useAuth } from '../../contexts/AuthContext';

// Every portal screen that has not been built yet renders this, so the
// navigation is honest: the menu item exists, the door opens, and the screen
// says plainly that there is nothing behind it yet rather than showing an
// empty table that looks broken.
const WorkInProgress = ({ title, description }) => {
  const { member } = useAuth();

  return (
    <>
      <div className="admin-page-head">
        <h1 className="admin-page-title">{title}</h1>
        {description && <p className="admin-page-sub">{description}</p>}
      </div>

      <div className="admin-card admin-wip">
        <span className="admin-wip-icon" aria-hidden="true">🚧</span>
        <h2 className="admin-wip-title">Work in progress</h2>
        <p className="admin-wip-text">
          This screen is being built. You are signed in as{' '}
          <b>{(member && member.name) || 'a committee member'}</b>
          {member && member.isAdmin
            ? ', with full access, so every section will be editable from here.'
            : ', with view-only access to the funds screens.'}
        </p>
      </div>
    </>
  );
};

export default WorkInProgress;
