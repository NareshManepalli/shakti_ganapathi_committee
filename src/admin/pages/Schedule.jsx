import React, { useEffect, useMemo, useState } from 'react';
import { useAdminData } from '../useAdminData';
import { saveScheduleDay, deleteScheduleDay, activeRows } from '../contentApi';
import { useToast } from '../ToastContext';
import { EditorPage, RowImage, TableFoot, TableSkeleton } from './EditorShell';
import { IconTrash, IconEdit, IconSearch } from '../icons';
import { FESTIVAL_DAYS } from '../../config/festival';
import { fmtDate, fmtTime, toIsoDate, toIsoTime } from '../sheetValues';
import { toMediaUrl } from '../../utils/sheetService';
import { fetchEventImages } from '../galleryApi';
import logoImg from '../../assets/logo.png';
import Modal from '../../components/Modal';

const PER_PAGE = 5;

// The columns, declared once. The table renders from these headings and the
// placeholder is built from the same list, so the two cannot fall out of step.
const COLUMNS = [
  { cls: 'tbl-sno', w: '60%' }, { cls: 'tbl-acts', w: '70%' }, { cls: 'tbl-img' },
  { w: '55%' }, { w: '80%' }, { w: '70%' }, { w: '75%' }, { w: '65%' }, { w: '60%' }, { w: '55%' },
];

// A Drive id out of a share link, a thumbnail URL or a bare id — the same shape
// the Apps Script matches, so both ends agree on what identifies a file.
const driveIdOf = (value) => {
  const m = String(value || '').match(/[-\w]{25,}/);
  return m ? m[0] : '';
};

// The sheet may carry a weekday of its own; blank means work it out from the
// date, which is exactly what the public card does — so the column here and the
// line there cannot end up disagreeing.
const weekdayOf = (row, lang) => {
  const override = String((lang === 'te' ? row.day_te : row.day_en) || '').trim();
  if (override) return override;
  const iso = toIsoDate(row.date);
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d)
    .toLocaleDateString(lang === 'te' ? 'te-IN' : 'en-GB', { weekday: 'long' });
};

