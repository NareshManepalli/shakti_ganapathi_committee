import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import logoImg from '../assets/logo.png';
import {
  IconDashboard, IconAbout, IconMembers, IconGallery, IconSchedule,
  IconMandapam, IconLedger, IconFunds, IconProfile, IconLogout,
} from './icons';
import './Admin.css';

// The portal shell: a fixed sidebar on desktop, a drawer on phones, and a
// topbar carrying the profile menu. Same navy and gold as the public site —
// this is the same committee, not a separate product.
//
// English only, by decision. The public site is bilingual because visitors are;
// the portal is a working tool for a handful of people, and keeping one
// language here means no half-translated admin screens.

// `admin: true` marks a screen as full-access-only. adm_in = 0 members reach
// the funds screens and their own profile, nothing else. Filtering here is a
// courtesy so they aren't shown doors they cannot open — the real check is the
// signed token, which the server reads on every write.
const NAV = [
  { to: '/admin',               label: 'Dashboard',     Icon: IconDashboard, admin: false, end: true },
  { to: '/admin/about',         label: 'About',         Icon: IconAbout,     admin: true },
  { to: '/admin/members',       label: 'Members',       Icon: IconMembers,   admin: true },
  { to: '/admin/gallery',       label: 'Gallery',       Icon: IconGallery,   admin: true },
  { to: '/admin/schedule',      label: 'Schedule',      Icon: IconSchedule,  admin: true },
  { to: '/admin/mandapam',      label: 'Mandapam',      Icon: IconMandapam,  admin: true },
  { to: '/admin/transactions',  label: 'Transactions',  Icon: IconLedger,    admin: false },
  { to: '/admin/monthly-funds', label: 'Monthly Funds', Icon: IconFunds,     admin: false },
];

const AdminLayout = () => {
  const navigate = useNavigate();
  const { member, signOut } = useAuth();

  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);

  const isAdmin = Boolean(member && member.isAdmin);
  const nav = useMemo(() => NAV.filter((n) => !n.admin || isAdmin), [isAdmin]);

  // Close the profile menu on an outside click or Escape.
  useEffect(() => {
    if (!menu) return undefined;
    const onDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const leave = () => {
    signOut();
    // A full navigation, not router.navigate(): clearing the session re-renders
    // the route guard while /admin is still current, and its redirect would win
    // the race. A reload also drops every scrap of in-memory state.
    window.location.assign('/funds');
  };

  const name = (member && member.name) || '';
  const initial = (name.trim().charAt(0) || 'S').toUpperCase();

  return (
    <div className="admin-root">
      {drawer && <div className="admin-scrim" onClick={() => setDrawer(false)} aria-hidden="true" />}

      <aside className={`admin-sidebar${drawer ? ' is-open' : ''}`}>
        <div className="admin-brand">
          <span className="admin-brand-emblem"><img src={logoImg} alt="" /></span>
          <span className="admin-brand-text">
            <b>SRI SHAKTHI</b>
            <i>Ganapathi Committee</i>
          </span>
          <button className="admin-drawer-close" onClick={() => setDrawer(false)} aria-label="Close menu">
            ×
          </button>
        </div>

        <nav className="admin-nav">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `admin-nav-link${isActive ? ' is-active' : ''}`}
              onClick={() => setDrawer(false)}
            >
              <item.Icon />
              {item.label}
            </NavLink>
          ))}
          <span className="admin-nav-sep" />
          <NavLink
            to="/admin/profile"
            className={({ isActive }) => `admin-nav-link${isActive ? ' is-active' : ''}`}
            onClick={() => setDrawer(false)}
          >
            <IconProfile />
            My Profile
          </NavLink>
        </nav>

        <button className="admin-nav-logout" onClick={leave}>
          <IconLogout />
          Log out
        </button>

        <p className="admin-role">
          {isAdmin
            ? 'Full access — you can edit every section.'
            : 'View-only access to the funds screens.'}
        </p>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button className="admin-hamburger" onClick={() => setDrawer(true)} aria-label="Open menu">
            <span /><span /><span />
          </button>

          <span className="admin-topbar-title">Admin Portal</span>

          <div className="admin-profile" ref={menuRef}>
            <button
              className="admin-profile-btn"
              onClick={() => setMenu((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menu}
            >
              <span className="admin-avatar">{initial}</span>
              <span className="admin-profile-text">
                <b>{name}</b>
                <i>{isAdmin ? 'Administrator' : 'Committee member'}</i>
              </span>
              <span className={`admin-caret${menu ? ' is-up' : ''}`} aria-hidden="true">▾</span>
            </button>

            {menu && (
              <div className="admin-profile-menu" role="menu">
                <button role="menuitem" onClick={() => { setMenu(false); navigate('/admin/profile'); }}>
                  <IconProfile />
                  My Profile
                </button>
                <button role="menuitem" className="is-danger" onClick={leave}>
                  <IconLogout />
                  Log out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
