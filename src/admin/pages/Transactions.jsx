import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ToastContext';
import { TableFoot, TableSkeleton } from './EditorShell';
import {
  IconTrash, IconEdit, IconSearch, IconDownload,
  IconFunds, IconIn, IconOut, IconBalance,
} from '../icons';
import Modal from '../../components/Modal';
import {
  isFundsConfigured, yearOf, monthOf, toDmy, toIso, rupees,
  withBalances, todayDmy, dateKey,
} from '../fundsApi';
import {
  fetchTxns, saveTxn, deleteTxn,
  summariseTxns, warningFor, effectOf,
  amountLabelFor, partyLabelFor, KINDS, MODES, LOW_BALANCE,
} from '../txnApi';
import { buildStatement } from '../fundsStatement';
import { buildCycles, cycleLabel, rowsIn, usefulCycles } from '../fundsCycles';
import { fetchSheetRows } from '../../utils/sheetService';
import { SHEETS_CONFIG } from '../../config/sheetsConfig';

const PER_PAGE = 5;

const COLUMNS = [
  { cls: 'tbl-sno', w: '60%' }, { cls: 'tbl-acts', w: '70%' },
  { w: '70%' }, { w: '85%' }, { w: '75%' }, { w: '50%' }, { w: '55%' }, { w: '55%' }, { w: '60%' },
];

const blank = {
  trnsctn_id: '', date: '', kind: 'spend', amount: '',
  reason: '', paid_to: '', mode: 'Cash',
  annual_year: '', annual_yr_id: '', mirror: true,
};

/**
 * The working pot for a celebration.
 *
 * The fund is what the committee collected over the year; this is what they
 * spend from during it. The two are one movement apart — the opening row here
 * is a transfer out of the fund, and saving it writes that debit into the funds
 * sheet in the same call, so the money is never counted in both books.
 *
 * Four cards and a bar, not one or the other. The cards are the same four the
 * fund screen carries, so the two money screens are read the same way; the bar
 * under them answers the question four figures cannot — how far through the pot
 * the committee is — and carries the three points of that scale rather than
 * repeating the amounts a second time.
 */
