import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Toasts — the portal's answer to "did that work?"
//
// Top right, auto-dismissed after 5s, dismissable by hand. Errors linger
// longer than successes: a success is confirmation you can glance at and
// forget, while an error usually says something you need to read and act on.
//
//   const toast = useToast();
//   toast.success('Photo uploaded');
//   toast.error('Could not delete', 'The gallery service did not respond.');
// ---------------------------------------------------------------------------

const ToastContext = createContext(null);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
       strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const BangIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
       strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 7v6" /><path d="M12 17h.01" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const SUCCESS_MS = 4000;
const ERROR_MS = 8000;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);
  const timers = useRef(new Map());

  const remove = useCallback((id) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((type, title, desc, duration) => {
    seq.current += 1;
    const id = seq.current;
    setToasts((list) => [...list, { id, type, title, desc }]);
    timers.current.set(id, setTimeout(() => remove(id), duration));
    return id;
  }, [remove]);

  // Held in a ref so the value never changes identity — otherwise every
  // consumer re-renders whenever a toast appears or leaves.
  const api = useRef({
    success: (title, desc) => push('success', title, desc, SUCCESS_MS),
    error: (title, desc) => push('error', title, desc, ERROR_MS),
    info: (title, desc) => push('info', title, desc, SUCCESS_MS),
  }).current;

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* aria-live so a screen reader hears the outcome too — the whole point
          of a toast is that it is the only confirmation there is. */}
      <div className="toast-stack" role="region" aria-live="polite">
        {toasts.map((t) => (
          <div className={`toast toast-${t.type}`} key={t.id}>
            <span className="toast-icon">
              {t.type === 'success' ? <CheckIcon /> : <BangIcon />}
            </span>
            <div className="toast-body">
              <b>{t.title}</b>
              {t.desc && <span>{t.desc}</span>}
            </div>
            <button className="toast-close" onClick={() => remove(t.id)} aria-label="Dismiss">
              <CloseIcon />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside a ToastProvider');
  return ctx;
};
