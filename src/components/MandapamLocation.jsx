import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import './MandapamLocation.css';

const MandapamLocation = () => {
  const { language } = useLanguage();
  const t = translations[language];

  // Replace with your actual Google Maps embed URL or coordinates
  const mapEmbedUrl = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3806.1234567890!2d78.1234567890!3d17.1234567890!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTfCsDA3JzI0LjQiTiA3OMKwMDcnMjQuNCJF!5e0!3m2!1sen!2sin!4v1234567890123!5m2!1sen!2sin";

  return (
    <section id="location" className="mandapam-location-section">
      <div className="mandapam-container">
        <h2 className="mandapam-title">{t.mandapamLocation}</h2>
        <p className="mandapam-subtitle">{t.mandapamSubtitle}</p>
        
        <div className="map-container">
          <iframe
            src={mapEmbedUrl}
            width="100%"
            height="100%"
            style={{ border: 0 }}
            allowFullScreen=""
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="Mandapam Location"
            className="google-map"
          ></iframe>
        </div>
      </div>
    </section>
  );
};

export default MandapamLocation;


