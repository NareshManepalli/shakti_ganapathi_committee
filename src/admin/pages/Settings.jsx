import React, { useEffect, useState } from 'react';
import { useAdminData } from '../useAdminData';
import { saveContent } from '../contentApi';
import { useToast } from '../ToastContext';
import { EditorPage } from './EditorShell';
import { getFestivalState, FESTIVAL_DAYS, splitDuration } from '../../config/festival';

// The one setting the committee actually has to change: the festival date.
//
// Vinayaka Chavithi moves every year, so it lives in the content sheet rather
// than in code — set it here and the hero countdown re-arms itself, with no
// developer involved. Everything else on the public site is either content or
// a fixed rule, so there is nothing else to put on this screen yet.
const Settings = () => {
  const { content, loading, error, merge, token } = useAdminData();
  const toast = useToast();

  const row = content.find((r) => String(r.section).trim().toLowerCase() === 'festival');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (row) setDate(String(row.content_en || '').trim().slice(0, 10));
  }, [row]);

  const dirty = row && date !== String(row.content_en || '').trim().slice(0, 10);
  const state = getFestivalState(date);

  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error('That is not a date', 'Pick the first day of the festival.');
      return;
    }
    setBusy(true);
    // Both languages hold the same ISO date — the strip formats it per language.
    const res = await saveContent(token, 'festival', { content_en: date, content_te: date });
    setBusy(false);
    if (!res.ok) { toast.error('Could not save the date', res.error); return; }
    merge({ content: res.content });
    toast.success('Festival date saved', 'The countdown on the home page re-arms itself.');
  };

  const describe = () => {
    if (!state) return 'No date set.';
    if (state.phase === 'upcoming') {
      const d = splitDuration(state.msLeft);
      return `Counting down — ${d.days} days, ${d.hours} hours to go.`;
    }
    if (state.phase === 'ongoing') {
      return `Celebrations are running — day ${state.dayNumber} of ${FESTIVAL_DAYS}.`;
    }
    return `This festival has finished. Set next year's date to start the countdown again.`;
  };

  return (
    <EditorPage
      title="Settings"
      subtitle="The festival date that drives the countdown on the home page"
      loading={loading}
      error={error}
    >
      <form className="admin-card" onSubmit={save}>
        {/* Date and button on one line: there is a single field here, and
            stacking the only button under it left the card mostly empty. */}
        <div className="set-row">
          <label className="ed-field">
            <span className="admin-label">First day of the festival:</span>
            <input
              className="admin-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>

          <button className="admin-btn" type="submit" disabled={busy || !dirty}>
            {busy ? 'Updating…' : 'Update'}
          </button>
        </div>

        <p className={`ed-state set-state${state && state.phase === 'ended' ? ' is-warn' : ''}`}>
          {describe()}
        </p>

        <p className="admin-readonly-note set-note">
          The celebrations run for {FESTIVAL_DAYS} days from this date. During them the home
          page says <i>Celebrations Started</i> with the day number; afterwards the strip
          hides itself until you set the next year.
        </p>
      </form>
    </EditorPage>
  );
};

export default Settings;
