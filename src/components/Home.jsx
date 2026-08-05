import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import hmBg from '../assets/hm_bg.png';
import idolImg from '../assets/bot2.png';
import titleEng from '../assets/title_eng.png';
import titleTel from '../assets/title_tel.png';
import { FESTIVAL_START } from '../config/festival';
import './Home.css';

const getTimeLeft = (target) => {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, over: true };
  }
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    over: false,
  };
};

const Home = () => {
  const { language } = useLanguage();
  const t = translations[language];

  // The committee name is artwork, not text — one file per language.
  const titleImg = language === 'te' ? titleTel : titleEng;

  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(FESTIVAL_START));

  useEffect(() => {
    // Recompute from the clock each tick rather than decrementing, so the
    // countdown stays correct after the tab sleeps or the interval slips.
    const id = setInterval(() => setTimeLeft(getTimeLeft(FESTIVAL_START)), 1000);
    return () => clearInterval(id);
  }, []);

  const units = [
    { key: 'days', value: timeLeft.days, label: t.countdownDays },
    { key: 'hours', value: timeLeft.hours, label: t.countdownHours },
    { key: 'minutes', value: timeLeft.minutes, label: t.countdownMinutes },
    { key: 'seconds', value: timeLeft.seconds, label: t.countdownSeconds },
  ];

  return (
    <section
      id="home"
      className="home-hero"
      style={{ backgroundImage: `url(${hmBg})` }}
    >
      {/* Committee name — image, swapped by language */}
      <div className="home-title">
        <img src={titleImg} alt={t.committeeName} className="home-title-img" />
      </div>

      {/* Ganesha — rests on the stone stage baked into the background */}
      <div className="home-idol">
        <img src={idolImg} alt="" className="home-idol-img" />
      </div>

      {/* Countdown to day 1 */}
      <div className="home-countdown">
        <div className="home-countdown-inner">
          <span className="countdown-label">
            {timeLeft.over ? t.celebrationsBegun : t.celebrationStartsIn}
          </span>
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
    </section>
  );
};

export default Home;
