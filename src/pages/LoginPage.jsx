import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { requestOtp, makeCaptcha, isAuthConfigured } from '../utils/authService';
import logoImg from '../assets/logo.png';
import './AuthPages.css';
import { useCopyGuard } from '../components/useCopyGuard';

// Step 1 of the funds gate: prove you are human, then prove the mobile is on
// the committee list. Only after both does the server email a code.
const LoginPage = () => {
  // The sign-in screens are public too — see useCopyGuard.
  useCopyGuard();

  const { language } = useLanguage();
  const t = translations[language];
  const navigate = useNavigate();

  const [mobile, setMobile] = useState('');
  const [captcha, setCaptcha] = useState(makeCaptcha);
  const [captchaInput, setCaptchaInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const newCaptcha = useCallback(() => {
    setCaptcha(makeCaptcha());
    setCaptchaInput('');
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;

    // The captcha is checked here, before anything leaves the browser — a
    // wrong one should never cost a lookup or an email.
    if (captchaInput.trim() !== captcha) {
      setError(t.authCaptchaWrong);
      newCaptcha();
      return;
    }
    const digits = mobile.replace(/\D/g, '');
    if (digits.length !== 10) {
      setError(t.authMobileInvalid);
      return;
    }

    setBusy(true);
    // One call either way. The server decides from the member's bypass_in
    // whether to email a code or wave them through, and says which in the
    // reply — the page never has to know in advance.
    const res = await requestOtp(digits);
    setBusy(false);

    if (!res.ok) {
      setError(res.error);
      newCaptcha();          // never let a failed attempt be retried for free
      return;
    }

    // The code itself never comes back — only who it went to, masked.
    navigate('/funds/verify', {
      replace: true,
      state: {
        mobile: digits,
        name: res.name,
        maskedEmail: res.maskedEmail,
        expiresInSec: res.expiresInSec,
        resendInSec: res.resendInSec,
        bypass: Boolean(res.bypass),
      },
    });
  };

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit} noValidate>
        <span className="auth-emblem">
          <img src={logoImg} alt="" />
        </span>

        <h1 className="auth-committee">{t.committeeName}</h1>
        <h2 className="auth-title">{t.fundsTitle}</h2>
        <p className="auth-helper">{t.fundsHelper}</p>

        {!isAuthConfigured() && (
          <p className="auth-error" role="alert">{t.authNotConfigured}</p>
        )}

        <label className="auth-field">
          <span className="auth-label">{t.authMobileLabel}</span>
          <input
            className="auth-input"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={10}
            placeholder={t.authMobilePlaceholder}
            value={mobile}
            onChange={(e) => {
              setError('');   // clear on typing, not in an effect: newCaptcha()
              setMobile(e.target.value.replace(/\D/g, '').slice(0, 10));
            }}
          />
        </label>

        <div className="auth-field">
          <span className="auth-label">{t.authCaptchaLabel}</span>
          <div className="auth-captcha-row">
            {/* Not an image: the digits are spaced and skewed in CSS, which is
                readable to a screen reader and enough of a nuisance for a bot,
                without shipping a canvas. */}
            <span className="auth-captcha" aria-label={`${t.authCaptchaLabel}: ${captcha.split('').join(' ')}`}>
              {captcha.split('').map((d, i) => (
                <i key={i} className={`auth-captcha-d d${i % 4}`}>{d}</i>
              ))}
            </span>
            <button
              type="button"
              className="auth-captcha-refresh"
              onClick={newCaptcha}
              aria-label={t.authCaptchaRefresh}
              title={t.authCaptchaRefresh}
            >
              ↻
            </button>
            <input
              className="auth-input auth-input-captcha"
              type="text"
              inputMode="numeric"
              maxLength={4}
              placeholder="••••"
              value={captchaInput}
              onChange={(e) => {
                // ...also resets this field, and an effect here would erase the
                // error message that told the visitor why they are back at it.
                setError('');
                setCaptchaInput(e.target.value.replace(/\D/g, '').slice(0, 4));
              }}
            />
          </div>
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? t.authSending : t.authVerifySendOtp}
        </button>

        <button type="button" className="auth-back" onClick={() => navigate('/')}>
          ← {t.authBackToSite}
        </button>
      </form>
    </main>
  );
};

export default LoginPage;
