import React, { useEffect, useState } from 'react';
import { useAuth, roleLabelFor } from '../../contexts/AuthContext';
import { updateProfile } from '../../utils/authService';
import { toMediaUrl } from '../../utils/sheetService';
import { useToast } from '../ToastContext';
import { IconEdit } from '../icons';

// The member's own record. The email shown here does not come from the public
// members API — that one deliberately withholds it, because it is the address
// the sign-in code is sent to. It comes from the auth endpoint instead, which
// identifies the member from the id inside their signed token, so a member can
// only ever read and edit themselves.
//
// The screen reads top to bottom: who you are, then the form that changes it.
// The form is always on show but inert until Edit is pressed, so the fields a
// member can change are visible without having to click to find out.
const Profile = () => {
  // The record is fetched once per session by AuthContext and shared with the
  // portal chrome, which shows the same photo and position in its topbar.
  const { member, token, profile, profileLoading, profileError, setProfile } = useAuth();
  const toast = useToast();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', nameTe: '', mobile: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  // Seed the form once the record lands, and again if it is refetched.
  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.name || '',
      nameTe: profile.nameTe || '',
      mobile: profile.mobile || '',
      email: profile.email || '',
    });
  }, [profile]);

  const startEdit = () => setEditing(true);

  const cancel = () => {
    setEditing(false);
    setForm({
      name: profile.name || '',
      nameTe: profile.nameTe || '',
      mobile: profile.mobile || '',
      email: profile.email || '',
    });
  };

  const save = async (e) => {
    e.preventDefault();
    if (busy || !editing) return;
    setBusy(true);
    const res = await updateProfile(token, form);
    setBusy(false);
    if (!res.ok) { toast.error('Could not save your profile', res.error); return; }
    const mobileChanged = form.mobile !== (profile.mobile || '');
    setProfile(res.profile || { ...profile, ...form });
    setEditing(false);
    toast.success(
      'Profile saved',
      mobileChanged ? 'Your next sign-in code will go to the new mobile number.' : undefined,
    );
  };

  const photo = profile ? toMediaUrl(profile.profilePhoto || profile.photo, 600) : '';
  const initial = ((profile && profile.name) || (member && member.name) || 'S').trim().charAt(0).toUpperCase();

  return (
    <>
      {/* Wrapped, as Gallery does — .admin-page-head spreads its children apart
          to make room for a right-hand action, which would push the subtitle
          across the page instead of under the title. */}
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">My Profile</h1>
          <p className="admin-page-sub">Your committee account details</p>
        </div>
      </div>

      {/* A failure to LOAD stays inline: there is nothing on the screen behind
          it, so a toast that fades would leave an empty card and no reason. */}
      {profileError && <p className="admin-msg is-error" role="alert">{profileError}</p>}

      <div className="admin-card">
        {profileLoading ? (
          <div className="prof-top">
            <span className="prof-avatar" />
            <div style={{ flex: 1 }}>
              {['52%', '38%', '44%', '60%'].map((w) => (
                <span key={w} className="admin-skel" style={{ display: 'block', width: w, marginBottom: 12 }} />
              ))}
            </div>
          </div>
        ) : profile ? (
          <>
            <div className="prof-top">
              <span className="prof-avatar">
                {photo && !photoFailed ? (
                  <img
                    src={photo}
                    alt=""
                    /* Drive drops the request without this — ERR_BLOCKED_BY_ORB */
                    referrerPolicy="no-referrer"
                    onError={() => setPhotoFailed(true)}
                  />
                ) : initial}
              </span>

              <dl className="prof-facts">
                <div className="prof-fact"><dt>Name</dt><dd>{profile.name || '—'}</dd></div>
                <div className="prof-fact"><dt>Position</dt><dd>{roleLabelFor(profile, profile.isAdmin)}</dd></div>
                <div className="prof-fact"><dt>Mobile</dt><dd>{profile.mobile || '—'}</dd></div>
                <div className="prof-fact"><dt>Email</dt><dd>{profile.email || '—'}</dd></div>
              </dl>
            </div>

            <div className="prof-edit-row">
              <button className="admin-btn admin-btn-ghost" type="button" onClick={startEdit} disabled={editing}>
                <IconEdit />
                Edit Profile
              </button>
            </div>

            {/* Always rendered, disabled until Edit. Position is not here at all:
                it is the committee's to set, and so is adm_in, so a permanently
                greyed box only invited the question of how to change it. It is
                still shown above, where the rest of the read-only record is. */}
            <form className="prof-form" onSubmit={save}>
              <div className="prof-grid">
                <label className="admin-field">
                  <span className="admin-label">Name <em className="prof-req">*</em></span>
                  <input
                    className="admin-input"
                    value={form.name}
                    maxLength={60}
                    disabled={!editing}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>

                {/* name_te — how this member's name renders on the public site in
                    Telugu. Optional: many rows have not been filled in yet, and
                    refusing the save over it would block an email correction. */}
                <label className="admin-field">
                  <span className="admin-label">Name (Telugu)</span>
                  <input
                    className="admin-input"
                    lang="te"
                    value={form.nameTe}
                    maxLength={60}
                    placeholder={editing ? 'పేరు' : ''}
                    disabled={!editing}
                    onChange={(e) => setForm({ ...form, nameTe: e.target.value })}
                  />
                </label>

                <label className="admin-field">
                  <span className="admin-label">Mobile <em className="prof-req">*</em></span>
                  <input
                    className="admin-input"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={form.mobile}
                    disabled={!editing}
                    onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                  />
                </label>

                <label className="admin-field">
                  <span className="admin-label">Email <em className="prof-req">*</em></span>
                  <input
                    className="admin-input"
                    type="email"
                    value={form.email}
                    disabled={!editing}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </label>
              </div>

              {editing && (
                <p className="admin-readonly-note">
                  The mobile number is the one you sign in with, and the sign-in code is emailed to the address above.
                </p>
              )}

              <div className="admin-btn-row">
                <button className="admin-btn" type="submit" disabled={!editing || busy}>
                  {busy ? 'Updating…' : 'Update'}
                </button>
                {editing && (
                  <button className="admin-btn admin-btn-ghost" type="button" onClick={cancel} disabled={busy}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </>
        ) : (
          <p className="admin-page-sub">Could not load your profile.</p>
        )}
      </div>
    </>
  );
};

export default Profile;
