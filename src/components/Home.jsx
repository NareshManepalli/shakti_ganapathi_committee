import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import './Home.css';

const Home = () => {
  const { language } = useLanguage();
  const t = translations[language];

  // Generate stars for the background
  const stars = Array.from({ length: 150 }, (_, i) => i);
  const sparkles = Array.from({ length: 50 }, (_, i) => i);

  return (
    <div id="home" className="home-hero">
      {/* Starry Background */}
      <div className="stars-background">
        {stars.map((star) => (
          <div
            key={star}
            className="star"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 3}s`
            }}
          />
        ))}
      </div>

      {/* Golden Sparkles/Lights */}
      <div className="sparkles-container">
        {sparkles.map((sparkle) => (
          <div
            key={sparkle}
            className="sparkle"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${3 + Math.random() * 2}s`
            }}
          />
        ))}
      </div>

      {/* Golden Light Arc Effect */}
      {/* <div className="golden-light-arc"></div> */}

      {/* Decorative Corner Elements */}
      {/* <div className="corner-decoration corner-top-left"></div>
      <div className="corner-decoration corner-top-right"></div> */}

      <div className="home-container">
        {/* Committee Name */}
        <div className="committee-name-wrapper">
          <h1 className="committee-name">{t.committeeName}</h1>
          <div className="golden-line"></div>
        </div>

        {/* Ganesha Image with Golden Couch */}
        <div className="ganesha-wrapper">
          <div className="golden-couch">
            <img 
              src="/assets/ganesh.png" 
              alt="Lord Ganesha" 
              className="ganesha-image"
              onError={(e) => {
                e.target.style.display = 'none';
                const placeholder = e.target.nextElementSibling;
                if (placeholder) {
                  placeholder.style.display = 'flex';
                }
              }}
            />
            <div className="image-placeholder">
              <div className="placeholder-icon">🕉️</div>
            </div>
          </div>
        </div>

        {/* Reflective Floor with Lotus Motifs */}
        <div className="reflective-floor">
          <div className="lotus-decoration lotus-left"></div>
          <div className="lotus-decoration lotus-right"></div>
          {/* <div className="golden-string-lights"></div> */}
        </div>
      </div>
    </div>
  );
};

export default Home;