// Drive answers 404 rather than resizing when a photo is smaller than the
// thumbnail asked for, and a share link that was never made viewable answers
// with a login page. Either way the cell says so quietly instead of leaving a
// broken-image icon in the middle of a row.
// The picture at the size the day card shows it, under the box holding its
// link — a Drive URL says nothing about whether it is the right photo, or
// whether it will load at all.
const ImagePreview = ({ link }) => {
  const src = toMediaUrl(link, 600);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setFailed(false); }, [src]);

  return (
    <div className="ed-preview">
      {src && !failed ? (
        <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : String(link || '').trim() ? (
        /* A link that will not load keeps its message. The emblem stands in for
           a photo nobody has chosen yet, not for one that is broken — showing
           it here would make a bad link look like a deliberate blank. */
        <p className="ed-split-empty">
          That image cannot be loaded. Share the file as “Anyone with the link”.
        </p>
      ) : (
        <img className="ed-fallback" src={logoImg} alt="" aria-hidden="true" />
      )}
    </div>
  );
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
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const missing = useMemo(() => {
    const have = new Set(days.map((d) => Number(d.day_no)));
    return Array.from({ length: FESTIVAL_DAYS }, (_, i) => i + 1).filter((n) => !have.has(n));
  }, [days]);

  // Searched over what the row actually reads as, not the raw cells — someone
  // looking for "14-09" is reading the screen, not the sheet.
  const found = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return days;
    return days.filter((d) => [
      `day-${d.day_no}`, d.title_en, d.title_te, fmtDate(d.date),
      weekdayOf(d, 'en'), weekdayOf(d, 'te'), fmtTime(d.time),
    ].join(' ').toLowerCase().includes(needle));
  }, [days, query]);

  const pages = Math.max(1, Math.ceil(found.length / PER_PAGE));
  // Clamped rather than trusted: deleting the last row of the last page, or
  // narrowing the search, leaves `page` pointing past the end.
  const shown = Math.min(page, pages);
  const start = (shown - 1) * PER_PAGE;
  const rowsOnPage = found.slice(start, start + PER_PAGE);

  useEffect(() => { setPage(1); }, [query, current]);

  // What the two day fields fall back to, shown as their placeholder so an
  // empty box reads as "this is what you will get" rather than "nothing here".
  const autoDayEn = editing && editing.date ? weekdayOf({ date: editing.date }, 'en') : '';
  const autoDayTe = editing && editing.date ? weekdayOf({ date: editing.date }, 'te') : '';

  // Read each time the drawer opens rather than once for the visit: photos get
  // added to and taken out of that folder between one day being filled in and
  // the next, and a list gathered on page load would not know.
  const [eventImages, setEventImages] = useState(null);
  const drawerOpen = Boolean(editing);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    let alive = true;
    fetchEventImages().then((list) => { if (alive) setEventImages(list); });
    return () => { alive = false; };
  }, [drawerOpen]);

  const pickedId = driveIdOf(editing && editing.image);
  const inFolder = Boolean(eventImages && eventImages.some((im) => im.id === pickedId));

  const pickImage = (id) => {
    const hit = (eventImages || []).find((im) => im.id === id);
    if (hit) { setEditing({ ...editing, image: hit.url }); return; }
    // The empty option clears; the "not in the folder" option is the value the
    // row already had, so leave it exactly as it was stored.
    if (!id) setEditing({ ...editing, image: '' });
  };

  const save = async (e) => {
    e.preventDefault();
    if (busy || !editing) return;
    // Only the day number is required. A year gets dated long before it is
    // planned, and insisting on a name here meant the nine days could not be
    // entered until somebody had decided what happened on each of them.
    if (!String(editing.day_no).trim()) {
      toast.error('Nothing to save', 'Give the day a number.');
      return;
    }
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

  // date and time are normalised on the way in, not just for display: the sheet
  // hands them back as instants, and a raw one dropped into <input type="date">
  // is rejected as malformed — the box renders empty and the next save wipes the
  // day it was meant to edit.
  const edit = (d) => setEditing({
    id: d.id, year: String(d.year), day_no: d.day_no,
    date: toIsoDate(d.date), time: toIsoTime(d.time),
    title_en: String(d.title_en || ''), title_te: String(d.title_te || ''),
    image: String(d.image || ''), day_en: String(d.day_en || ''), day_te: String(d.day_te || ''),
  });

  return (
    <EditorPage
      title="Schedule Management"
      subtitle={
        `${days.length} of ${FESTIVAL_DAYS} days for ${current}`
        + (missing.length ? ` · missing ${missing.join(', ')}` : '')
      }
      loading={loading}
      error={error}
      skeleton={<TableSkeleton columns={COLUMNS} rows={PER_PAGE} withSelect />}
    >
      <div className="admin-card tbl-card">
        <div className="tbl-head">
          <button
            className="admin-btn"
            /* The first day not yet entered, or nothing to pre-select once the
               nine are complete — days.length + 1 used to offer a tenth, which
               the dropdown cannot show and the festival does not have. */
            onClick={() => setEditing(blankDay(current, missing[0] || ''))}
            disabled={busy}
          >
            <span className="tbl-plus" aria-hidden="true">+</span> Add a day
          </button>

          <select
            className="admin-input tbl-select"
            value={current}
            aria-label="Year"
            onChange={(e) => setYear(e.target.value)}
          >
            {(years.length ? years : [current]).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>

          <div className="tbl-search">
            <IconSearch />
            <input
              className="admin-input"
              type="search"
              value={query}
              placeholder="Search days…"
              aria-label="Search days"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {days.length ? (
          <>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="tbl-sno">S.No</th>
                    <th className="tbl-acts">Actions</th>
                    <th className="tbl-img">Image</th>
                    <th>Day No</th>
                    <th>Event Name (English)</th>
                    <th>Event Name (తెలుగు)</th>
                    <th>Date</th>
                    <th>Day (English)</th>
                    <th>Day (తెలుగు)</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsOnPage.map((d, i) => (
                    <tr key={d.id}>
                      {/* Numbered across the whole result, not the page, so row 6
                          is row 6 whichever page it is being read on. */}
                      <td className="tbl-sno">{start + i + 1}</td>
                      <td className="tbl-acts">
                        <div>
                          <button
                            className="tbl-icon"
                            aria-label={`Edit day ${d.day_no}`}
                            disabled={busy}
                            onClick={() => edit(d)}
                          >
                            <IconEdit />
                          </button>
                          <button
                            className="tbl-icon is-danger"
                            aria-label={`Delete day ${d.day_no}`}
                            disabled={busy}
                            onClick={() => setConfirm(d)}
                          >
                            <IconTrash />
                          </button>
                        </div>
                      </td>
                      <td className="tbl-img">
                        <RowImage link={d.image} alt={String(d.title_en || `Day ${d.day_no}`)} />
                      </td>
                      <td className="tbl-day">DAY-{d.day_no}</td>
                      <td>{String(d.title_en || '—')}</td>
                      <td lang="te">{String(d.title_te || '—')}</td>
                      <td className="tbl-nowrap">{fmtDate(d.date)}</td>
                      <td className="tbl-nowrap">{weekdayOf(d, 'en')}</td>
                      <td className="tbl-nowrap" lang="te">{weekdayOf(d, 'te')}</td>
                      <td className="tbl-nowrap">{fmtTime(d.time)}</td>
                    </tr>
                  ))}

                  {!found.length && (
                    <tr>
                      <td className="tbl-none" colSpan={10}>No day matches “{query.trim()}”.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <TableFoot
              from={start + 1} to={start + rowsOnPage.length} total={found.length}
              page={shown} pages={pages} onPage={setPage}
            />
          </>
        ) : (
          <div className="admin-empty">
            <span className="admin-empty-icon" aria-hidden="true">📅</span>
            <h2 className="admin-empty-title">No days for {current}</h2>
            <p className="admin-empty-text">Add them one at a time.</p>
          </div>
        )}
      </div>

      {editing && (
        /* A drawer rather than a centred dialog: nine fields in one column is
           taller than a modal can be without scrolling inside a floating box,
           and the table stays visible beside it while a day is being filled in. */
        <Modal onClose={() => setEditing(null)} busy={busy} backdropClass="ed-drawer-scrim">{(titleId) => (
          <form className="ed-drawer" onSubmit={save}>
            <header className="ed-drawer-head">
              <h2 id={titleId}>{editing.id ? `Edit DAY-${editing.day_no}` : 'Add a day'}</h2>
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
                  <span className="admin-label">Year</span>
                  <input className="admin-input" inputMode="numeric" maxLength={4} value={editing.year}
                         onChange={(e) => setEditing({ ...editing, year: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                </label>
                <label className="ed-field">
                  <span className="admin-label">Day number</span>
                  {/* A list, not a typed number: the festival is a fixed nine
                      days, so anything outside it is a mistake the sheet would
                      have to carry. */}
                  <select className="admin-input" value={editing.day_no}
                          onChange={(e) => setEditing({ ...editing, day_no: e.target.value })}>
                    {!editing.day_no && <option value="">—</option>}
                    {Array.from({ length: FESTIVAL_DAYS }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="ed-grid">
                <label className="ed-field">
                  <span className="admin-label">Date</span>
                  <input className="admin-input" type="date" value={editing.date}
                         onChange={(e) => setEditing({ ...editing, date: e.target.value })} />
                </label>
                <label className="ed-field">
                  <span className="admin-label">Time (optional)</span>
                  {/* A time input rather than a text box: it always hands back
                      24-hour HH:MM, which is the one shape the public schedule
                      parses — typed times arrived as "6pm", "6:00 PM" and "18.00". */}
                  <input className="admin-input" type="time" value={editing.time}
                         onChange={(e) => setEditing({ ...editing, time: e.target.value })} />
                </label>
              </div>

              <div className="ed-grid">
                <label className="ed-field">
                  <span className="admin-label">Day — English</span>
                  <input className="admin-input" value={editing.day_en} placeholder={autoDayEn}
                         onChange={(e) => setEditing({ ...editing, day_en: e.target.value })} />
                </label>
                <label className="ed-field">
                  <span className="admin-label">Day — తెలుగు</span>
                  <input className="admin-input" lang="te" value={editing.day_te} placeholder={autoDayTe}
                         onChange={(e) => setEditing({ ...editing, day_te: e.target.value })} />
                </label>
              </div>

              <label className="ed-field">
                <span className="admin-label">Event name — English (optional)</span>
                <input className="admin-input" value={editing.title_en}
                       onChange={(e) => setEditing({ ...editing, title_en: e.target.value })} />
              </label>

              <label className="ed-field">
                <span className="admin-label">Event name — తెలుగు (optional)</span>
                <input className="admin-input" lang="te" value={editing.title_te}
                       onChange={(e) => setEditing({ ...editing, title_te: e.target.value })} />
              </label>

              <label className="ed-field">
                <span className="admin-label">Image (optional)</span>

                {eventImages && eventImages.length ? (
                  <select className="admin-input" value={pickedId} onChange={(e) => pickImage(e.target.value)}>
                    <option value="">— No image —</option>
                    {eventImages.map((im) => (
                      <option key={im.id} value={im.id}>{im.label}</option>
                    ))}
                    {/* A photo taken out of the folder after a day was given it
                        would otherwise vanish from the dropdown and be cleared
                        by the next save without anybody choosing that. */}
                    {pickedId && !inFolder && (
                      <option value={pickedId}>Current image — no longer in the folder</option>
                    )}
                  </select>
                ) : (
                  <input className="admin-input" value={editing.image} placeholder="Google Drive share link"
                         onChange={(e) => setEditing({ ...editing, image: e.target.value })} />
                )}

                <span className="ed-split-hint">
                  {eventImages === null
                    ? 'The event photo folder could not be read, so paste a Drive share link instead.'
                    : eventImages.length
                      ? `${eventImages.length} photo${eventImages.length === 1 ? '' : 's'} in the event folder. Add or remove one in Drive and it appears here.`
                      : 'The event photo folder is empty, so paste a Drive share link instead.'}
                </span>
              </label>

              <ImagePreview link={editing.image} />
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
            <h2 id={titleId} className="admin-empty-title">Delete day {confirm.day_no}?</h2>
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
        )}</Modal>
      )}
    </EditorPage>
  );
};

export default Schedule;
