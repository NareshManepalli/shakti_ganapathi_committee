import React, { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { useSectionContent } from '../contexts/ContentContext';
import { getFestivalState, splitDuration, FESTIVAL_DAYS } from '../config/festival';

/**
 * The hero's festival strip. Three states, driven by one date in the sheet:
 *
 *   upcoming  counting down to day 1
 *   ongoing   day 1 to day 9 — "celebrations started", with the day number
 *   ended     after day 9 — renders nothing, so a stale banner can't sit there
 *             for the eleven months until the admin sets next year's date
 *
 * The admin changes `festival` in the content sheet and the strip re-arms
 * itself; no deploy, no code change.
 */
const Countdown = () => {
  const { language } = useLanguage();
  const t = translations[language];
  // Day 1 of the newest year in the schedule sheet IS the next celebration.
  // It used to come from the content sheet's `festival` row, which meant the
  // same fact was typed in two places — set one and not the other and the strip
  // counted down to a day the schedule below it did not list.
  const { data: schedule } = useSectionContent('schedule');

  const dateValue = (schedule && schedule.days && schedule.days[0] && schedule.days[0].date) || '';

  // Recomputed from the clock each tick rather than decremented, so the
  // countdown stays correct after the tab sleeps, and the state flips to
  // "ongoing" on its own the moment day 1 arrives.
  const [state, setState] = useState(() => getFestivalState(dateValue));

  useEffect(() => {
    setState(getFestivalState(dateValue));
    const id = setInterval(() => setState(getFestivalState(dateValue)), 1000);
    return () => clearInterval(id);
  }, [dateValue]);

  if (!state || state.phase === 'ended') return null;

  if (state.phase === 'ongoing') {
    return (
      <div className="home-countdown">
        <div className="home-countdown-inner is-ongoing">
          <span className="countdown-label">{t.celebrationsStarted}</span>
          <span className="countdown-dayof">
            {`${t.scheduleDay} ${state.dayNumber} / ${FESTIVAL_DAYS}`}
          </span>
        </div>
      </div>
    );
  }

  const left = splitDuration(state.msLeft);
  const units = [
    { key: 'days', value: left.days, label: t.countdownDays },
    { key: 'hours', value: left.hours, label: t.countdownHours },
    { key: 'minutes', value: left.minutes, label: t.countdownMinutes },
    { key: 'seconds', value: left.seconds, label: t.countdownSeconds },
  ];

  return (
    <div className="home-countdown">
      <div className="home-countdown-inner">
        <span className="countdown-label">{t.celebrationStartsIn}</span>
        <div className="countdown-units">
          {units.map((unit) => (
            <div className="countdown-unit" key={unit.key}>
              <span className="countdown-value">
                {String(unit.value).padStart(2, '0')}
              </span>
              <span className="countdown-unit-label">{unit.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Countdown;
