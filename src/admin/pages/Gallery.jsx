import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  isGalleryConfigured, fetchTree, fileToBase64,
  uploadPhoto, deletePhoto, createYear, deleteYear,
} from '../galleryApi';
import {
  IconUpload, IconFolderAdd, IconFolder, IconTrash, IconBack, IconRefresh,
} from '../icons';
import './Gallery.css';

const MAX_MB = 10;                 // matches MAX_UPLOAD_BYTES in the script
const PER_YEAR = 30;               // matches MAX_PHOTOS_PER_YEAR

// Folder browser over the Drive gallery: years on the way in, photos once a
// year is open. Uploads go one file at a time on purpose — Apps Script has a
// six-minute ceiling and a payload limit, and a failed batch would leave the
// committee guessing which photos landed.
const Gallery = () => {
  const { token } = useAuth();
  const configured = isGalleryConfigured();

  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(configured);
  const [openYear, setOpenYear] = useState(null);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);   // { done, total, name }
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [newYear, setNewYear] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState(null);     // { kind, id?, year, label }
  const [preview, setPreview] = useState(null);

  const fileRef = useRef(null);

  const load = useCallback(async () => {
    if (!configured) { setLoading(false); return; }
    setLoading(true);
    const data = await fetchTree();
    setLoading(false);
    if (!data) { setError('Could not read the gallery folder.'); return; }
    setError('');
    setTree(data);
  }, [configured]);

  useEffect(() => { load(); }, [load]);

  // Escape closes the preview.
  useEffect(() => {
    if (!preview) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setPreview(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  const year = tree && openYear ? tree.find((y) => y.year === openYear) : null;
  const remaining = year ? Math.max(0, year.limit - year.used) : 0;

  /* ------------------------------------------------------------ upload */

  const pick = () => { setError(''); setNotice(''); fileRef.current?.click(); };

  const onFiles = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';                       // so the same file can be picked again
    if (!files.length || !year) return;

    const images = files.filter((f) => f.type.startsWith('image/'));
    const skippedType = files.length - images.length;
    const small = images.filter((f) => f.size <= MAX_MB * 1024 * 1024);
    const skippedSize = images.length - small.length;

    // The server refuses past the cap anyway; stopping here means the member
    // is told before waiting through uploads that will be rejected.
    const allowed = small.slice(0, remaining);
    const skippedFull = small.length - allowed.length;

    const skips = [];
    if (skippedType) skips.push(`${skippedType} not an image`);
    if (skippedSize) skips.push(`${skippedSize} over ${MAX_MB} MB`);
    if (skippedFull) skips.push(`${skippedFull} over the ${PER_YEAR}-per-year limit`);

    if (!allowed.length) {
      setError(skips.length ? `Nothing uploaded — ${skips.join(', ')}.` : 'Nothing to upload.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    let done = 0;
    const failed = [];

    for (const file of allowed) {
      setProgress({ done, total: allowed.length, name: file.name });
      try {
        const dataBase64 = await fileToBase64(file);
        const res = await uploadPhoto(token, {
          year: year.year, filename: file.name, mimeType: file.type, dataBase64,
        });
        if (res.ok) done += 1; else failed.push(`${file.name}: ${res.error || 'refused'}`);
      } catch (err) {
        failed.push(`${file.name}: ${err.message}`);
      }
    }

    setProgress(null);
    setBusy(false);
    await load();

    if (failed.length) setError(`${done} uploaded. ${failed.length} failed — ${failed[0]}`);
    else setNotice(`${done} photo${done === 1 ? '' : 's'} uploaded${skips.length ? ` (${skips.join(', ')})` : ''}.`);
  };

  /* ------------------------------------------------------ create / delete */

  const addYear = async (e) => {
    e.preventDefault();
    const v = newYear.trim();
    if (!/^\d{4}$/.test(v)) { setError('Enter a four-digit year, e.g. 2027.'); return; }
    setBusy(true); setError('');
    const res = await createYear(token, v);
    setBusy(false);
    if (!res.ok) { setError(res.error || 'Could not create the folder.'); return; }
    setNewYear(''); setAdding(false); setNotice(`Folder ${v} created.`);
    load();
  };

  const doDelete = async () => {
    if (!confirm) return;
    setBusy(true); setError('');
    const res = confirm.kind === 'photo'
      ? await deletePhoto(token, confirm.id)
      : await deleteYear(token, confirm.year);
    setBusy(false);
    setConfirm(null);
    if (!res.ok) { setError(res.error || 'Could not delete.'); return; }
    setNotice(`${confirm.label} moved to the Drive bin — recoverable for 30 days.`);
    if (confirm.kind === 'year') setOpenYear(null);
    load();
  };

  /* ----------------------------------------------------------- render */

  if (!configured) {
    return (
      <>
        <div className="admin-page-head"><h1 className="admin-page-title">Gallery</h1></div>
        <div className="admin-card admin-wip">
          <span className="admin-wip-icon" aria-hidden="true">🔌</span>
          <h2 className="admin-wip-title">Not connected</h2>
          <p className="admin-wip-text">The gallery Web App URL is not set in the site configuration.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Gallery</h1>
          <p className="admin-page-sub">
            {year
              ? `${year.year} — ${year.used} of ${year.limit} photos, ${remaining} slot${remaining === 1 ? '' : 's'} left`
              : 'Festival photos, one folder per year. Up to 30 photos a year.'}
          </p>
        </div>

        <div className="admin-btn-row">
          {year ? (
            <>
              <button className="admin-btn admin-btn-ghost" onClick={() => setOpenYear(null)} disabled={busy}>
                <IconBack /> All years
              </button>
              <button className="admin-btn" onClick={pick} disabled={busy || remaining === 0}>
                <IconUpload /> {remaining === 0 ? 'Year is full' : 'Upload photos'}
              </button>
            </>
          ) : (
            <>
              <button className="admin-btn admin-btn-ghost" onClick={load} disabled={busy || loading}>
                <IconRefresh /> Refresh
              </button>
              <button className="admin-btn" onClick={() => setAdding((v) => !v)} disabled={busy}>
                <IconFolderAdd /> New year
              </button>
            </>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={onFiles}
      />

      {error && <p className="admin-msg is-error" role="alert">{error}</p>}
      {notice && !error && <p className="admin-msg is-ok" role="status">{notice}</p>}

      {progress && (
        <div className="gal-progress" role="status">
          <div className="gal-progress-bar">
            <span style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
          </div>
          <p>Uploading {progress.done + 1} of {progress.total} — {progress.name}</p>
        </div>
      )}

      {adding && !year && (
        <form className="admin-card gal-newyear" onSubmit={addYear}>
          <label className="admin-field" style={{ marginBottom: 0, flex: 1 }}>
            <span className="admin-label">New year folder</span>
            <input
              className="admin-input"
              value={newYear}
              inputMode="numeric"
              maxLength={4}
              placeholder="2027"
              onChange={(ev) => setNewYear(ev.target.value.replace(/\D/g, '').slice(0, 4))}
              autoFocus
            />
          </label>
          <div className="admin-btn-row">
            <button className="admin-btn" type="submit" disabled={busy}>Create</button>
            <button className="admin-btn admin-btn-ghost" type="button" onClick={() => { setAdding(false); setNewYear(''); }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="gal-grid">
          {Array.from({ length: 4 }, (_, i) => <span key={i} className="gal-skel" />)}
        </div>
      ) : year ? (
        year.images.length ? (
          <div className="gal-grid">
            {year.images.map((img) => (
              <figure className="gal-item" key={img.id}>
                <button className="gal-thumb" onClick={() => setPreview(img)} title={img.name}>
                  <img src={img.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
                </button>
                <figcaption>
                  <span title={img.name}>{img.name}</span>
                  <button
                    className="gal-del"
                    aria-label={`Delete ${img.name}`}
                    disabled={busy}
                    onClick={() => setConfirm({ kind: 'photo', id: img.id, year: year.year, label: img.name })}
                  >
                    <IconTrash />
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="admin-card admin-wip">
            <span className="admin-wip-icon" aria-hidden="true">📷</span>
            <h2 className="admin-wip-title">No photos in {year.year}</h2>
            <p className="admin-wip-text">Upload up to {year.limit} photos for this year.</p>
          </div>
        )
      ) : (
        <div className="gal-years">
          {(tree || []).map((y) => (
            <div className="gal-year" key={y.year}>
              <button className="gal-year-open" onClick={() => { setOpenYear(y.year); setError(''); setNotice(''); }}>
                <span className="gal-year-icon"><IconFolder /></span>
                <span className="gal-year-text">
                  <b>{y.year}</b>
                  <i>{y.used} of {y.limit} photos</i>
                </span>
              </button>
              <button
                className="gal-del"
                aria-label={`Delete the ${y.year} folder`}
                disabled={busy}
                onClick={() => setConfirm({ kind: 'year', year: y.year, label: `Folder ${y.year}` })}
              >
                <IconTrash />
              </button>
            </div>
          ))}
          {!(tree || []).length && (
            <div className="admin-card admin-wip" style={{ gridColumn: '1 / -1' }}>
              <span className="admin-wip-icon" aria-hidden="true">📁</span>
              <h2 className="admin-wip-title">No year folders yet</h2>
              <p className="admin-wip-text">Create one to start adding photos.</p>
            </div>
          )}
        </div>
      )}

      {confirm && (
        <div className="gal-modal" onClick={() => setConfirm(null)}>
          <div className="admin-card gal-confirm" onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-wip-title">Delete {confirm.label}?</h2>
            <p className="admin-wip-text">
              {confirm.kind === 'year'
                ? 'The folder and every photo in it move to the Drive bin, and disappear from the public site.'
                : 'It moves to the Drive bin and disappears from the public site.'}
              {' '}You can restore it from Drive for 30 days.
            </p>
            <div className="admin-btn-row" style={{ justifyContent: 'center', marginTop: 14 }}>
              <button className="admin-btn admin-btn-danger" onClick={doDelete} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete'}
              </button>
              <button className="admin-btn admin-btn-ghost" onClick={() => setConfirm(null)} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="gal-modal" onClick={() => setPreview(null)}>
          <img className="gal-preview" src={preview.full} alt="" referrerPolicy="no-referrer" />
        </div>
      )}
    </>
  );
};

export default Gallery;
