import React, { useEffect, useMemo, useState } from 'react';
import { useAdminData } from '../useAdminData';
import { saveMember, deleteMember, activeRows } from '../contentApi';
import { useToast } from '../ToastContext';
import { EditorPage, RowImage, TableFoot, TableSkeleton } from './EditorShell';
import { IconTrash, IconEdit, IconSearch } from '../icons';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../../components/Modal';

const PER_PAGE = 5;

// Declared once, so the table and its placeholder are built from the same list.
const COLUMNS = [
  { cls: 'tbl-sno', w: '60%' }, { cls: 'tbl-acts', w: '70%' }, { cls: 'tbl-img' },
  { w: '75%' }, { w: '70%' }, { w: '65%' }, { w: '70%' }, { w: '85%' },
];

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
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  // Everything a name might be looked up by, in either language.
  const found = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => [
      r.name_en, r.name_te, r.position_en, r.position_te, r.mobile, r.email,
    ].join(' ').toLowerCase().includes(needle));
  }, [rows, query]);

  const pages = Math.max(1, Math.ceil(found.length / PER_PAGE));
  // Clamped rather than trusted: removing the last row of the last page, or
  // narrowing the search, leaves `page` pointing past the end.
  const shown = Math.min(page, pages);
  const start = (shown - 1) * PER_PAGE;
  const onPage = found.slice(start, start + PER_PAGE);

  useEffect(() => { setPage(1); }, [query]);

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
      skeleton={<TableSkeleton columns={COLUMNS} rows={PER_PAGE} />}
    >
      {bypassCount > 0 && (
        <p className="admin-msg is-warn" role="status">
          <b>{bypassCount} member{bypassCount === 1 ? '' : 's'} can sign in with the development
          code.</b> Turn <code>bypass_in</code> off for everyone before the site goes public.
        </p>
      )}

      <div className="admin-card tbl-card">
        <div className="tbl-head">
          <button className="admin-btn" onClick={openNew} disabled={busy}>
            <span className="tbl-plus" aria-hidden="true">+</span> Add a member
          </button>

          <div className="tbl-search">
            <IconSearch />
            <input
              className="admin-input"
              type="search"
              value={query}
              placeholder="Search members…"
              aria-label="Search members"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {rows.length ? (
          <>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="tbl-sno">S.No</th>
                    <th className="tbl-acts">Actions</th>
                    <th className="tbl-img">Image</th>
                    <th>Name (English)</th>
                    <th>Name (తెలుగు)</th>
                    <th>Position</th>
                    <th>Mobile</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {onPage.map((r, i) => {
                    const isMe = String(r.id) === String(me?.id);
                    return (
                      <tr key={r.id}>
                        {/* Numbered across the whole result, not the page, so row
                            6 is row 6 whichever page it is being read on. */}
                        <td className="tbl-sno">{start + i + 1}</td>
                        <td className="tbl-acts">
                          <div>
                            <button
                              className="tbl-icon"
                              aria-label={`Edit ${r.name_en}`}
                              disabled={busy}
                              onClick={() => openEdit(r)}
                            >
                              <IconEdit />
                            </button>
                            <button
                              className="tbl-icon is-danger"
                              aria-label={`Remove ${r.name_en}`}
                              title={isMe ? 'You cannot remove yourself' : 'Remove'}
                              disabled={busy || isMe}
                              onClick={() => setConfirm(r)}
                            >
                              <IconTrash />
                            </button>
                          </div>
                        </td>
                        <td className="tbl-img">
                          <RowImage link={r.photo || r.prfle_photo} alt={String(r.name_en || '')} />
                        </td>
                        <td>{String(r.name_en || '—')}</td>
                        <td lang="te">{String(r.name_te || '—')}</td>
                        <td>{String(r.position_en || '—')}</td>
                        <td className="tbl-nowrap">{String(r.mobile || '—')}</td>
                        <td className="ed-email">{String(r.email || '—')}</td>
                      </tr>
                    );
                  })}

                  {!found.length && (
                    <tr>
                      <td className="tbl-none" colSpan={8}>No member matches “{query.trim()}”.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <TableFoot
              from={start + 1} to={start + onPage.length} total={found.length}
              page={shown} pages={pages} onPage={setPage}
            />
          </>
        ) : (
          <div className="admin-empty">
            <span className="admin-empty-icon" aria-hidden="true">👥</span>
            <h2 className="admin-empty-title">No members yet</h2>
            <p className="admin-empty-text">Add the committee one at a time.</p>
          </div>
        )}
      </div>

      {editing && (
        /* The same drawer the schedule uses: a dozen fields and four flags is
           taller than a centred dialog can hold without scrolling inside a
           floating box, and the list stays visible beside it. */
        <Modal onClose={() => setEditing(null)} busy={busy} backdropClass="ed-drawer-scrim">{(titleId) => (
          <form className="ed-drawer" onSubmit={save}>
            <header className="ed-drawer-head">
              <h2 id={titleId}>{editing.id ? `Edit ${editing.name_en || 'member'}` : 'Add a member'}</h2>
              <button
                type="button" className="ed-drawer-x" aria-label="Close"
                onClick={() => setEditing(null)} disabled={busy}
              >
                ×
              </button>
            </header>

            <div className="ed-drawer-body">
              <div className="ed-grid">
                <label className="ed-field">
                  <span className="admin-label">Name — English</span>
                  <input className="admin-input" value={editing.name_en}
                         onChange={(e) => setEditing({ ...editing, name_en: e.target.value })} />
                </label>
                <label className="ed-field">
                  <span className="admin-label">Name — తెలుగు</span>
                  <input className="admin-input" lang="te" value={editing.name_te}
                         onChange={(e) => setEditing({ ...editing, name_te: e.target.value })} />
                </label>
              </div>

              <div className="ed-grid">
                <label className="ed-field">
                  <span className="admin-label">Position — English</span>
                  <input className="admin-input" value={editing.position_en}
                         onChange={(e) => setEditing({ ...editing, position_en: e.target.value })} />
                </label>
                <label className="ed-field">
                  <span className="admin-label">Position — తెలుగు</span>
                  <input className="admin-input" lang="te" value={editing.position_te}
                         onChange={(e) => setEditing({ ...editing, position_te: e.target.value })} />
                </label>
              </div>

              <div className="ed-grid">
                <label className="ed-field">
                  <span className="admin-label">Mobile</span>
                  <input className="admin-input" type="tel" inputMode="numeric" maxLength={10}
                         value={editing.mobile}
                         onChange={(e) => setEditing({ ...editing, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
                </label>
                <label className="ed-field">
                  <span className="admin-label">Display order</span>
                  <input className="admin-input" inputMode="numeric" value={editing.display_order}
                         onChange={(e) => setEditing({ ...editing, display_order: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
                </label>
              </div>

              {/* Full width: an address is long enough that half a drawer would
                  scroll it out of sight as it was typed. */}
              <label className="ed-field">
                <span className="admin-label">Email</span>
                <input className="admin-input" type="email" value={editing.email}
                       onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </label>

              <p className="admin-readonly-note">
                The mobile is what a member signs in with, and the email is where their code is
                sent. Both must be right for them to reach the portal.
              </p>

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
            </div>

            <footer className="ed-drawer-foot">
              <button className="admin-btn admin-btn-ghost" type="button" onClick={() => setEditing(null)} disabled={busy}>
                Cancel
              </button>
              <button className="admin-btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            </footer>
          </form>
        )}</Modal>
      )}

      {confirm && (
        <Modal onClose={() => setConfirm(null)} busy={busy}>{(titleId) => (
          <div className="admin-card admin-confirm">
            <h2 id={titleId} className="admin-empty-title">Remove {String(confirm.name_en)}?</h2>
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
        )}</Modal>
      )}
    </EditorPage>
  );
};

export default Members;
