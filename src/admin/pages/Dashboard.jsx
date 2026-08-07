import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

// The landing screen after sign-in. It says who you are and what your access
// lets you reach — nothing more, because the screens behind those links are
// still being built and pretending otherwise would be misleading.
const CARDS = [
  { to: '/admin/about',         label: 'About',         note: 'Section text and image',        admin: true },
  { to: '/admin/members',       label: 'Members',       note: 'Add, edit and order members',   admin: true },
  { to: '/admin/gallery',       label: 'Gallery',       note: 'Upload and remove photos',      admin: true },
  { to: '/admin/schedule',      label: 'Schedule',      note: 'The nine festival days',        admin: true },
  { to: '/admin/mandapam',      label: 'Mandapam',      note: 'Address and map',               admin: true },
  { to: '/admin/transactions',  label: 'Transactions',  note: 'The committee ledger',          admin: false },
  { to: '/admin/monthly-funds', label: 'Monthly Funds', note: 'Monthly contributions',         admin: false },
];

const Dashboard = () => {
  const { member } = useAuth();
  const isAdmin = Boolean(member && member.isAdmin);
  const cards = CARDS.filter((c) => !c.admin || isAdmin);

  return (
    <>
      <div className="admin-page-head">
        <h1 className="admin-page-title">
          Hello {(member && member.name) || 'there'} <span aria-hidden="true">🤝</span>
        </h1>
        <p className="admin-page-sub">
          {isAdmin
            ? 'You have full access. Every section of the site can be edited from here.'
            : 'You have view-only access to the funds screens.'}
        </p>
      </div>

      <div className="admin-tiles">
        {cards.map((c) => (
          <Link key={c.to} to={c.to} className="admin-tile">
            <b>{c.label}</b>
            <i>{c.note}</i>
          </Link>
        ))}
      </div>
    </>
  );
};

export default Dashboard;
