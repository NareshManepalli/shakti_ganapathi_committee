import React, { useMemo, useState } from 'react';
import { useAdminData } from '../useAdminData';
import { saveScheduleDay, deleteScheduleDay, copyYear, activeRows } from '../contentApi';
import { useToast } from '../ToastContext';
import { EditorPage } from './EditorShell';
import { IconTrash } from '../icons';
import { FESTIVAL_DAYS } from '../../config/festival';

/**
 * `2025-08-27` reads as `27 Aug 2025 · Wed`.
 *
 * Built by hand rather than through `new Date(iso)`, which reads a bare date as
 * UTC and so lands on the previous day for anyone west of Greenwich.
 */
const readable = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) return String(iso || '—');
  const [, y, mo, d] = m;
  const at = new Date(Number(y), Number(mo) - 1, Number(d));
  const month = at.toLocaleDateString('en-GB', { month: 'short' });
  const day = at.toLocaleDateString('en-GB', { weekday: 'short' });
  return `${Number(d)} ${month} ${y} · ${day}`;
};

const blankDay = (year, dayNo) => ({
  id: '', year, day_no: dayNo, date: '', time: '',
  title_en: '', title_te: '', image: '', day_en: '', day_te: '',
});

// The nine festival days, one year at a time.
//
// Editing is a modal rather than an inline row: a day carries nine fields in
// two languages, which is more than a table row can hold without becoming
// unreadable on a phone.
const Schedule = () => {
  const { schedule, loading, error, merge, token } = useAdminData();
  const toast = useToast();

  const rows = useMemo(() => activeRows(schedule), [schedule]);
  const years = useMemo(() => {
    const set = new Set(rows.map((r) => String(r.year).trim()).filter(Boolean));
    return [...set].sort((a, b) => Number(b) - Number(a));
  }, [rows]);

  const [year, setYear] = useState('');
  const current = year || years[0] || String(new Date().getFullYear());
  const days = rows
    .filter((r) => String(r.year).trim() === current)
    .sort((a, b) => (Number(a.day_no) || 0) - (Number(b.day_no) || 0));

  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [copying, setCopying] = useState(false);
  const [copyTo, setCopyTo] = useState('');
  const [busy, setBusy] = useState(false);

  const missing = useMemo(() => {
    const have = new Set(days.map((d) => Number(d.day_no)));
    return Array.from({ length: FESTIVAL_DAYS }, (_, i) => i + 1).filter((n) => !have.has(n));
  }, [days]);

  const save = async (e) => {
    e.preventDefault();
    if (busy || !editing) return;
    if (!editing.title_en.trim()) { toast.error('Nothing to save', 'Give the day a name.'); return; }
    setBusy(true);
    const res = await saveScheduleDay(token, editing);
    setBusy(false);
    if (!res.ok) { toast.error('Could not save the day', res.error); return; }
    merge({ schedule: res.schedule });
    setEditing(null);
    toast.success(`Day ${editing.day_no} saved`);
  };

  const remove = async () => {
    if (!confirm) return;
    setBusy(true);
    const res = await deleteScheduleDay(token, confirm.id);
    setBusy(false);
    const label = `Day ${confirm.day_no}`;
    setConfirm(null);
    if (!res.ok) { toast.error(`Could not delete ${label}`, res.error); return; }
    merge({ schedule: res.schedule });
    toast.success(`${label} deleted`, 'Hidden from the site — the row stays in the sheet.');
  };

  const doCopy = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = await copyYear(token, current, copyTo.trim());
    setBusy(false);
    if (!res.ok) { toast.error('Could not copy the year', res.error); return; }
    merge({ schedule: res.schedule });
    setCopying(false);
    setYear(copyTo.trim());
    setCopyTo('');
    toast.success(`${res.copied} days copied`, 'Check the dates — they were shifted by whole years.');
  };

  return (
    <EditorPage
      title="Schedule Management"
      subtitle={`The ${FESTIVAL_DAYS} festival days, per year`}
      loading={loading}
      error={error}
      actions={
        <div className="admin-btn-row">
          <button className="admin-btn admin-btn-ghost" onClick={() => setCopying((v) => !v)} disabled={busy || !days.length}>
            Copy {current} forward
          </button>
          <button
            className="admin-btn"
            onClick={() => setEditing(blankDay(current, missing[0] || days.length + 1))}
            disabled={busy}
          >
            Add a day
          </button>
        </div>
      }
    >
      <div className="admin-card">
        <div className="ed-toolbar">
          <label className="ed-inline">
            <span className="admin-label">Year</span>
            <select className="admin-input" value={current} onChange={(e) => setYear(e.target.value)}>
              {(years.length ? years : [current]).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <span className="ed-inline-note">
            {days.length} of {FESTIVAL_DAYS} days
            {missing.length > 0 && ` · missing ${missing.join(', ')}`}
          </span>
        </div>

        {copying && (
          <form className="ed-strip" onSubmit={doCopy}>
            <label className="ed-inline">
              <span className="admin-label">Copy {current} to</span>
              <input className="admin-input" value={copyTo} inputMode="numeric" maxLength={4}
                     placeholder={String(Number(current) + 1)}
                     onChange={(e) => setCopyTo(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            </label>
            <div className="admin-btn-row">
              <button className="admin-btn" type="submit" disabled={busy}>Copy</button>
              <button className="admin-btn admin-btn-ghost" type="button" onClick={() => setCopying(false)}>Cancel</button>
            </div>
            <p className="admin-readonly-note" style={{ flexBasis: '100%', margin: 0 }}>
              Titles and times come across; dates shift by whole years, so they will need correcting.
            </p>
          </form>
        )}

        {days.length ? (
          <div className="ed-table-wrap">
            <table className="ed-table">
              <thead>
                <tr><th>Day</th><th>Date</th><th>Time</th><th>Event</th><th aria-label="Actions" /></tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.id}>
                    <td className="ed-day-no">{d.day_no}</td>
                    <td>{readable(d.date)}</td>
                    <td>{String(d.time || '—')}</td>
                    <td>
                      <b>{String(d.title_en || '—')}</b>
                      {d.title_te ? <i className="ed-te">{String(d.title_te)}</i> : null}
                    </td>
                    <td className="ed-row-actions">
                      <button className="admin-btn admin-btn-ghost ed-sm" onClick={() => setEditing({
                        id: d.id, year: String(d.year), day_no: d.day_no,
                        date: String(d.date || ''), time: String(d.time || ''),
                        title_en: String(d.title_en || ''), title_te: String(d.title_te || ''),
                        image: String(d.image || ''), day_en: String(d.day_en || ''), day_te: String(d.day_te || ''),
                      })}>Edit</button>
                      <button className="ed-del" aria-label={`Delete day ${d.day_no}`} onClick={() => setConfirm(d)}>
                        <IconTrash />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty">
            <span className="admin-empty-icon" aria-hidden="true">📅</span>
            <h2 className="admin-empty-title">No days for {current}</h2>
            <p className="admin-empty-text">
              Add them one at a time, or copy a previous year forward and correct the dates.
            </p>
          </div>
        )}
      </div>

      {editing && (
        <div className="admin-modal" onClick={() => !busy && setEditing(null)}>
          <form className="admin-card ed-modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <h2 className="admin-page-title" style={{ fontSize: 19 }}>
              {editing.id ? `Edit day ${editing.day_no}` : 'Add a day'}
            </h2>

            <div className="ed-grid">
              <label className="ed-field">
                <span className="admin-label">Day number</span>
                <input className="admin-input" inputMode="numeric" value={editing.day_no}
                       onChange={(e) => setEditing({ ...editing, day_no: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
              </label>
              <label className="ed-field">
                <span className="admin-label">Date</span>
                <input className="admin-input" type="date" value={editing.date}
                       onChange={(e) => setEditing({ ...editing, date: e.target.value })} />
              </label>
              <label className="ed-field">
                <span className="admin-label">Time</span>
                <input className="admin-input" value={editing.time} placeholder="6:00 PM"
                       onChange={(e) => setEditing({ ...editing, time: e.target.value })} />
              </label>
            </div>

            <div className="ed-grid">
              <label className="ed-field">
                <span className="admin-label">Event name — English</span>
                <input className="admin-input" value={editing.title_en}
                       onChange={(e) => setEditing({ ...editing, title_en: e.target.value })} />
              </label>
              <label className="ed-field">
                <span className="admin-label">తెలుగు</span>
                <input className="admin-input" lang="te" value={editing.title_te}
                       onChange={(e) => setEditing({ ...editing, title_te: e.target.value })} />
              </label>
            </div>

            <label className="ed-field">
              <span className="admin-label">Image (optional)</span>
              <input className="admin-input" value={editing.image} placeholder="Google Drive share link"
                     onChange={(e) => setEditing({ ...editing, image: e.target.value })} />
            </label>
            <p className="admin-readonly-note">
              The weekday is worked out from the date, so a typed one can never contradict it.
            </p>

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
            <h2 className="admin-empty-title">Delete day {confirm.day_no}?</h2>
            <p className="admin-empty-text">
              It disappears from the public schedule. The row stays in the sheet, so it can be
              brought back by setting <code>a_in</code> to 1.
            </p>
            <div className="admin-btn-row" style={{ justifyContent: 'center', marginTop: 14 }}>
              <button className="admin-btn admin-btn-danger" onClick={remove} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete'}
              </button>
              <button className="admin-btn admin-btn-ghost" onClick={() => setConfirm(null)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </EditorPage>
  );
};

export default Schedule;
