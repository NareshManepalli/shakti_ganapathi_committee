import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  isGalleryConfigured, fetchTree, fileToBase64,
  uploadPhoto, deletePhoto, createYear, deleteYear,
} from '../galleryApi';
import { IconUpload, IconFolderAdd, IconFolder, IconTrash } from '../icons';
import { useToast } from '../ToastContext';
import './Gallery.css';

const MAX_MB = 10;                 // matches MAX_UPLOAD_BYTES in the script
const PER_YEAR = 30;               // matches MAX_PHOTOS_PER_YEAR

// Folder browser over the Drive gallery: years on the way in, photos once a
// year is open. Uploads go one file at a time on purpose — Apps Script has a
// six-minute ceiling and a payload limit, and a failed batch would leave the
// committee guessing which photos landed.
// Drive has no thumbnail for a very small image — it answers 404 rather than
// resizing — so such a photo would render as a broken tile. Rare with real
// committee photos (a 3 MB one is ready in about two seconds), but a blank
// square with the filename is a better answer than a broken-image icon.
const Thumb = ({ src, name }) => {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="gal-thumb-missing" title={name}>No preview</span>;
  }
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
};

const Gallery = () => {
  const { token } = useAuth();
  const toast = useToast();
  const configured = isGalleryConfigured();

  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(configured);
  const [openYear, setOpenYear] = useState(null);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);   // { done, total, name }

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
    if (!data) { toast.error('Could not read the gallery', 'The Drive folder did not respond.'); return; }
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

  const pick = () => fileRef.current?.click();

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
      toast.error('Nothing uploaded', skips.length ? skips.join(', ') : 'No images were selected.');
      return;
    }

    setBusy(true);
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

    if (failed.length) {
      toast.error(
        done ? `${done} uploaded, ${failed.length} failed` : `${failed.length} could not be uploaded`,
        failed[0],
      );
    } else {
      toast.success(
        `${done} photo${done === 1 ? '' : 's'} uploaded`,
        skips.length ? `Skipped: ${skips.join(', ')}.` : undefined,
      );
    }
  };

  /* ------------------------------------------------------ create / delete */

  const addYear = async (e) => {
    e.preventDefault();
    const v = newYear.trim();
    if (!/^\d{4}$/.test(v)) { toast.error('That is not a year', 'Enter four digits, e.g. 2027.'); return; }
    setBusy(true);
    const res = await createYear(token, v);
    setBusy(false);
    if (!res.ok) { toast.error('Could not create the folder', res.error); return; }
    setNewYear(''); setAdding(false);
    toast.success(`Folder ${v} created`);
    load();
  };

  const doDelete = async () => {
    if (!confirm) return;
    setBusy(true);
    const res = confirm.kind === 'photo'
      ? await deletePhoto(token, confirm.id)
      : await deleteYear(token, confirm.year);
    setBusy(false);
    const what = confirm.label;
    const wasYear = confirm.kind === 'year';
    setConfirm(null);
    if (!res.ok) { toast.error(`Could not delete ${what}`, res.error); return; }
    toast.success(`${what} deleted`, 'Moved to the Drive bin — recoverable for 30 days.');
    if (wasYear) setOpenYear(null);
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
          <h1 className="admin-page-title">Gallery Management</h1>
          <p className="admin-page-sub">
            Browse the Drive gallery folders, create or remove folders, and manage images
          </p>
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

      <div className="gal-panel">
        <div className="gal-panel-head">
          <nav className="gal-crumbs" aria-label="Breadcrumb">
            {year ? (
              <>
                {/* The crumb is how you go back — a separate button beside it
                    would be two controls for one action. */}
                <button className="gal-crumb" onClick={() => setOpenYear(null)}>
                  Gallery
                </button>
                <span className="gal-crumb-sep" aria-hidden="true">›</span>
                <span className="gal-crumb is-current">{year.year}</span>
              </>
            ) : (
              <span className="gal-crumb is-current">Gallery</span>
            )}
          </nav>

          {year ? (
            <button className="admin-btn" onClick={pick} disabled={busy || remaining === 0}>
              <IconUpload /> {remaining === 0 ? 'Year is full' : 'Upload photos'}
            </button>
          ) : (
            <button className="admin-btn" onClick={() => setAdding((v) => !v)} disabled={busy}>
              <IconFolderAdd /> New Year
            </button>
          )}
        </div>

        {/* The limits, stated before anyone picks a file rather than after the
            server refuses one. */}
        <p className="gal-limits">
          {year
            ? <>Up to <b>{year.limit}</b> photos per year · images ≤ <b>{MAX_MB} MB</b></>
            : <>One folder per year · up to <b>{PER_YEAR}</b> photos each</>}
        </p>

        {/* A count only where it means something. Inside a year it is the room
            left against a cap; at the root it just restated the grid. */}
        {year && (
          <p className="gal-count">{year.used} of {year.limit} photos · {remaining} left</p>
        )}

        {loading ? (
          /* Shaped like the cards they replace — a square block where a folder
             card is short and wide just makes the page jump when data lands. */
          <div className={`gal-grid${openYear ? ' gal-grid-files' : ''}`}>
            {Array.from({ length: openYear ? 6 : 4 }, (_, i) => (
              openYear ? (
                <span className="gal-skel-file" key={i}>
                  <span className="gal-skel-thumb" />
                  <span className="gal-skel-cap" />
                </span>
              ) : (
                <span className="gal-skel-folder" key={i}>
                  <span className="gal-skel-icon" />
                  <span className="gal-skel-name" />
                  <span className="gal-skel-meta" />
                </span>
              )
            ))}
          </div>
        ) : year ? (
          year.images.length ? (
            <div className="gal-grid gal-grid-files">
              {year.images.map((img) => (
                <figure className="gal-file" key={img.id}>
                  <button className="gal-thumb" onClick={() => setPreview(img)} title={img.name}>
                    <Thumb src={img.thumb} name={img.name} />
                  </button>
                  <figcaption title={img.name}>{img.name}</figcaption>
                  <button
                    className="gal-del"
                    aria-label={`Delete ${img.name}`}
                    disabled={busy}
                    onClick={() => setConfirm({ kind: 'photo', id: img.id, year: year.year, label: img.name })}
                  >
                    <IconTrash />
                  </button>
                </figure>
              ))}
            </div>
          ) : (
            <div className="gal-empty">
              <span className="gal-empty-icon" aria-hidden="true">📷</span>
              <h2 className="gal-empty-title">No photos in {year.year}</h2>
              <p className="gal-empty-text">Upload up to {year.limit} photos for this year.</p>
            </div>
          )
        ) : (tree || []).length ? (
          <div className="gal-grid">
            {tree.map((y) => (
              <div className="gal-folder-wrap" key={y.year}>
                <button className="gal-folder" onClick={() => setOpenYear(y.year)}>
                  <IconFolder className="gal-folder-icon" />
                  <span className="gal-folder-name">{y.year}</span>
                  <span className="gal-folder-meta">{y.used} photo{y.used === 1 ? '' : 's'}</span>
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
          </div>
        ) : (
          <div className="gal-empty">
            <span className="gal-empty-icon" aria-hidden="true">📁</span>
            <h2 className="gal-empty-title">No year folders yet</h2>
            <p className="gal-empty-text">Create one to start adding photos.</p>
          </div>
        )}
      </div>

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
