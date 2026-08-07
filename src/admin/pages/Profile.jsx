import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getProfile, updateProfile } from '../../utils/authService';
import { toMediaUrl } from '../../utils/sheetService';

// The member's own record. The email shown here does not come from the public
// members API — that one deliberately withholds it, because it is the address
// the sign-in code is sent to. It comes from the auth endpoint instead, which
// identifies the member from the id inside their signed token, so a member can
// only ever read and edit themselves.
const Profile = () => {
  const { token, member, signOut } = useAuth();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', mobile: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [photoFailed, setPhotoFailed] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await getProfile(token);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      // A dead session cannot be fixed by retrying — send them back to sign in.
      if (res.code === 'UNAUTHORIZED') setTimeout(signOut, 1800);
      return;
    }
    setProfile(res.profile);
    setForm({
      name: res.profile.name || '',
      mobile: res.profile.mobile || '',
      email: res.profile.email || '',
    });
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  const startEdit = () => { setEditing(true); setError(''); setOk(''); };

  const cancel = () => {
    setEditing(false);
    setError('');
    setForm({
      name: profile.name || '',
      mobile: profile.mobile || '',
      email: profile.email || '',
    });
  };

  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setOk('');
    const res = await updateProfile(token, form);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setProfile(res.profile || { ...profile, ...form });
    setEditing(false);
    setOk(
      form.mobile !== (profile.mobile || '')
        ? 'Saved. Your next sign-in code will use the new mobile number.'
        : 'Saved.'
    );
  };

  const photo = profile ? toMediaUrl(profile.profilePhoto || profile.photo, 600) : '';
  const initial = ((profile && profile.name) || (member && member.name) || 'S').trim().charAt(0).toUpperCase();

  return (
    <>
      <div className="admin-page-head">
        <h1 className="admin-page-title">My Profile</h1>
        <p className="admin-page-sub">Your committee record. Position and access are set by the admin.</p>
      </div>

      {error && <p className="admin-msg is-error" role="alert">{error}</p>}
      {ok && <p className="admin-msg is-ok" role="status">{ok}</p>}

      <div className="admin-card">
        {loading ? (
          <div className="admin-profile-head">
            <span className="admin-profile-photo" />
            <span style={{ flex: 1 }}>
              <span className="admin-skel" style={{ display: 'block', width: '48%', marginBottom: 8 }} />
              <span className="admin-skel" style={{ display: 'block', width: '30%' }} />
            </span>
          </div>
        ) : profile ? (
          <>
            <div className="admin-profile-head">
              <span className="admin-profile-photo">
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
              <span>
                <h2 className="admin-profile-name">{profile.name}</h2>
                <p className="admin-profile-role">
                  {profile.position || 'Committee member'}
                  {profile.isAdmin ? ' · Administrator' : ''}
                </p>
              </span>
            </div>

            {editing ? (
              <form onSubmit={save}>
                <label className="admin-field">
                  <span className="admin-label">Name</span>
                  <input
                    className="admin-input"
                    value={form.name}
                    maxLength={60}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>

                <label className="admin-field">
                  <span className="admin-label">Mobile number</span>
                  <input
                    className="admin-input"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={form.mobile}
                    onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                  />
                </label>
                <p className="admin-readonly-note">This is the number you sign in with.</p>

                <label className="admin-field">
                  <span className="admin-label">Email</span>
                  <input
                    className="admin-input"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </label>
                <p className="admin-readonly-note">Your sign-in code is emailed here.</p>

                <label className="admin-field">
                  <span className="admin-label">Position</span>
                  <input className="admin-input" value={profile.position || ''} disabled />
                </label>
                <p className="admin-readonly-note">Set by the admin — not editable here.</p>

                <div className="admin-btn-row">
                  <button className="admin-btn" type="submit" disabled={busy}>
                    {busy ? 'Saving…' : 'Save changes'}
                  </button>
                  <button className="admin-btn admin-btn-ghost" type="button" onClick={cancel} disabled={busy}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <dl>
                  <div className="admin-detail"><dt>Name</dt><dd>{profile.name || '—'}</dd></div>
                  <div className="admin-detail"><dt>Position</dt><dd>{profile.position || '—'}</dd></div>
                  <div className="admin-detail"><dt>Mobile</dt><dd>{profile.mobile || '—'}</dd></div>
                  <div className="admin-detail"><dt>Email</dt><dd>{profile.email || '—'}</dd></div>
                  <div className="admin-detail">
                    <dt>Access</dt>
                    <dd>{profile.isAdmin ? 'Full access' : 'Funds screens only'}</dd>
                  </div>
                </dl>
                <div className="admin-btn-row">
                  <button className="admin-btn" type="button" onClick={startEdit}>Edit</button>
                </div>
              </>
            )}
          </>
        ) : (
          <p className="admin-page-sub">Could not load your profile.</p>
        )}
      </div>
    </>
  );
};

export default Profile;
