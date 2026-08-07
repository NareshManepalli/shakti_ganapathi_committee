import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { useSectionContent } from '../contexts/ContentContext';
import './Schedule.css';

// Weekday, month and time all come from the stored ISO date + 24h time, so a
// single source drives both languages and nothing can drift out of sync.
const parseDate = (isoDate, time) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
};

const ScheduleCard = ({ item, locale, atWord, dayWord, isTelugu }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const when = parseDate(item.date, item.time);

  // The sheet may supply a weekday; blank means derive it from the date, which
  // keeps it from contradicting the date sitting beside it.
  const override = isTelugu ? item.dayTe : item.dayEn;
  const weekday = override || when.toLocaleDateString(locale, { weekday: 'long' });
  // hour12 is forced — the locale default would render 18:30 as "18:30"
  const clock = when.toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const month = when.toLocaleDateString(locale, { month: 'short' });
  const title = isTelugu ? item.titleTe : item.titleEn;

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
          /* No image in the sheet, or it failed to load */
          <span className="sd-media-placeholder" aria-hidden="true">+</span>
        )}
      </div>

      <span className="sd-sep" aria-hidden="true" />

      <div className="sd-body">
        <p className="sd-daycount">{`${dayWord} ${item.day}`}</p>
        <h3 className="sd-title">{title}</h3>
        <p className="sd-when">
          {weekday}
          {atWord ? `, ${atWord} ` : ', '}
          {clock}
        </p>
      </div>

      <span className="sd-sep" aria-hidden="true" />

      <div className="sd-date">
        <span className="sd-month">{month}</span>
        <span className="sd-day">{String(when.getDate()).padStart(2, '0')}</span>
        <span className="sd-year">{when.getFullYear()}</span>
      </div>
    </article>
  );
};

const Schedule = () => {
  const { language } = useLanguage();
  const t = translations[language];
  const { data: schedule, loading } = useSectionContent('schedule');
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

        <div className="schedule-grid">
          {days.map((item) => (
            <ScheduleCard
              key={item.day}
              item={item}
              locale={locale}
              isTelugu={isTelugu}
              atWord={t.scheduleAt}
              dayWord={t.scheduleDay}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Schedule;
