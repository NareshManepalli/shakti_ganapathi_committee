import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import logoImg from '../assets/logo.png';
import './FundsGate.css';

// The committee-only doorway, sitting under Mandapam Location as the last thing
// on the public page. A quiet card rather than a call to action — most visitors
// have no business here, so it should read as a staff door, not a button.
const FundsGate = () => {
  const { language } = useLanguage();
  const t = translations[language];
  const navigate = useNavigate();

  const open = () => navigate('/funds');

  return (
    <section className="funds-gate" id="funds">
      <button
        type="button"
        className="funds-gate-card"
        onClick={open}
        aria-label={`${t.committeeName} — ${t.fundsGateAction}`}
      >
        <span className="funds-gate-emblem">
          <img src={logoImg} alt="" />
        </span>
        <span className="funds-gate-text">
          <span className="funds-gate-name">{t.committeeName}</span>
          <span className="funds-gate-action">{t.fundsGateAction}</span>
        </span>
      </button>
    </section>
  );
};

export default FundsGate;
