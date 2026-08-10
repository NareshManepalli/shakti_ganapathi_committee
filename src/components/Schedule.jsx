import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { useSectionContent } from '../contexts/ContentContext';
import { SectionMessage } from './SectionState';
import logoImg from '../assets/logo.png';
import './Schedule.css';

// Weekday, month and time all come from the stored ISO date + 24h time, so a
// single source drives both languages and nothing can drift out of sync.
//
// Date and time are read apart, because a year gets dated before it is planned:
// the committee fixes the nine days first and decides what happens on each of
// them later. Parsed together, a day with no time yet built an Invalid Date and
// took the month, the date and the weekday down with it — the card came out as
// NaN in four places over a date that was perfectly good.
const DASH = '—';

const parseDate = (isoDate) => {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(isoDate || '').trim());
  if (!m) return null;
  const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(at.getTime()) ? null : at;
};

const parseTime = (time) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  return hh > 23 || mm > 59 ? null : { hh, mm };
};

const ScheduleCard = ({ item, locale, atWord, dayWord, tbdWord, isTelugu }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const when = parseDate(item.date);
  const at = parseTime(item.time);

  // The sheet may supply a weekday; blank means derive it from the date, which
  // keeps it from contradicting the date sitting beside it.
  const override = isTelugu ? item.dayTe : item.dayEn;
  const weekday = override || (when ? when.toLocaleDateString(locale, { weekday: 'long' }) : '');

  // hour12 is forced — the locale default would render 18:30 as "18:30"
  const clock = at
    ? new Date(2000, 0, 1, at.hh, at.mm).toLocaleTimeString(locale, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    : '';

  // Weekday and time each stand on their own, so one being undecided does not
  // hide the other. With no time set the "at" is dropped as well — "Monday, at
  // —" reads as a mistake in a way that "Monday, —" does not.
  const whenLine = weekday
    ? (clock ? `${weekday}${atWord ? `, ${atWord} ` : ', '}${clock}` : `${weekday}, ${DASH}`)
    : (clock || DASH);

  const month = when ? when.toLocaleDateString(locale, { month: 'short' }) : DASH;
  // A dated day with nothing decided on it yet says so, rather than carrying a
  // blank heading where a name is about to go.
  const title = (isTelugu ? item.titleTe : item.titleEn) || tbdWord || DASH;

  return (
    <article className="sd-card">
      <div className="sd-media">
        {item.image && !imageFailed ? (
          <img
            src={item.image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
          />
        ) : (
          /* No image in the sheet, or it failed to load. The committee emblem
             held back, rather than a "+" that reads as a control you can press. */
          <img className="sd-media-fallback" src={logoImg} alt="" aria-hidden="true" />
        )}
      </div>

      <span className="sd-sep" aria-hidden="true" />

      <div className="sd-body">
        <p className="sd-daycount">{`${dayWord} ${item.day}`}</p>
        <h3 className="sd-title">{title}</h3>
        <p className="sd-when">{whenLine}</p>
      </div>

      <span className="sd-sep" aria-hidden="true" />

      <div className="sd-date">
        <span className="sd-month">{month}</span>
        <span className="sd-day">{when ? String(when.getDate()).padStart(2, '0') : DASH}</span>
        <span className="sd-year">{when ? when.getFullYear() : ''}</span>
      </div>
    </article>
  );
};

const Schedule = () => {
  const { language } = useLanguage();
  const t = translations[language];
  const { data: schedule, error, loading, reload } = useSectionContent('schedule');
  const locale = language === 'te' ? 'te-IN' : 'en-US';
  const isTelugu = language === 'te';

  const days = (schedule && schedule.days) || [];
  // Taken from the rows themselves, so the heading can never disagree with the
  // dates underneath it.
  const year = (schedule && schedule.year) || new Date().getFullYear();

  if (loading) {
    return (
      <section id="schedule" className="schedule-section" aria-busy="true">
        <div className="schedule-container">
          <div className="skeleton-head">
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-subtitle" />
          </div>
          <div className="schedule-grid">
            {Array.from({ length: 9 }, (_, i) => (
              <div className="sd-card" key={i}>
                <span className="skeleton sd-skel-media" />
                <span className="sd-sep" aria-hidden="true" />
                <div className="sd-body">
                  <span className="skeleton skeleton-line is-short" />
                  <span className="skeleton skeleton-line" />
                  <span className="skeleton skeleton-line is-mid" />
                </div>
                <span className="sd-sep" aria-hidden="true" />
                <span className="skeleton sd-skel-date" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="schedule" className="schedule-section">
      <div className="schedule-container">
        <h2 className="schedule-title">{`${year} ${t.scheduleEvents}`}</h2>
        <p className="schedule-subtitle">{t.scheduleSubtitle}</p>

        {!days.length && (
          <SectionMessage tone={error ? 'error' : 'empty'} onRetry={error ? reload : undefined} />
        )}

        <div className="schedule-grid">
          {days.map((item) => (
            <ScheduleCard
              key={item.day}
              item={item}
              locale={locale}
              isTelugu={isTelugu}
              atWord={t.scheduleAt}
              dayWord={t.scheduleDay}
              tbdWord={t.scheduleTbd}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Schedule;
