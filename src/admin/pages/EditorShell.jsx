import React, { useEffect, useState } from 'react';
import { isContentConfigured } from '../contentApi';
import { toMediaUrl } from '../../utils/sheetService';

/** Shown on every editor screen while the Content Web App is not deployed. */
export const NotConnected = ({ title }) => (
  <>
    <div className="admin-page-head">
      <h1 className="admin-page-title">{title}</h1>
    </div>
    <div className="admin-card admin-wip">
      <span className="admin-wip-icon" aria-hidden="true">🔌</span>
      <h2 className="admin-wip-title">Not connected</h2>
      <p className="admin-wip-text">
        The editing service is not set up yet, so nothing here can be saved.
        Deploy <code>GOOGLE_APPS_SCRIPT_CONTENT.js</code> and put its URL in
        <code>sheetsConfig.js</code> under <code>api.content</code>.
      </p>
    </div>
  </>
);

/** Title, subtitle, and the not-connected / loading / error states in one place.
 *  `skeleton` lets a screen whose card is not a plain stack of fields supply a
 *  placeholder shaped like its own layout, so the page does not rearrange itself
 *  the moment the content lands. */
export const EditorPage = ({ title, subtitle, loading, error, actions, skeleton, children }) => {
  if (!isContentConfigured()) return <NotConnected title={title} />;
  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">{title}</h1>
          {subtitle && <p className="admin-page-sub">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {error && <p className="admin-msg is-error" role="alert">{error}</p>}
      {loading
        ? (skeleton || <div className="admin-card"><FormSkeleton /></div>)
        : children}
    </>
  );
};

export const FormSkeleton = () => (
  <div className="ed-skel">
    <span className="admin-skel" style={{ width: '22%', height: 12 }} />
    <span className="admin-skel" style={{ height: 120 }} />
    <span className="admin-skel" style={{ width: '22%', height: 12 }} />
    <span className="admin-skel" style={{ height: 120 }} />
  </div>
);

/** A titled card split into a column of fields and a column showing what those
 *  fields produce — the address and its map, the About text and its image. */
export const SplitCard = ({ title, left, right, actions, onSubmit }) => (
  <form className="admin-card ed-split-card" onSubmit={onSubmit}>
    <h2 className="ed-split-title">{title}</h2>
    <div className="ed-split">
      <div className="ed-split-col">{left}</div>
      <div className="ed-split-col">{right}</div>
    </div>
    <div className="admin-btn-row ed-split-actions">{actions}</div>
  </form>
);

/** The placeholder for a SplitCard: the same grid, the same columns, the same
 *  preview box, greyed. The generic FormSkeleton is a stack of two blocks,
 *  which is the wrong shape — the page would rearrange itself the moment the
 *  row arrived. The preview box is the real .ed-split-view, empty, so it
 *  carries its own height and cannot drift from the one it stands in for. */
export const SplitSkeleton = () => (
  <div className="admin-card ed-split-card" aria-hidden="true">
    <div className="ed-split-title">
      <span className="admin-skel ed-ph-title" />
    </div>

    <div className="ed-split">
      <div className="ed-split-col">
        <span className="admin-skel ed-ph-label" />
        <span className="admin-skel ed-ph-tag" />
        <span className="admin-skel ed-ph-box" />
        <span className="admin-skel ed-ph-tag" />
        <span className="admin-skel ed-ph-box is-last" />
      </div>

      <div className="ed-split-col">
        <span className="admin-skel ed-ph-label" />
        <span className="admin-skel ed-ph-input" />
        <div className="ed-split-view" />
      </div>
    </div>

    <div className="admin-btn-row ed-split-actions">
      <span className="admin-skel ed-ph-btn" />
    </div>
  </div>
);

/**
 * The placeholder for a table screen: the real toolbar, the real column
 * headings, and one greyed row per row the page will hold.
 *
 * The generic FormSkeleton is a stack of two tall blocks, which is the shape of
 * an editor, not a table — Schedule and Members drew that and then rearranged
 * themselves completely the moment the rows landed. Building it from the same
 * `columns` the table declares means the two cannot drift: add a column to the
 * table and the placeholder gains one, without anybody remembering to.
 *
 * `aria-hidden` throughout, and no text: a screen reader announcing eight
 * meaningless column headings is worse than it announcing nothing while the
 * page is still loading.
 */
