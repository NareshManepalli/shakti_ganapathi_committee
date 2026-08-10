import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth, roleLabelFor } from '../contexts/AuthContext';
import { toMediaUrl } from '../utils/sheetService';
import logoImg from '../assets/logo.png';
import {
  IconAbout, IconMembers, IconGallery, IconSchedule,
  IconMandapam, IconLedger, IconFunds, IconProfile, IconLogout, IconSettings,
} from './icons';
import { ToastProvider } from './ToastContext';
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
// Monthly Funds is first because it is where sign-in lands everyone — it is the
// one screen every member can reach, admin or not.
const NAV = [
  { to: '/admin/monthly-funds', label: 'Monthly Funds', Icon: IconFunds,     admin: false },
  { to: '/admin/transactions',  label: 'Transactions',  Icon: IconLedger,    admin: false },
  { to: '/admin/about',         label: 'About',         Icon: IconAbout,     admin: true },
  { to: '/admin/members',       label: 'Members',       Icon: IconMembers,   admin: true },
  { to: '/admin/gallery',       label: 'Gallery',       Icon: IconGallery,   admin: true },
  { to: '/admin/schedule',      label: 'Schedule',      Icon: IconSchedule,  admin: true },
  { to: '/admin/mandapam',      label: 'Mandapam',      Icon: IconMandapam,  admin: true },
  { to: '/admin/settings',      label: 'Settings',      Icon: IconSettings,  admin: true },
];

const AdminLayout = () => {
  const navigate = useNavigate();
  const { member, profile, signOut, bypass } = useAuth();

  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
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

  const name = (profile && profile.name) || (member && member.name) || '';
  const initial = (name.trim().charAt(0) || 'S').toUpperCase();
  const role = roleLabelFor(profile, isAdmin);

  // prfle_photo is the portrait cut out for the ID card; photo is the plain
  // headshot. Either reads fine in a circle, so take whichever the sheet has.
  const photo = profile ? toMediaUrl(profile.profilePhoto || profile.photo, 200) : '';
  const showPhoto = Boolean(photo) && !photoFailed;

  // Same face in the pill and in the card below it, so only the size differs.
  const avatar = showPhoto
    ? <img src={photo} alt="" referrerPolicy="no-referrer" onError={() => setPhotoFailed(true)} />
    : initial;

  return (
    <ToastProvider>
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
        </nav>
        {/* Profile and Log out live in the topbar card only — the sidebar is
            for the sections, and having each of them in two places invited the
            question of whether the two did the same thing. */}
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
              <span className="admin-avatar">{avatar}</span>
              <span className="admin-profile-text">
                <b>{name}</b>
                {/* Empty until the record loads — the line keeps its height so
                    the pill does not resize under the cursor when it arrives. */}
                <i>{role}</i>
              </span>
              <span className={`admin-caret${menu ? ' is-up' : ''}`} aria-hidden="true">▾</span>
            </button>

            {menu && (
              /* A card, not a list of links: the avatar and name repeated large
                 confirm who you are signed in as before you act on it. */
              <div className="admin-profile-menu" role="menu">
                <span className="admin-profile-menu-avatar" aria-hidden="true">{avatar}</span>
                <b className="admin-profile-menu-name">{name}</b>
                <i className="admin-profile-menu-role">{role}</i>

                <button role="menuitem" onClick={() => { setMenu(false); navigate('/admin/profile'); }}>
                  <IconProfile />
                  Profile
                </button>
                <button role="menuitem" className="is-danger" onClick={leave}>
                  <IconLogout />
                  Logout
                </button>
              </div>
            )}
          </div>
        </header>

        {bypass && (
          <p className="admin-devbanner" role="alert">
            <b>Development sign-in.</b> This member has <code>bypass_in = 1</code>, so a
            fixed code signs them in and no email is sent. Set it back to 0 in the members
            sheet before the site goes public.
          </p>
        )}

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
    </ToastProvider>
  );
};

export default AdminLayout;
