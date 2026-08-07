import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { useAuth } from '../contexts/AuthContext';
import { requestOtp, verifyOtp } from '../utils/authService';
import logoImg from '../assets/logo.png';
import './AuthPages.css';

const mmss = (s) => {
  const m = Math.floor(Math.max(0, s) / 60);
  const r = Math.max(0, s) % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
};

// Step 2: the code that was emailed. Two clocks run here — how long the code
// stays valid (5 min) and how long until it can be resent (1 min). Both are
// mirrors of limits the server enforces; the display is a courtesy, not the
// control.
const OtpPage = () => {
  const { language } = useLanguage();
  const t = translations[language];
  const navigate = useNavigate();
  const { state } = useLocation();
  const { signIn } = useAuth();

  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [validFor, setValidFor] = useState(state ? state.expiresInSec || 300 : 0);
  const [resendIn, setResendIn] = useState(state ? state.resendInSec || 60 : 0);
  const [notice, setNotice] = useState('');
  const boxes = useRef([]);

  // Landing here directly (a refresh, or a pasted URL) means there is no
  // pending code — start again rather than show a form that cannot work.
  useEffect(() => {
    if (!state || !state.mobile) navigate('/funds', { replace: true });
  }, [state, navigate]);

  useEffect(() => { boxes.current[0]?.focus(); }, []);

  // One interval drives both clocks, so they can never drift apart.
  useEffect(() => {
    const id = setInterval(() => {
      setValidFor((v) => (v > 0 ? v - 1 : 0));
      setResendIn((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const code = digits.join('');
  const expired = validFor <= 0;

  const setDigit = (i, value) => {
    const d = value.replace(/\D/g, '');
    setError('');
    if (!d) {
      setDigits((cur) => cur.map((c, n) => (n === i ? '' : c)));
      return;
    }
    // Typing or pasting several digits fills the boxes to the right.
    setDigits((cur) => {
      const next = [...cur];
      d.split('').forEach((ch, k) => { if (i + k < 6) next[i + k] = ch; });
      return next;
    });
    const land = Math.min(5, i + d.length);
    boxes.current[land]?.focus();
  };

  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) boxes.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i > 0) boxes.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) boxes.current[i + 1]?.focus();
  };

  const submit = useCallback(async (value) => {
    if (busy || value.length !== 6) return;
    setBusy(true);
    setNotice('');
    const res = await verifyOtp(state.mobile, value);
    setBusy(false);

    if (!res.ok) {
      setError(res.attemptsLeft != null
        ? `${res.error} ${t.authAttemptsLeft.replace('{n}', res.attemptsLeft)}`
        : res.error);
      setDigits(['', '', '', '', '', '']);
      boxes.current[0]?.focus();
      if (res.code === 'OTP_EXPIRED' || res.code === 'TOO_MANY_ATTEMPTS') setValidFor(0);
      return;
    }

    signIn({ token: res.token, member: res.member, expiresInMin: res.expiresInMin });
    navigate('/admin', { replace: true });
  }, [busy, state, signIn, navigate, t]);

  // Submit as soon as the sixth digit lands — nobody wants to hunt for a button.
  useEffect(() => {
    if (code.length === 6 && !busy && !expired) submit(code);
  }, [code, busy, expired, submit]);

  const resend = async () => {
    if (resendIn > 0 || busy) return;
    setBusy(true);
    setError('');
    const res = await requestOtp(state.mobile);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      if (res.retryInSec) setResendIn(res.retryInSec);
      return;
    }
    setDigits(['', '', '', '', '', '']);
    setValidFor(res.expiresInSec || 300);
    setResendIn(res.resendInSec || 60);
    setNotice(t.authResent);
    boxes.current[0]?.focus();
  };

  if (!state || !state.mobile) return null;

  return (
    <main className="auth-page">
      <div className="auth-card">
        <span className="auth-emblem">
          <img src={logoImg} alt="" />
        </span>

        <h1 className="auth-committee">{t.committeeName}</h1>
        <h2 className="auth-title">{t.fundsTitle}</h2>

        <p className="auth-greeting">
          {t.authHello.replace('{name}', state.name || '')} <span aria-hidden="true">🤝</span>
        </p>
        <p className="auth-helper">
          {t.authSentTo} <b className="auth-email">{state.maskedEmail}</b>
        </p>

        <div className="auth-otp-row" role="group" aria-label={t.authOtpLabel}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { boxes.current[i] = el; }}
              className={`auth-otp-box${error ? ' is-error' : ''}`}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={6}
              value={d}
              disabled={expired || busy}
              aria-label={`${t.authOtpLabel} ${i + 1}`}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
            />
          ))}
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}
        {notice && !error && <p className="auth-notice" role="status">{notice}</p>}

        <p className={`auth-timer${expired ? ' is-expired' : ''}`}>
          {expired
            ? t.authCodeExpired
            : t.authValidFor.replace('{time}', mmss(validFor))}
        </p>

        <button
          type="button"
          className="auth-resend"
          onClick={resend}
          disabled={resendIn > 0 || busy}
        >
          {resendIn > 0
            ? t.authResendIn.replace('{time}', mmss(resendIn))
            : t.authResend}
        </button>

        <button type="button" className="auth-back" onClick={() => navigate('/funds', { replace: true })}>
          ← {t.authUseDifferentNumber}
        </button>
      </div>
    </main>
  );
};

export default OtpPage;