export const TableSkeleton = ({ columns, rows = 5, withSelect = false }) => (
  <div className="admin-card tbl-card" aria-hidden="true">
    <div className="tbl-head">
      <span className="admin-skel tbl-ph-btn" />
      {withSelect && <span className="admin-skel tbl-ph-select" />}
      <span className="admin-skel tbl-ph-search" />
    </div>

    <div className="tbl-wrap">
      <table className="tbl tbl-ph">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={c.cls || ''}>
                <span className="admin-skel tbl-ph-th" style={c.w ? { width: c.w } : undefined} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {columns.map((c, i) => (
                <td key={i} className={c.cls || ''}>
                  {/* the picture column keeps its square, so the row height is
                      the height it will actually be */}
                  {c.cls === 'tbl-img'
                    ? <span className="admin-skel tbl-ph-thumb" />
                    : <span className="admin-skel tbl-ph-cell" style={c.w ? { width: c.w } : undefined} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <div className="tbl-foot">
      <span className="admin-skel tbl-ph-count" />
      <span className="admin-skel tbl-ph-pager" />
    </div>
  </div>
);

/**
 * A row's picture, as a small square.
 *
 * Drive answers 404 rather than resizing when a photo is smaller than the
 * thumbnail asked for, and a share link that was never made viewable answers
 * with a login page. Either way the cell says so quietly through its tooltip
 * instead of leaving a broken-image icon in the middle of a table.
 */
export const RowImage = ({ link, alt }) => {
  const src = toMediaUrl(link, 160);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setFailed(false); }, [src]);

  // A dash, not a placeholder picture: a table is a grid to be read down, and a
  // column of identical stand-ins says less at a glance than a column of dashes.
  if (!src || failed) {
    return (
      <span className="tbl-thumb is-empty" title={src ? 'This image could not be loaded' : 'No image'}>
        —
      </span>
    );
  }

  return (
    <span className="tbl-thumb">
      <img src={src} alt={alt || ''} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    </span>
  );
};

/** The count and page buttons under a table card. */
export const TableFoot = ({ from, to, total, page, pages, onPage }) => (
  <div className="tbl-foot">
    <span className="tbl-count">
      {total ? <>Showing {from}–{to} of {total}</> : 'Nothing to show'}
    </span>

    {pages > 1 && (
      <div className="tbl-pager">
        <button
          className="tbl-page" type="button" aria-label="Previous page"
          disabled={page === 1} onClick={() => onPage(page - 1)}
        >
          ‹
        </button>
        {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className={`tbl-page${n === page ? ' is-current' : ''}`}
            aria-current={n === page ? 'page' : undefined}
            onClick={() => onPage(n)}
          >
            {n}
          </button>
        ))}
        <button
          className="tbl-page" type="button" aria-label="Next page"
          disabled={page === pages} onClick={() => onPage(page + 1)}
        >
          ›
        </button>
      </div>
    )}
  </div>
);

/** Side-by-side English and Telugu, as the public site stores them. */
export const Bilingual = ({ label, en, te, onEn, onTe, rows = 8, placeholder = '' }) => (
  <div className="ed-field">
    <span className="admin-label">{label}</span>
    <div className="ed-bi">
      <label className="ed-bi-col">
        <span className="ed-bi-tag">English</span>
        <textarea className="admin-input ed-textarea" rows={rows} value={en}
                  onChange={(e) => onEn(e.target.value)} placeholder={placeholder} />
      </label>
      <label className="ed-bi-col">
        <span className="ed-bi-tag" lang="te">తెలుగు</span>
        <textarea className="admin-input ed-textarea" lang="te" rows={rows} value={te}
                  onChange={(e) => onTe(e.target.value)} placeholder={placeholder} />
      </label>
    </div>
  </div>
);
