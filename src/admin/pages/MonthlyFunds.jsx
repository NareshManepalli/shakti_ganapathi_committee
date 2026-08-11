import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ToastContext';
import { TableFoot, TableSkeleton } from './EditorShell';
import { IconTrash, IconEdit, IconSearch, IconDownload } from '../icons';
import Modal from '../../components/Modal';
import {
  isFundsConfigured, fetchFunds, saveFund, deleteFund,
  yearOf, monthOf, toDmy, toIso, rupees, withBalances, summarise,
  resolveRange, inRange, rangeLabel, todayDmy, dateKey,
} from '../fundsApi';
import { buildStatement } from '../fundsStatement';
import { buildCycles, cycleLabel, rowsIn, usefulCycles } from '../fundsCycles';
import { fetchSheetRows } from '../../utils/sheetService';
import { SHEETS_CONFIG } from '../../config/sheetsConfig';

const PER_PAGE = 8;

const COLUMNS = [
  { cls: 'tbl-sno', w: '60%' }, { cls: 'tbl-acts', w: '70%' },
  { w: '70%' }, { w: '65%' }, { w: '85%' }, { w: '55%' }, { w: '55%' }, { w: '60%' }, { w: '90%' },
];

const blank = {
  trnsctn_id: '', date: '', reason: '', credit: '', debit: '', fund_persons: '',
  annual_year: '', annual_yr_id: '',
};

/**
 * The committee's money, month by month.
 *
 * The ledger is dated rather than monthly: January can hold the collection on
 * the 5th and a spend on the 11th, and both belong. So the rows stay as they
 * are and the month view is a rollup over them — which is also the only way the
 * "who paid in" question can be answered, since that is recorded per row.
 *
 * The one screen every member reaches, whatever adm_in says. A funds-only
 * member sees the whole ledger and can take the statement; only an admin gets
 * the add, edit and delete controls, and the script enforces that regardless of
 * what this file renders.
 */
