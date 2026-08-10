import React, { useMemo, useState } from 'react';
import { useAdminData } from '../useAdminData';
import { saveMember, deleteMember, activeRows } from '../contentApi';
import { useToast } from '../ToastContext';
import { EditorPage } from './EditorShell';
import { IconTrash } from '../icons';
import { useAuth } from '../../contexts/AuthContext';

const blank = {
  id: '', name_en: '', name_te: '', position_en: '', position_te: '',
  mobile: '', email: '', photo: '', prfle_photo: '', display_order: '',
  is_executive: false, access_in: false, adm_in: false, bypass_in: false,
};

const asBool = (v) => String(v ?? '').trim() === '1';

// The committee list. This is the only screen that can grant portal access, so
// the three flags are laid out with what each one means rather than as bare
// checkboxes — access_in decides who can sign in at all, adm_in decides who can
// edit, and bypass_in is a development shortcut that must be off before launch.
const Members = () => {
  const { members, loading, error, merge, token } = useAdminData();
  const { member: me } = useAuth();
  const toast = useToast();

  const rows = useMemo(
    () => activeRows(members, 'display_order'),
    [members],
  );

  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const openNew = () => setEditing({
    ...blank,
    display_order: String(rows.length + 1),
  });

  const openEdit = (r) => setEditing({
    id: r.id,
    name_en: String(r.name_en || ''), name_te: String(r.name_te || ''),
    position_en: String(r.position_en || ''), position_te: String(r.position_te || ''),
    mobile: String(r.mobile || '').replace(/\D/g, '').slice(-10),
    email: String(r.email || ''),
    photo: String(r.photo || ''), prfle_photo: String(r.prfle_photo || ''),
    display_order: String(r.display_order || ''),
    is_executive: asBool(r.is_executive), access_in: asBool(r.access_in),
    adm_in: asBool(r.adm_in), bypass_in: asBool(r.bypass_in),
  });

  const save = async (e) => {
    e.preventDefault();
    if (busy || !editing) return;
    if (!editing.name_en.trim()) { toast.error('Nothing to save', 'Enter a name.'); return; }
    setBusy(true);
    const res = await saveMember(token, editing);
    setBusy(false);
    if (!res.ok) { toast.error('Could not save the member', res.error); return; }
    merge({ members: res.members });
    const name = editing.name_en;
    setEditing(null);
    toast.success(`${name} saved`);
  };

  const remove = async () => {
    if (!confirm) return;
    setBusy(true);
    const res = await deleteMember(token, confirm.id);
    setBusy(false);
    const name = String(confirm.name_en || 'Member');
    setConfirm(null);
    if (!res.ok) { toast.error(`Could not remove ${name}`, res.error); return; }
    merge({ members: res.members });
    toast.success(`${name} removed`, 'Hidden from the site — the row stays in the sheet.');
  };

  const bypassCount = rows.filter((r) => asBool(r.bypass_in)).length;

  return (
    <EditorPage
      title="Members Management"
      subtitle="Add and edit committee members, and decide who can sign in"
      loading={loading}
      error={error}
      actions={<button className="admin-btn" onClick={openNew} disabled={busy}>Add a member</button>}
    >
      {bypassCount > 0 && (
        <p className="admin-msg is-warn" role="status">
          <b>{bypassCount} member{bypassCount === 1 ? '' : 's'} can sign in with the development
          code.</b> Turn <code>bypass_in</code> off for everyone before the site goes public.
        </p>
      )}

      <div className="admin-card">
        <div className="ed-table-wrap">
          <table className="ed-table">
            <thead>
              <tr>
                <th>#</th><th>Name</th><th>Position</th><th>Mobile</th>
                <th>Email</th><th>Access</th><th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="ed-day-no">{String(r.display_order || '—')}</td>
                  <td>
                    <b>{String(r.name_en || '—')}</b>
                    {r.name_te ? <i className="ed-te">{String(r.name_te)}</i> : null}
                    {asBool(r.is_executive) && <span className="ed-chip">Executive</span>}
                  </td>
                  <td>{String(r.position_en || '—')}</td>
                  <td>{String(r.mobile || '—')}</td>
                  <td className="ed-email">{String(r.email || '—')}</td>
                  <td>
                    {asBool(r.access_in)
                      ? <span className={`ed-chip${asBool(r.adm_in) ? ' is-admin' : ''}`}>
                          {asBool(r.adm_in) ? 'Full access' : 'Funds only'}
                        </span>
                      : <span className="ed-chip is-off">No sign-in</span>}
                    {asBool(r.bypass_in) && <span className="ed-chip is-warn">bypass</span>}
                  </td>
                  <td className="ed-row-actions">
                    <button className="admin-btn admin-btn-ghost ed-sm" onClick={() => openEdit(r)}>Edit</button>
                    <button
                      className="ed-del"
                      aria-label={`Remove ${r.name_en}`}
                      title={String(r.id) === String(me?.id) ? 'You cannot remove yourself' : 'Remove'}
                      disabled={String(r.id) === String(me?.id)}
                      onClick={() => setConfirm(r)}
                    >
                      <IconTrash />
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={7} className="ed-empty-cell">No members yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="admin-modal" onClick={() => !busy && setEditing(null)}>
          <form className="admin-card ed-modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <h2 className="admin-page-title" style={{ fontSize: 19 }}>
              {editing.id ? `Edit ${editing.name_en || 'member'}` : 'Add a member'}
            </h2>

            <div className="ed-grid">
              <label className="ed-field">
                <span className="admin-label">Name — English</span>
                <input className="admin-input" value={editing.name_en}
                       onChange={(e) => setEditing({ ...editing, name_en: e.target.value })} />
              </label>
              <label className="ed-field">
                <span className="admin-label">తెలుగు</span>
                <input className="admin-input" lang="te" value={editing.name_te}
                       onChange={(e) => setEditing({ ...editing, name_te: e.target.value })} />
              </label>
              <label className="ed-field">
                <span className="admin-label">Position — English</span>
                <input className="admin-input" value={editing.position_en}
                       onChange={(e) => setEditing({ ...editing, position_en: e.target.value })} />
              </label>
              <label className="ed-field">
                <span className="admin-label">తెలుగు</span>
                <input className="admin-input" lang="te" value={editing.position_te}
                       onChange={(e) => setEditing({ ...editing, position_te: e.target.value })} />
              </label>
              <label className="ed-field">
                <span className="admin-label">Mobile</span>
                <input className="admin-input" type="tel" inputMode="numeric" maxLength={10}
                       value={editing.mobile}
                       onChange={(e) => setEditing({ ...editing, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
              </label>
              <label className="ed-field">
                <span className="admin-label">Email</span>
                <input className="admin-input" type="email" value={editing.email}
                       onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </label>
              <label className="ed-field">
                <span className="admin-label">Card photo</span>
                <input className="admin-input" value={editing.photo} placeholder="Drive share link"
                       onChange={(e) => setEditing({ ...editing, photo: e.target.value })} />
              </label>
              <label className="ed-field">
                <span className="admin-label">Identity card photo</span>
                <input className="admin-input" value={editing.prfle_photo} placeholder="Drive share link"
                       onChange={(e) => setEditing({ ...editing, prfle_photo: e.target.value })} />
              </label>
              <label className="ed-field">
                <span className="admin-label">Display order</span>
                <input className="admin-input" inputMode="numeric" value={editing.display_order}
                       onChange={(e) => setEditing({ ...editing, display_order: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
              </label>
            </div>

            <p className="admin-readonly-note">
              The mobile is what a member signs in with, and the email is where their code is
              sent. Both must be right for them to reach the portal.
            </p>

            <div className="ed-flags">
              <label className="ed-flag">
                <input type="checkbox" checked={editing.is_executive}
                       onChange={(e) => setEditing({ ...editing, is_executive: e.target.checked })} />
                <span><b>Executive</b><i>Shown in the left column on the public site</i></span>
              </label>
              <label className="ed-flag">
                <input type="checkbox" checked={editing.access_in}
                       onChange={(e) => setEditing({ ...editing, access_in: e.target.checked, adm_in: e.target.checked && editing.adm_in })} />
                <span><b>Can sign in</b><i>Without this, they appear on the site but cannot reach the portal</i></span>
              </label>
              <label className={`ed-flag${editing.access_in ? '' : ' is-disabled'}`}>
                <input type="checkbox" checked={editing.adm_in} disabled={!editing.access_in}
                       onChange={(e) => setEditing({ ...editing, adm_in: e.target.checked })} />
                <span><b>Full access</b><i>Can edit every section. Otherwise: funds screens only</i></span>
              </label>
              <label className="ed-flag is-warn">
                <input type="checkbox" checked={editing.bypass_in}
                       onChange={(e) => setEditing({ ...editing, bypass_in: e.target.checked })} />
                <span><b>Development sign-in</b><i>Signs in with a fixed code and no email. Must be off before launch</i></span>
              </label>
            </div>

            <div className="admin-btn-row">
              <button className="admin-btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
              <button className="admin-btn admin-btn-ghost" type="button" onClick={() => setEditing(null)} disabled={busy}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {confirm && (
        <div className="admin-modal" onClick={() => setConfirm(null)}>
          <div className="admin-card admin-confirm" onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-empty-title">Remove {String(confirm.name_en)}?</h2>
            <p className="admin-empty-text">
              They disappear from the public site and can no longer sign in. The row stays in
              the sheet, so it can be brought back by setting <code>a_in</code> to 1.
            </p>
            <div className="admin-btn-row" style={{ justifyContent: 'center', marginTop: 14 }}>
              <button className="admin-btn admin-btn-danger" onClick={remove} disabled={busy}>
                {busy ? 'Removing…' : 'Remove'}
              </button>
              <button className="admin-btn admin-btn-ghost" onClick={() => setConfirm(null)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </EditorPage>
  );
};

export default Members;