const Transactions = () => {
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

  const load = useCallback(async () => {
    if (!configured || !token) { setLoading(false); return; }
    setLoading(true);
    const res = await fetchTxns(token);
    setLoading(false);
    if (!res.ok) { setError(res.error || 'Could not read the transactions.'); return; }
    setError('');
    setRows(res.txns || []);
  }, [configured, token]);

  useEffect(() => { load(); }, [load]);

  // The same fund years the funds screen offers, from the same public schedule
  // sheet — so "2nd year (2025 - 2026)" means one thing across the portal.
  useEffect(() => {
    let alive = true;
    fetchSheetRows(SHEETS_CONFIG.sections && SHEETS_CONFIG.sections.schedule)
      .then((r) => { if (alive) setCycles(buildCycles(r)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const ledger = useMemo(() => withBalances(rows), [rows]);

  const offered = useMemo(
    () => usefulCycles(cycles, ledger, todayDmy()).reverse(),
    [cycles, ledger],
  );

  const current = useMemo(
    () => offered.find((c) => String(c.no) === String(pickedCycle)) || offered[0] || null,
    [offered, pickedCycle],
  );

  const forYear = useMemo(
    () => (current ? rowsIn(ledger, current) : ledger),
    [ledger, current],
  );

  const currentLabel = current ? cycleLabel(current) : 'All entries';
  const totals = useMemo(() => summariseTxns(forYear), [forYear]);
  const warning = warningFor(totals);

  // The spent marker is centred on the fill's edge, except at the two ends
  // where centring would hang it off the bar — nothing spent yet, or all of it.
  const markerPull = totals.percent < 12 ? '0%' : totals.percent > 88 ? '-100%' : '-50%';

  const found = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return forYear;
    return forYear.filter((r) => [
      r.date, r.month, r.reason, r.paid_to, r.mode,
      rupees(r.credit), rupees(r.debit), rupees(r.balance),
    ].join(' ').toLowerCase().includes(needle));
  }, [forYear, query]);

  const pages = Math.max(1, Math.ceil(found.length / PER_PAGE));
  const shown = Math.min(page, pages);
  const start = (shown - 1) * PER_PAGE;
  const onPage = found.slice(start, start + PER_PAGE);

  useEffect(() => { setPage(1); }, [query, currentLabel]);

  // Only one opening a year, so the drawer offers the choice only when there
  // is not one already — the script refuses a second, and a control that
  // cannot succeed is worse than no control.
  const openingRow = useMemo(
    () => forYear.find((r) => String(r.kind || '').toLowerCase() === 'opening') || null,
    [forYear],
  );

  /* ------------------------------------------------------------ actions */

  const save = async (e) => {
    e.preventDefault();
    if (busy || !editing) return;
    if (!editing.date) { toast.error('Nothing to save', 'Pick a date for this transaction.'); return; }

    const amount = Number(String(editing.amount || '').replace(/\D/g, '')) || 0;
    if (!amount) { toast.error('Nothing to save', 'Enter an amount.'); return; }
    if (!editing.reason.trim()) { toast.error('Nothing to save', 'Say what this was for.'); return; }

    setBusy(true);
    const res = await saveTxn(token, {
      ...editing,
      date: toDmy(editing.date),
      credit: editing.kind === 'spend' ? 0 : amount,
      debit: editing.kind === 'spend' ? amount : 0,
    });
    setBusy(false);
    if (!res.ok) { toast.error('Could not save the transaction', res.error); return; }
    setRows(res.txns || []);
    setEditing(null);
    toast.success(
      'Transaction saved',
      editing.kind === 'opening' && editing.mirror !== false
        ? 'Recorded as a transfer out of the annual fund too.'
        : 'Balances after it have been restated.',
    );
  };

  const remove = async () => {
    if (!confirm) return;
    setBusy(true);
    const res = await deleteTxn(token, confirm.trnsctn_id);
    setBusy(false);
    const label = confirm.reason || confirm.date;
    setConfirm(null);
    if (!res.ok) { toast.error(`Could not delete ${label}`, res.error); return; }
    setRows(res.txns || []);
    toast.success(`${label} deleted`, 'Hidden from the ledger — the row stays in the sheet.');
  };

  const download = async () => {
    if (downloading || !found.length) return;
    setDownloading(true);
    try {
      const span = current
        ? { from: current.from, to: current.to && dateKey(current.to) > dateKey(todayDmy()) ? todayDmy() : current.to }
        : { from: '', to: '' };
      await buildStatement({
        rows: found,
        range: span,
        title: current ? cycleLabel(current) : '',
        variant: 'txn',
        filename: `SSGC-transactions-${(current ? cycleLabel(current) : 'all').replace(/[^\w]+/g, '-')}.pdf`,
      });
      toast.success('Statement downloaded', current ? cycleLabel(current) : 'All records');
    } catch (err) {
      console.error('Statement failed:', err);
      toast.error('Could not build the statement', err.message);
    } finally {
      setDownloading(false);
    }
  };

  const openNew = (kind) => setEditing({
    ...blank,
    kind: kind || (openingRow ? 'spend' : 'opening'),
    date: toIso(todayDmy()),
    annual_yr_id: current ? String(current.no) : '',
    annual_year: current && current.annual ? current.annual : '',
  });

  const openEdit = (r) => setEditing({
    trnsctn_id: r.trnsctn_id,
    date: toIso(r.date),
    kind: String(r.kind || (r.credit ? 'credit' : 'spend')).toLowerCase(),
    amount: String(r.credit || r.debit || ''),
    reason: r.reason || '',
    paid_to: r.paid_to || '',
    mode: r.mode || 'Cash',
    annual_year: r.annual_year || '',
    annual_yr_id: r.annual_yr_id || '',
    mirror: true,
    // What this row already contributes, so the effect line replaces it rather
    // than adding to it while an amount is being corrected.
    __wasCredit: Number(r.credit) || 0,
    __wasDebit: Number(r.debit) || 0,
  });

  const effect = useMemo(() => effectOf(totals, editing), [totals, editing]);

  /* -------------------------------------------------------------- render */

  if (!configured) {
    return (
      <>
        <div className="admin-page-head"><h1 className="admin-page-title">Transactions</h1></div>
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
          <h1 className="admin-page-title">Transactions</h1>
          <p className="admin-page-sub">
            What the working pot holds and where it has gone — {currentLabel}
          </p>
        </div>
      </div>

      {error && <p className="admin-msg is-error" role="alert">{error}</p>}

      {loading ? (
        <TableSkeleton columns={COLUMNS} rows={PER_PAGE} withSelect />
      ) : (
        <>
          {totals.pot ? (
            <>
              {/* The same four cards the fund screen carries, so the two money
                  screens are read the same way — and the pot's four figures are
                  the fund's four questions asked of a smaller purse. */}
              <div className="fnd-summary">
                {[
                  { k: 'year', Ico: IconFunds, l: 'Opening amount', v: totals.opening },
                  { k: 'credit', Ico: IconIn, l: 'Total credited amount', v: totals.credits },
                  { k: 'debit', Ico: IconOut, l: 'Total spending amount', v: totals.spent },
                  { k: 'balance', Ico: IconBalance, l: 'Total amount left', v: totals.left },
                ].map(({ k, Ico, l, v }) => (
                  <article className={`fnd-card is-${k}`} key={k}>
                    <span className="fnd-card-ico" aria-hidden="true"><Ico /></span>
                    <div className="fnd-card-body">
                      <span className="fnd-card-l">{l}</span>
                      <b className="fnd-card-v">₹{rupees(v)}</b>
                    </div>
                    <span className="fnd-card-disc" aria-hidden="true" />
                  </article>
                ))}
              </div>

              {/* The bar carries no figures of its own now. The cards above say
                  what the amounts are; this says how far through them the
                  committee is, which is the one thing four numbers cannot show
                  at a glance. */}
              <section className={`admin-card txn-progress is-${totals.state}`}>
                {/* All three figures above the bar, each on a tick that points
                    at the place on it they describe: nothing at the left, what
                    has gone at the edge of the fill, everything the pot holds
                    at the right. Read together they say "we had this, we have
                    spent that" without a sentence. */}
                <div className="txn-scale">
                  <span className="txn-tick is-start">₹0</span>
                  <span
                    className="txn-tick txn-bar-at"
                    style={{ left: `${totals.percent}%`, transform: `translateX(${markerPull})` }}
                  >
                    ₹{rupees(totals.spent)}
                  </span>
                  <span className="txn-tick is-end">₹{rupees(totals.pot)}</span>

                  <div
                    className="txn-bar"
                    role="progressbar"
                    aria-valuenow={totals.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`₹${rupees(totals.spent)} of ₹${rupees(totals.pot)} spent`}
                  >
                    <span style={{ width: `${totals.percent}%` }} />
                  </div>
                </div>

                {warning && (
                  <p className="txn-warn" role="status">
                    <b>{totals.state === 'over' ? 'The pot is overspent.' : 'Balance is getting low.'}</b>
                    {' '}{warning}
                  </p>
                )}
              </section>
            </>
          ) : (
            <section className="admin-card txn-progress">
              <div className="txn-empty">
                <b>Nothing in the pot yet.</b>
                <span>
                  The {currentLabel} starts with an opening amount moved across from the annual
                  fund. Everything after it is counted against that.
                </span>
                {isAdmin && (
                  <button className="admin-btn" onClick={() => openNew('opening')}>
                    Set the opening amount
                  </button>
                )}
              </div>
            </section>
          )}

          <div className="fnd-toolbar">
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

            <button className="admin-btn" onClick={download} disabled={downloading || !found.length}>
              <IconDownload /> {downloading ? 'Building…' : 'Download statement'}
            </button>
          </div>

          <div className="admin-card tbl-card">
            <div className="tbl-head">
              <h2 className="tbl-title fnd-history-title">Transaction history</h2>

              {isAdmin && (
                <button className="admin-btn" onClick={() => openNew()} disabled={busy}>
                  <span className="tbl-plus" aria-hidden="true">+</span> Add transaction
                </button>
              )}

              <div className="tbl-search">
                <IconSearch />
                <input
                  className="admin-input"
                  type="search"
                  value={query}
                  aria-label="Search transactions"
                  placeholder="Search transactions…"
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>

            {found.length ? (
              <>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th className="tbl-sno">S.No</th>
                        {isAdmin && <th className="tbl-acts">Actions</th>}
                        <th>Date</th>
                        <th className="txn-reason">Remarks</th>
                        <th className="txn-party">Paid to</th>
                        <th>Mode</th>
                        <th className="fnd-num is-credit">Credited</th>
                        <th className="fnd-num is-debit">Debited</th>
                        <th className="fnd-num is-balance">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {onPage.map((r, i) => {
                        const isOpening = String(r.kind || '').toLowerCase() === 'opening';
                        return (
                          <tr key={r.trnsctn_id || `${r.date}-${i}`}>
                            <td className="tbl-sno">{start + i + 1}</td>
                            {isAdmin && (
                              <td className="tbl-acts">
                                <div>
                                  <button
                                    className="tbl-icon"
                                    aria-label={`Edit ${r.reason || r.date}`}
                                    disabled={busy}
                                    onClick={() => openEdit(r)}
                                  >
                                    <IconEdit />
                                  </button>
                                  {/* The opening cannot go while the year stands
                                      on it — every balance below is measured
                                      from that figure. */}
                                  <button
                                    className="tbl-icon is-danger"
                                    aria-label={`Remove ${r.reason || r.date}`}
                                    title={isOpening && forYear.length > 1
                                      ? 'The opening amount cannot be removed while transactions stand on it'
                                      : 'Remove'}
                                    disabled={busy || (isOpening && forYear.length > 1)}
                                    onClick={() => setConfirm(r)}
                                  >
                                    <IconTrash />
                                  </button>
                                </div>
                              </td>
                            )}
                            <td className="tbl-nowrap">{r.date || '—'}</td>
                            <td className="txn-reason">
                              {r.reason || '—'}
                              {isOpening && <span className="ed-chip">opening</span>}
                            </td>
                            <td className="txn-party">{r.paid_to || '—'}</td>
                            <td className="tbl-nowrap">{r.mode || '—'}</td>
                            <td className="fnd-num is-credit">{r.credit ? `₹${rupees(r.credit)}` : '—'}</td>
                            <td className="fnd-num is-debit">{r.debit ? `₹${rupees(r.debit)}` : '—'}</td>
                            <td className="fnd-num is-balance">₹{rupees(r.balance)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <TableFoot
                  from={start + 1}
                  to={start + onPage.length}
                  total={found.length}
                  page={shown}
                  pages={pages}
                  onPage={setPage}
                />
              </>
            ) : (
              <p className="tbl-none">
                {query.trim()
                  ? `No transaction matches “${query.trim()}”.`
                  : 'No transactions in this fund year yet.'}
              </p>
            )}
          </div>
        </>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)} busy={busy} backdropClass="ed-drawer-scrim">{(titleId) => (
          <form className="ed-drawer" onSubmit={save}>
            <header className="ed-drawer-head">
              <h2 id={titleId}>
                {editing.trnsctn_id ? `Edit ${editing.trnsctn_id}` : 'Add transaction'}
              </h2>
              <button
                type="button" className="ed-drawer-x" aria-label="Close"
                onClick={() => setEditing(null)} disabled={busy}
              >
                ×
              </button>
            </header>

            <div className="ed-drawer-body">
              {/* First, because it decides what every field under it means. */}
              <div className="ed-field">
                <span className="admin-label">Type</span>
                <div className="txn-kind">
                  {KINDS.map((k) => {
                    // An opening already exists for this year: offering a second
                    // would only earn a refusal from the script.
                    const barred = k.key === 'opening' && openingRow
                      && openingRow.trnsctn_id !== editing.trnsctn_id;
                    return (
                      <label
                        key={k.key}
                        className={`txn-kind-opt${k.key === 'credit' ? ' is-in' : ''}${k.key === 'spend' ? ' is-out' : ''}`}
                        title={barred ? 'This fund year already has an opening amount' : undefined}
                      >
                        <input
                          type="radio"
                          name="txn-kind"
                          value={k.key}
                          disabled={barred}
                          checked={editing.kind === k.key}
                          onChange={() => setEditing({ ...editing, kind: k.key })}
                        />
                        <span>{k.label}</span>
                      </label>
                    );
                  })}
                </div>
                <span className="ed-split-hint">
                  One opening a year, then money in and money out against it.
                </span>
              </div>

              <label className="ed-field">
                <span className="admin-label">Date</span>
                <input
                  className="admin-input" type="date" value={editing.date}
                  onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                />
                <span className="ed-split-hint">
                  {editing.date
                    ? `Stored as ${toDmy(editing.date)} · ${monthOf(toDmy(editing.date))} ${yearOf(toDmy(editing.date))}`
                    : 'The year and month columns are written from this date'}
                </span>
              </label>

              <div className="ed-grid">
                <label className="ed-field">
                  <span className="admin-label">Year count</span>
                  <input
                    className="admin-input" inputMode="numeric" value={editing.annual_yr_id}
                    placeholder={current ? String(current.no) : '2'}
                    onChange={(e) => setEditing({
                      ...editing, annual_yr_id: e.target.value.replace(/\D/g, '').slice(0, 3),
                    })}
                  />
                </label>
                <label className="ed-field">
                  <span className="admin-label">Fund year</span>
                  <input
                    className="admin-input" value={editing.annual_year}
                    placeholder={current && current.annual ? current.annual : '2025 - 2026'}
                    onChange={(e) => setEditing({ ...editing, annual_year: e.target.value })}
                  />
                </label>
              </div>

              {/* One box, not two. The type has already said which way the money
                  went, so a row that is both cannot be typed here at all. */}
              <label className="ed-field">
                <span className="admin-label">{amountLabelFor(editing.kind)}</span>
                <input
                  className={`admin-input ${editing.kind === 'spend' ? 'fnd-out' : 'fnd-in'}`}
                  inputMode="numeric"
                  value={editing.amount}
                  placeholder="3500"
                  onChange={(e) => setEditing({
                    ...editing, amount: e.target.value.replace(/\D/g, '').slice(0, 9),
                  })}
                />
              </label>

              <label className="ed-field">
                <span className="admin-label">Remarks</span>
                <input
                  className="admin-input" value={editing.reason}
                  placeholder={editing.kind === 'opening' ? 'Opening amount from annual funds' : 'Decoration material'}
                  onChange={(e) => setEditing({ ...editing, reason: e.target.value })}
                />
                <span className="ed-split-hint">What it was for. This is the column the statement prints.</span>
              </label>

              {/* A transfer between the committee's own books is not paid to
                  anyone, so the field steps aside rather than sitting empty. */}
              {editing.kind !== 'opening' && (
                <label className="ed-field">
                  <span className="admin-label">{partyLabelFor(editing.kind)}</span>
                  <input
                    className="admin-input" value={editing.paid_to}
                    placeholder={editing.kind === 'credit' ? 'Sri Ramesh Kumar' : 'Sri Lakshmi Traders'}
                    onChange={(e) => setEditing({ ...editing, paid_to: e.target.value })}
                  />
                </label>
              )}

              <label className="ed-field">
                <span className="admin-label">Mode</span>
                <select
                  className="admin-input" value={editing.mode}
                  onChange={(e) => setEditing({ ...editing, mode: e.target.value })}
                >
                  {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>

              {editing.kind === 'opening' && (
                <label className="ed-field txn-mirror">
                  <input
                    type="checkbox"
                    checked={editing.mirror !== false}
                    onChange={(e) => setEditing({ ...editing, mirror: e.target.checked })}
                  />
                  <span>
                    <b>Also record this as a spend in Annual Funds.</b>
                    {' '}Leave it on unless the transfer is already entered there — without it the
                    same money is counted in both books.
                  </span>
                </label>
              )}

              {/* The consequence, before it is committed. */}
              {effect && (
                <p className={`txn-effect is-${effect.state}`}>
                  <b>Leaves ₹{rupees(effect.left)} in the pot.</b>
                  {effect.state === 'over' && ' That is more than the pot holds.'}
                  {effect.state === 'low' && ` Under the ₹${rupees(LOW_BALANCE)} mark.`}
                </p>
              )}
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
              Remove {confirm.reason || confirm.date}?
            </h2>
            <p className="admin-empty-text">
              Every balance after it will be restated. The row stays in the sheet, hidden.
            </p>
            <div className="admin-btn-row" style={{ justifyContent: 'center', marginTop: 14 }}>
              <button className="admin-btn admin-btn-ghost" onClick={() => setConfirm(null)} disabled={busy}>
                Cancel
              </button>
              <button className="admin-btn admin-btn-danger" onClick={remove} disabled={busy}>
                {busy ? 'Removing…' : 'Delete'}
              </button>
            </div>
          </div>
        )}</Modal>
      )}
    </>
  );
};

export default Transactions;