const MonthlyFunds = () => {
  const { token, member } = useAuth();
  const toast = useToast();
  const configured = isFundsConfigured();
  const isAdmin = Boolean(member && member.isAdmin);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [cycles, setCycles] = useState([]);
  const [pickedCycle, setPickedCycle] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);

  // The To field opens on today, so the common case — everything up to now —
  // is one click rather than a date to look up.
  const [statement, setStatement] = useState(null);

  const load = useCallback(async () => {
    if (!configured || !token) { setLoading(false); return; }
    setLoading(true);
    const res = await fetchFunds(token);
    setLoading(false);
    if (!res.ok) { setError(res.error || 'Could not read the funds sheet.'); return; }
    setError('');
    setRows(res.funds || []);
  }, [configured, token]);

  useEffect(() => { load(); }, [load]);

  // Day 1 of each year in the schedule sheet is that year's celebration date,
  // and that sheet is public — the site reads it — so a funds-only member gets
  // the fund years without needing the admin endpoint they cannot call.
  useEffect(() => {
    let alive = true;
    fetchSheetRows(SHEETS_CONFIG.sections && SHEETS_CONFIG.sections.schedule)
      .then((rows) => { if (alive) setCycles(buildCycles(rows)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Balances are computed across the whole ledger before it is split by year,
  // so January opens with December's closing figure rather than at zero.
  const ledger = useMemo(() => withBalances(rows), [rows]);

  // Years the committee would recognise: those holding entries, plus the one
  // today falls in. Newest first, because that is the one being worked on.
  const offered = useMemo(
    () => usefulCycles(cycles, ledger, todayDmy()).reverse(),
    [cycles, ledger],
  );

  const current = useMemo(
    () => offered.find((c) => String(c.no) === String(pickedCycle)) || offered[0] || null,
    [offered, pickedCycle],
  );

  // No schedule yet means no year boundaries to draw, so the whole ledger is
  // shown rather than an empty screen behind a dropdown with nothing in it.
  const forYear = useMemo(
    () => (current ? rowsIn(ledger, current) : ledger),
    [ledger, current],
  );

  const currentLabel = current ? cycleLabel(current) : 'All entries';

  const totals = useMemo(() => summarise(forYear), [forYear]);
  const drifted = useMemo(() => forYear.filter((r) => r.drift).length, [forYear]);

  const found = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return forYear;
    return forYear.filter((r) => [
      r.date, r.month, r.reason, r.fund_persons,
      rupees(r.credit), rupees(r.debit), rupees(r.balance),
    ].join(' ').toLowerCase().includes(needle));
  }, [forYear, query]);

  const pages = Math.max(1, Math.ceil(found.length / PER_PAGE));
  const shown = Math.min(page, pages);
  const start = (shown - 1) * PER_PAGE;
  const onPage = found.slice(start, start + PER_PAGE);

  useEffect(() => { setPage(1); }, [query, currentLabel]);

  /* ------------------------------------------------------------ actions */

  const save = async (e) => {
    e.preventDefault();
    if (busy || !editing) return;
    if (!editing.date) { toast.error('Nothing to save', 'Pick a date for this entry.'); return; }

    const credit = Number(editing.credit) || 0;
    const debit = Number(editing.debit) || 0;
    if (!credit && !debit) { toast.error('Nothing to save', 'Enter an amount in or out.'); return; }
    if (credit && debit) {
      toast.error('One or the other', 'An entry is money in or money out. Add two entries instead.');
      return;
    }

    setBusy(true);
    // The date goes across as dd-mm-yyyy, the shape the sheet holds.
    const res = await saveFund(token, {
      ...editing, credit, debit, date: toDmy(editing.date),
    });
    setBusy(false);
    if (!res.ok) { toast.error('Could not save the entry', res.error); return; }
    setRows(res.funds || []);
    setEditing(null);
    toast.success('Entry saved', 'Balances after it have been restated.');
  };

  const remove = async () => {
    if (!confirm) return;
    setBusy(true);
    const res = await deleteFund(token, confirm.trnsctn_id);
    setBusy(false);
    const label = confirm.reason || confirm.date;
    setConfirm(null);
    if (!res.ok) { toast.error(`Could not delete ${label}`, res.error); return; }
    setRows(res.funds || []);
    toast.success(`${label} deleted`, 'Hidden from the ledger — the row stays in the sheet.');
  };

  // The statement spans whatever was asked for, not the year on screen — the
  // table is a working view, the statement is a document about a period.
  const chosen = useMemo(() => {
    if (!statement) return null;
    if (statement.mode !== 'cycle') return resolveRange(statement);
    const c = offered.find((x) => String(x.no) === String(statement.cycleNo));
    if (!c) return { from: '', to: '' };
    // A year still running is cut at today, exactly as a month range is.
    const end = c.to && dateKey(c.to) > dateKey(todayDmy()) ? todayDmy() : c.to;
    return { from: c.from, to: end };
  }, [statement, offered]);
  const chosenRows = useMemo(
    () => (chosen ? inRange(ledger, chosen) : []),
    [ledger, chosen],
  );

  const download = async () => {
    if (downloading || !found.length) return;
    setDownloading(true);
    try {
      // Exactly what the table is showing: the fund year chosen, narrowed by
      // any search. A statement that did not match the screen it was taken from
      // would be the one thing nobody could check.
      const span = current
        ? { from: current.from, to: current.to && dateKey(current.to) > dateKey(todayDmy()) ? todayDmy() : current.to }
        : { from: '', to: '' };
      await buildStatement({
        rows: found,
        range: span,
        title: current ? cycleLabel(current) : '',
        filename: `SSGC-funds-${(current ? cycleLabel(current) : 'all').replace(/[^\w]+/g, '-')}.pdf`,
      });
      toast.success('Statement downloaded', current ? cycleLabel(current) : 'All records');
    } catch (err) {
      console.error('Statement failed:', err);
      toast.error('Could not build the statement', err.message);
    } finally {
      setDownloading(false);
    }
  };

  const openStatement = () => setStatement({
    mode: current ? 'cycle' : 'all',
    cycleNo: current ? current.no : '',
    year: String(new Date().getFullYear()),
    fromMonth: '',
    toMonth: '',
    fromDate: '',
    toDate: toIso(todayDmy()),
  });

  /* ------------------------------------------------------------- render */

  if (!configured) {
    return (
      <>
        <div className="admin-page-head"><h1 className="admin-page-title">Annual Funds</h1></div>
        <div className="admin-card admin-wip">
          <span className="admin-wip-icon" aria-hidden="true">🔌</span>
          <h2 className="admin-wip-title">Not connected</h2>
          <p className="admin-wip-text">
            The funds service is not set up yet. Deploy
            <code>GOOGLE_APPS_SCRIPT_FUNDS.js</code> and put its URL in
            <code>sheetsConfig.js</code> under <code>api.funds</code>.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Annual Funds</h1>
          <p className="admin-page-sub">
            What the committee collected and spent in the {currentLabel}
            {current && current.festival && ` · celebrations from ${current.festival}`}
          </p>
        </div>
        <button className="admin-btn" onClick={download} disabled={downloading || !found.length}>
          <IconDownload /> {downloading ? 'Building…' : 'Download statement'}
        </button>
      </div>

      {error && <p className="admin-msg is-error" role="alert">{error}</p>}

      {/* Said plainly rather than silently corrected: the screen recomputes the
          running balance, so a sheet edited by hand can disagree with it. */}
      {drifted > 0 && (
        <p className="admin-msg is-warn" role="status">
          <b>{drifted} row{drifted === 1 ? '' : 's'} carry a balance that does not match the
          arithmetic.</b> The figures here are recomputed from the amounts; saving any entry
          rewrites the sheet's own column to agree.
        </p>
      )}

      {loading ? (
        <TableSkeleton columns={COLUMNS} rows={PER_PAGE} withSelect />
      ) : (
        <>
          <div className="fnd-summary">
            <div className="fnd-stat is-credit">
              <span className="fnd-stat-l">Collected</span>
              <b className="fnd-stat-n">₹{rupees(totals.credit)}</b>
            </div>
            <div className="fnd-stat is-debit">
              <span className="fnd-stat-l">Spent</span>
              <b className="fnd-stat-n">₹{rupees(totals.debit)}</b>
            </div>
            <div className="fnd-stat is-balance">
              <span className="fnd-stat-l">Balance carried</span>
              <b className="fnd-stat-n">₹{rupees(totals.balance)}</b>
            </div>
          </div>

          <div className="admin-card tbl-card">
            <div className="tbl-head">
              <h2 className="tbl-title fnd-history-title">Funds history</h2>

              {isAdmin && (
                <button className="admin-btn" onClick={() => setEditing({ ...blank })} disabled={busy}>
                  <span className="tbl-plus" aria-hidden="true">+</span> Add entry
                </button>
              )}

              {/* Celebration to celebration, not January to December — the
                  ledger's Oct-to-Jul run is one fund year, and a calendar
                  filter cut it in two. */}
              <select
                className="admin-input tbl-select fnd-year-select"
                value={current ? current.no : ''}
                aria-label="Fund year"
                disabled={!offered.length}
                onChange={(e) => setPickedCycle(e.target.value)}
              >
                {offered.length
                  ? offered.map((c) => <option key={c.no} value={c.no}>{cycleLabel(c)}</option>)
                  : <option value="">All entries</option>}
              </select>

              <div className="tbl-search">
                <IconSearch />
                <input
                  className="admin-input"
                  type="search"
                  value={query}
                  placeholder="Search entries…"
                  aria-label="Search entries"
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>

            {forYear.length ? (
              <>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th className="tbl-sno">S.No</th>
                        {isAdmin && <th className="tbl-acts">Actions</th>}
                        <th>Date</th>
                        <th>Month</th>
                        <th>Remarks</th>
                        <th className="fnd-num is-credit">Credited</th>
                        <th className="fnd-num is-debit">Debited</th>
                        <th className="fnd-num is-balance">Balance</th>
                        <th>Fund persons</th>
                      </tr>
                    </thead>
                    <tbody>
                      {onPage.map((r, i) => (
                        <tr key={r.trnsctn_id || `${r.date}-${i}`}>
                          <td className="tbl-sno">{r.sno || start + i + 1}</td>
                          {isAdmin && (
                            <td className="tbl-acts">
                              <div>
                                <button
                                  className="tbl-icon"
                                  aria-label={`Edit ${r.reason || r.date}`}
                                  disabled={busy}
                                  onClick={() => setEditing({
                                    trnsctn_id: r.trnsctn_id,
                                    date: toIso(r.date),
                                    reason: r.reason || '',
                                    credit: r.credit ? String(r.credit) : '',
                                    debit: r.debit ? String(r.debit) : '',
                                    fund_persons: r.fund_persons || '',
                                    annual_year: r.annual_year || '',
                                    annual_yr_id: r.annual_yr_id || '',
                                  })}
                                >
                                  <IconEdit />
                                </button>
                                <button
                                  className="tbl-icon is-danger"
                                  aria-label={`Delete ${r.reason || r.date}`}
                                  disabled={busy}
                                  onClick={() => setConfirm(r)}
                                >
                                  <IconTrash />
                                </button>
                              </div>
                            </td>
                          )}
                          <td className="tbl-nowrap">{r.date || '—'}</td>
                          <td className="tbl-nowrap">{r.month || '—'}</td>
                          <td>{r.reason || '—'}</td>
                          <td className="fnd-num is-credit">{r.credit ? `₹${rupees(r.credit)}` : '—'}</td>
                          <td className="fnd-num is-debit">{r.debit ? `₹${rupees(r.debit)}` : '—'}</td>
                          <td className="fnd-num is-balance">₹{rupees(r.balance)}</td>
                          <td className="fnd-people">{r.fund_persons || '—'}</td>
                        </tr>
                      ))}

                      {!found.length && (
                        <tr>
                          <td className="tbl-none" colSpan={isAdmin ? 9 : 8}>
                            No entry matches “{query.trim()}”.
                          </td>
                        </tr>
                      )}
                    </tbody>

                    {Boolean(found.length) && (
                      <tfoot>
                        <tr className="fnd-total">
                          <td colSpan={isAdmin ? 5 : 4}>Total for the {currentLabel}</td>
                          <td className="fnd-num is-credit">₹{rupees(totals.credit)}</td>
                          <td className="fnd-num is-debit">₹{rupees(totals.debit)}</td>
                          <td className="fnd-num is-balance">₹{rupees(totals.balance)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                <TableFoot
                  from={start + 1} to={start + onPage.length} total={found.length}
                  page={shown} pages={pages} onPage={setPage}
                />
              </>
            ) : (
              <div className="admin-empty">
                <span className="admin-empty-icon" aria-hidden="true">₹</span>
                <h2 className="admin-empty-title">Nothing recorded in the {currentLabel}</h2>
                <p className="admin-empty-text">
                  {isAdmin
                    ? 'Add the first entry — a collection or something the committee spent on.'
                    : 'An administrator has not added any entries for this year yet.'}
                </p>
              </div>
            )}
          </div>
        </>
      )}


      {editing && (
        <Modal onClose={() => setEditing(null)} busy={busy} backdropClass="ed-drawer-scrim">{(titleId) => (
          <form className="ed-drawer" onSubmit={save}>
            <header className="ed-drawer-head">
              <h2 id={titleId}>{editing.trnsctn_id ? `Edit entry ${editing.trnsctn_id}` : 'Add entry'}</h2>
              <button
                type="button" className="ed-drawer-x" aria-label="Close"
                onClick={() => setEditing(null)} disabled={busy}
              >
                ×
              </button>
            </header>

            <div className="ed-drawer-body">
              <label className="ed-field">
                <span className="admin-label">Date</span>
                <input className="admin-input" type="date" value={editing.date}
                       onChange={(e) => setEditing({ ...editing, date: e.target.value })} />
                <span className="ed-split-hint">
                  {editing.date
                    ? `Stored as ${toDmy(editing.date)} · ${monthOf(toDmy(editing.date))} ${yearOf(toDmy(editing.date))}`
                    : 'The year and month columns are written from this date'}
                </span>
              </label>

              {/* Left empty these are worked out from the date against the
                  schedule sheet. Filled in, they are taken as written — the
                  committee's own numbering wins over anything inferred. */}
              <div className="ed-grid">
                <label className="ed-field">
                  <span className="admin-label">Year count</span>
                  <input className="admin-input" inputMode="numeric" value={editing.annual_yr_id}
                         placeholder={current ? String(current.no) : '2'}
                         onChange={(e) => setEditing({ ...editing, annual_yr_id: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
                </label>
                <label className="ed-field">
                  <span className="admin-label">Fund year</span>
                  <input className="admin-input" value={editing.annual_year}
                         placeholder={current && current.annual ? current.annual : '2025 - 2026'}
                         onChange={(e) => setEditing({ ...editing, annual_year: e.target.value })} />
                </label>
              </div>

              <label className="ed-field">
                <span className="admin-label">Remarks</span>
                <input className="admin-input" value={editing.reason} placeholder="November Amount"
                       onChange={(e) => setEditing({ ...editing, reason: e.target.value })} />
              </label>

              {/* Side by side and mutually exclusive: filling one clears the
                  other, because a row that is both would make its own balance
                  ambiguous and the statement unreadable. */}
              <div className="ed-grid">
                <label className="ed-field">
                  <span className="admin-label">Credited (in)</span>
                  <input
                    className="admin-input fnd-in" inputMode="numeric" value={editing.credit}
                    placeholder="3500"
                    onChange={(e) => setEditing({
                      ...editing,
                      credit: e.target.value.replace(/\D/g, '').slice(0, 9),
                      debit: e.target.value ? '' : editing.debit,
                    })}
                  />
                </label>
                <label className="ed-field">
                  <span className="admin-label">Debited (out)</span>
                  <input
                    className="admin-input fnd-out" inputMode="numeric" value={editing.debit}
                    placeholder="2000"
                    onChange={(e) => setEditing({
                      ...editing,
                      debit: e.target.value.replace(/\D/g, '').slice(0, 9),
                      credit: e.target.value ? '' : editing.credit,
                    })}
                  />
                </label>
              </div>

              <label className="ed-field">
                <span className="admin-label">Fund persons</span>
                <input
                  className="admin-input" value={editing.fund_persons}
                  placeholder="Naresh, Rajesh, Gautham"
                  onChange={(e) => setEditing({ ...editing, fund_persons: e.target.value })}
                />
                <span className="ed-split-hint">
                  Comma separated. Left empty for a spend, which nobody paid in for.
                </span>
              </label>

              <p className="admin-readonly-note">
                The balance is not typed. Every entry restates the running total from the
                oldest row down, so a date added in the middle cannot leave the rows after
                it wrong.
              </p>
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
            <h2 id={titleId} className="admin-empty-title">
              Delete {confirm.reason || confirm.date}?
            </h2>
            <p className="admin-empty-text">
              Every balance after it is restated. The row stays in the sheet, so it can be
              brought back by setting <code>a_in</code> to 1.
            </p>
            <div className="admin-btn-row" style={{ justifyContent: 'center', marginTop: 14 }}>
              <button className="admin-btn admin-btn-danger" onClick={remove} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete'}
              </button>
              <button className="admin-btn admin-btn-ghost" onClick={() => setConfirm(null)} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        )}</Modal>
      )}
    </>
  );
};

export default MonthlyFunds;
