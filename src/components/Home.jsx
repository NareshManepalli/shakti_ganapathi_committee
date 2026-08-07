import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import hmBg from '../assets/hm_bg.png';
import idolImg from '../assets/bot2.png';
import titleEng from '../assets/title_eng.png';
import titleTel from '../assets/title_tel.png';
import Countdown from './Countdown';
import './Home.css';

const Home = () => {
  const { language } = useLanguage();
  const t = translations[language];

  // The committee name is artwork, not text — one file per language.
  const titleImg = language === 'te' ? titleTel : titleEng;

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

      <Countdown />
    </section>
  );
};

export default Home;
